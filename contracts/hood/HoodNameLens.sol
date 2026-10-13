// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ENS} from "../registry/ENS.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {IAddrResolver} from "../resolvers/profiles/IAddrResolver.sol";
import {HoodBaseRegistrar} from "./HoodBaseRegistrar.sol";
import {HoodResolverPolicy} from "./HoodResolverPolicy.sol";
import {HoodNameGuard} from "./HoodNameGuard.sol";

/// @title HoodNameLens
/// @notice Everything a wallet needs to decide whether it is safe to send to
///         a name, in one read. Holds no state and has no privileges.
///
/// Advisory: it describes the name. The address to pay always comes from the
/// universal resolver, which also handles custom and wildcard resolvers.
///
/// The measured failure of ENS-style names is that wallets send to a name
/// without knowing it has expired or just changed hands. This puts those
/// facts in front of the wallet so it can warn or refuse.
contract HoodNameLens {
    enum State {
        Available, // never registered, or released after its grace period
        Active,
        Grace, // expired, renewable by anyone, does not resolve
        Reserved, // withheld from public registration and not issued
        Invalid, // not a registrable label
        Similar // free, but looks like a live name, so it cannot be registered
    }

    struct Status {
        bytes32 labelhash;
        bytes32 node;
        State state;
        uint256 expires;
        /// Current holder: the NFT holder, or the wrapped-token holder.
        address holder;
        bool wrapped;
        /// Who controls the records (normally the holder).
        address manager;
        /// When the holder received the name. Zero for a wrapped name, where
        /// it is not tracked: treat that as "unknown", not as "long held".
        uint256 heldSince;
        address resolver;
        /// Whether the resolver may answer for this name under the policy.
        bool resolverAllowed;
        /// True if the resolver is one the owner approved, not a trusted one.
        /// Its answer is not read here; resolve through the universal resolver.
        bool customResolver;
        /// Address the name pays to, or zero if it does not resolve or uses
        /// a custom resolver.
        address resolvedAddress;
    }

    ENS public immutable ens;
    HoodBaseRegistrar public immutable registrar;
    INameWrapper public immutable nameWrapper;
    HoodResolverPolicy public immutable policy;
    HoodNameGuard public immutable guard;
    bytes32 public immutable baseNode;

    constructor(
        ENS _ens,
        HoodBaseRegistrar _registrar,
        INameWrapper _nameWrapper,
        HoodResolverPolicy _policy,
        HoodNameGuard _guard
    ) {
        ens = _ens;
        registrar = _registrar;
        nameWrapper = _nameWrapper;
        policy = _policy;
        guard = _guard;
        baseNode = _registrar.baseNode();
    }

    function status(string calldata label) external view returns (Status memory s) {
        s.labelhash = keccak256(bytes(label));
        s.node = keccak256(abi.encodePacked(baseNode, s.labelhash));
        uint256 id = uint256(s.labelhash);
        s.expires = registrar.nameExpires(id);
        if (!guard.valid(label)) {
            s.state = State.Invalid;
            return s;
        }

        if (s.expires > block.timestamp) {
            s.state = State.Active;
        } else if (s.expires != 0 && !registrar.available(id)) {
            s.state = State.Grace;
        } else if (guard.isReserved(label)) {
            s.state = State.Reserved;
        } else if (guard.similarTo(label) != bytes32(0)) {
            s.state = State.Similar;
        } else {
            s.state = State.Available;
        }
        if (s.state != State.Active) return s;

        s.holder = registrar.ownerOf(id);
        if (s.holder == address(nameWrapper)) {
            s.wrapped = true;
            s.holder = nameWrapper.ownerOf(uint256(s.node));
        }
        s.manager = policy.nameOwner(s.node);
        s.heldSince = s.wrapped ? 0 : registrar.heldSince(id);
        s.resolver = ens.resolver(s.node);
        s.resolverAllowed =
            s.resolver != address(0) &&
            policy.isAllowed(s.node, s.resolver);

        s.customResolver =
            s.resolverAllowed &&
            !policy.trustedResolvers(s.resolver);

        if (s.resolverAllowed && !s.customResolver && s.resolver.code.length != 0) {
            (bool ok, bytes memory ret) = s.resolver.staticcall{gas: 100_000}(
                abi.encodeCall(IAddrResolver.addr, (s.node))
            );
            if (ok && ret.length == 32) {
                uint256 value = abi.decode(ret, (uint256));
                if (value <= type(uint160).max)
                    s.resolvedAddress = address(uint160(value));
            }
        }
    }
}
