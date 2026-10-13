// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ENS} from "../registry/ENS.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {HoodBaseRegistrar} from "./HoodBaseRegistrar.sol";
import {HoodNameRules} from "./HoodNameRules.sol";
import {HoodResolverPolicy} from "./HoodResolverPolicy.sol";

/// @title HoodNameGuard
/// @notice Keeps the two facts that stop names being imitated, and outlives
///         any one registrar controller:
///          - which skeletons are reserved (brands, tickers, support terms,
///            and with them everything that looks like one);
///          - which label currently holds each skeleton, so that a lookalike
///            of a live name cannot be registered.
///
/// A registrar controller asks `admit` before issuing a name. Because the
/// state lives here, replacing the controller does not lose it.
contract HoodNameGuard is Ownable2Step {
    HoodNameRules public immutable rules;
    HoodBaseRegistrar public immutable base;
    ENS public immutable ens;
    bytes32 public immutable baseNode;

    mapping(address => bool) public controllers;

    /// @notice Number of reserved labels sharing each skeleton. A skeleton
    ///         is reserved while this is above zero.
    mapping(bytes32 => uint256) public reservations;
    /// @notice Labels (by labelhash) on the reserved list.
    mapping(bytes32 => bool) public labelReserved;
    /// @notice The label (as a labelhash) that last took each skeleton.
    mapping(bytes32 => bytes32) public skeletonHolder;

    error NotController();
    error NameNotAvailable(string name);
    error NameReserved(string name);
    error NameNotReserved(string name);
    error NameTooSimilar(string name, bytes32 existingLabelhash);
    error InvalidLabel(string name);

    event ControllerChanged(address indexed controller, bool enabled);
    event ReservedChanged(bytes32 indexed skeletonHash, string label, bool reserved);
    /// @notice A label was reserved while a lookalike of it is registered.
    ///         The reservation only takes effect once that name lapses.
    event ReservedWhileHeld(
        bytes32 indexed skeletonHash,
        string label,
        bytes32 holderLabelhash
    );
    event SkeletonTaken(bytes32 indexed skeletonHash, bytes32 indexed labelhash);

    constructor(HoodNameRules _rules, HoodBaseRegistrar _base, ENS _ens) {
        rules = _rules;
        base = _base;
        ens = _ens;
        baseNode = _base.baseNode();
    }

    /* Admin */

    function setController(address controller, bool enabled) external onlyOwner {
        controllers[controller] = enabled;
        emit ControllerChanged(controller, enabled);
    }

    /// @notice Reserves or releases labels. Reserving a label reserves its
    ///         skeleton, so its lookalikes are reserved with it. Repeating a
    ///         call changes nothing, and releasing one label leaves a
    ///         skeleton reserved while another reserved label shares it.
    function setReservedLabels(
        string[] calldata labels,
        bool reserve
    ) external onlyOwner {
        for (uint256 i = 0; i < labels.length; i++) {
            (bool ok, bytes32 skel, , ) = rules.check(labels[i]);
            if (!ok) revert InvalidLabel(labels[i]);
            bytes32 labelhash = keccak256(bytes(labels[i]));
            if (labelReserved[labelhash] == reserve) continue;
            labelReserved[labelhash] = reserve;
            if (reserve) {
                reservations[skel] += 1;
                bytes32 holder = _blockingHolder(skel, bytes32(0));
                if (holder != bytes32(0))
                    emit ReservedWhileHeld(skel, labels[i], holder);
            } else {
                reservations[skel] -= 1;
            }
            emit ReservedChanged(skel, labels[i], reserve);
        }
    }

    /* Views */

    /// @notice True if the label is well-formed under the name rules.
    function valid(string calldata label) external view returns (bool ok) {
        (ok, , , ) = rules.check(label);
    }

    /// @notice True if the label, or anything that looks like it, is reserved.
    function isReserved(string calldata label) external view returns (bool) {
        (bool ok, bytes32 skel, , ) = rules.check(label);
        return ok && reservations[skel] != 0;
    }

    /// @notice The labelhash of a live name that `label` looks like, or zero.
    function similarTo(string calldata label) external view returns (bytes32) {
        (bool ok, bytes32 skel, , ) = rules.check(label);
        if (!ok) return bytes32(0);
        return _blockingHolder(skel, keccak256(bytes(label)));
    }

    /// @notice True if the label is well-formed, not reserved, not currently
    ///         registered, and does not look like a name that is.
    function available(string calldata label) external view returns (bool) {
        bytes32 labelhash = keccak256(bytes(label));
        (bool ok, bytes32 skel, , ) = rules.check(label);
        return
            ok &&
            reservations[skel] == 0 &&
            base.available(uint256(labelhash)) &&
            _blockingHolder(skel, labelhash) == bytes32(0);
    }

    /// @notice What a label is priced on.
    /// @return priceLength Length of the shortest name with the same look.
    /// @return premiumExpiry The expiry the release premium is measured
    ///         from: the later of this label's own last expiry and that of
    ///         the label that last held its skeleton. A lookalike of a name
    ///         that has just been released pays the same premium the name
    ///         itself would.
    function pricing(
        string calldata label
    ) external view returns (uint256 priceLength, uint256 premiumExpiry) {
        bytes32 skel;
        (, skel, , priceLength) = rules.check(label);
        premiumExpiry = _premiumExpiry(skel, keccak256(bytes(label)));
    }

    /// @notice The address that would earn commission for a referrer
    ///         labelhash, or zero. The referrer's name must be unexpired and
    ///         resolve, through a resolver the policy allows, to an address.
    function referrerPayee(bytes32 referrer) external view returns (address) {
        if (referrer == bytes32(0)) return address(0);
        if (base.nameExpires(uint256(referrer)) <= block.timestamp)
            return address(0);

        bytes32 node = keccak256(abi.encodePacked(baseNode, referrer));
        address resolver = ens.resolver(node);
        if (resolver.code.length == 0) return address(0);
        HoodResolverPolicy policy = base.policy();
        if (address(policy) != address(0) && !policy.isAllowed(node, resolver))
            return address(0);

        // Low-level call so that a resolver which reverts, returns nothing or
        // returns garbage cannot block registrations that name this referrer.
        (bool ok, bytes memory ret) = resolver.staticcall{gas: 50_000}(
            abi.encodeCall(IAddrResolver.addr, (node))
        );
        if (!ok || ret.length != 32) return address(0);
        uint256 value = abi.decode(ret, (uint256));
        if (value > type(uint160).max) return address(0);
        return address(uint160(value));
    }

    /// @notice The resolver new and transferred names default to, or zero.
    function defaultResolver() external view returns (address) {
        HoodResolverPolicy policy = base.policy();
        return address(policy) == address(0) ? address(0) : policy.defaultResolver();
    }

    /* Controller entry point */

    /// @notice Checks that `label` may be registered and takes its skeleton.
    /// @param reservedPath True when the owner is issuing a reserved name.
    function admit(
        string calldata label,
        bytes32 labelhash,
        bool reservedPath
    ) external returns (uint256 priceLength, uint256 premiumExpiry) {
        if (!controllers[msg.sender]) revert NotController();

        bool ok;
        bytes32 skel;
        (ok, skel, , priceLength) = rules.check(label);
        if (!ok || !base.available(uint256(labelhash)))
            revert NameNotAvailable(label);
        if ((reservations[skel] != 0) != reservedPath) {
            if (reservedPath) revert NameNotReserved(label);
            revert NameReserved(label);
        }
        bytes32 holder = _blockingHolder(skel, labelhash);
        if (holder != bytes32(0)) revert NameTooSimilar(label, holder);

        premiumExpiry = _premiumExpiry(skel, labelhash);
        skeletonHolder[skel] = labelhash;
        emit SkeletonTaken(skel, labelhash);
    }

    /* Internal */

    /// @dev The other label, if any, that holds this skeleton and is still
    ///      registered or in its grace period.
    function _blockingHolder(
        bytes32 skel,
        bytes32 labelhash
    ) internal view returns (bytes32) {
        bytes32 holder = skeletonHolder[skel];
        if (
            holder == bytes32(0) ||
            holder == labelhash ||
            base.available(uint256(holder))
        ) return bytes32(0);
        return holder;
    }

    function _premiumExpiry(
        bytes32 skel,
        bytes32 labelhash
    ) internal view returns (uint256 expiry) {
        expiry = base.nameExpires(uint256(labelhash));
        bytes32 holder = skeletonHolder[skel];
        if (holder != bytes32(0) && holder != labelhash) {
            uint256 other = base.nameExpires(uint256(holder));
            if (other > expiry) expiry = other;
        }
    }
}
