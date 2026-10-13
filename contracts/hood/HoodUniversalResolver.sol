// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AbstractUniversalResolver, IGatewayProvider} from "../universalResolver/AbstractUniversalResolver.sol";
import {RegistryUtils, ENS} from "../universalResolver/RegistryUtils.sol";
import {ReverseClaimer} from "../reverseRegistrar/ReverseClaimer.sol";
import {NameCoder} from "../utils/NameCoder.sol";
import {IBaseRegistrar} from "../ethregistrar/IBaseRegistrar.sol";
import {HoodResolverPolicy} from "./HoodResolverPolicy.sol";

/// @title HoodUniversalResolver
/// @notice The ENS UniversalResolver with two changes:
///         1. a name whose registration has expired does not resolve,
///            forwards or in reverse;
///         2. a name is only answered by a resolver the policy allows: a
///            trusted resolver, or one the name's current owner approved;
///         3. a subname is only answered while the current owner of the
///            registrable name above it has approved it.
///
/// In stock ENS a lapsed name keeps resolving through its grace period and
/// beyond, so wallets go on sending funds to an address whose owner may no
/// longer hold the name. Here a name stops resolving the moment it expires
/// and starts again if it is renewed. Subnames stop with their parent.
///
/// This applies to `resolve` and `reverse`, which is what SDKs and wallets
/// use. A client that reads a resolver contract directly, or names the
/// resolver itself through `resolveWithResolver`, bypasses it and must check
/// expiry itself.
contract HoodUniversalResolver is AbstractUniversalResolver, ReverseClaimer {
    ENS public immutable registry;
    IBaseRegistrar public immutable registrar;
    HoodResolverPolicy public immutable policy;
    /// @notice Namehash of the parent name that registrations sit under.
    bytes32 public immutable baseNode;

    constructor(
        address owner,
        ENS ens,
        IBaseRegistrar _registrar,
        HoodResolverPolicy _policy,
        bytes32 _baseNode,
        IGatewayProvider batchGatewayProvider
    )
        AbstractUniversalResolver(batchGatewayProvider)
        ReverseClaimer(ens, owner)
    {
        registry = ens;
        registrar = _registrar;
        policy = _policy;
        baseNode = _baseNode;
    }

    /// @inheritdoc AbstractUniversalResolver
    function findResolver(
        bytes memory name
    ) public view override returns (address resolver, bytes32 node, uint256 offset) {
        (resolver, node, offset) = RegistryUtils.findResolver(registry, name, 0);
        if (resolver == address(0)) return (resolver, node, offset);

        (bool under, bytes32 labelhash, bool isSubname) = _locate(name);
        // The resolver belongs to the name at `offset`: the name itself or
        // the nearest ancestor that has one.
        if (!policy.isAllowed(NameCoder.namehash(name, offset), resolver))
            return (address(0), node, offset);
        if (!under) return (resolver, node, offset);

        // Same boundary as the registrar: a name is owned while expiry > now.
        if (registrar.nameExpires(uint256(labelhash)) <= block.timestamp)
            return (address(0), node, offset);
        // A subname answers only while the current owner of the registrable
        // name above it has approved it.
        if (
            isSubname &&
            !policy.isSubnameLive(NameCoder.namehash(baseNode, labelhash), node)
        ) return (address(0), node, offset);
    }

    /// @notice True if `name` (DNS-encoded) is, or sits under, a registrable
    ///         name of this service that is not currently registered.
    function isLapsed(bytes memory name) public view returns (bool) {
        (bool under, bytes32 labelhash, ) = _locate(name);
        return under && registrar.nameExpires(uint256(labelhash)) <= block.timestamp;
    }

    /// @dev Finds the registrable label `name` is or sits under.
    /// @return under True if the name is at or below a registrable name.
    /// @return labelhash That registrable label.
    /// @return isSubname True if the name is below it, not the name itself.
    function _locate(
        bytes memory name
    ) internal view returns (bool under, bytes32 labelhash, bool isSubname) {
        // Collect the labelhashes left to right, then fold from the right so
        // each suffix is hashed once. The registrable label is the one whose
        // suffix is exactly the parent name.
        uint256 count;
        uint256 offset;
        while (true) {
            (bytes32 h, uint256 next) = NameCoder.readLabel(name, offset);
            if (h == bytes32(0)) break;
            count++;
            offset = next;
        }
        bytes32[] memory hashes = new bytes32[](count);
        offset = 0;
        for (uint256 i = 0; i < count; i++) {
            (hashes[i], offset) = NameCoder.readLabel(name, offset);
        }
        bytes32 suffix; // namehash of the labels to the right of position i
        for (uint256 i = count; i > 0; i--) {
            if (suffix == baseNode && i < count)
                return (true, hashes[i - 1], i > 1);
            suffix = NameCoder.namehash(suffix, hashes[i - 1]);
        }
    }
}
