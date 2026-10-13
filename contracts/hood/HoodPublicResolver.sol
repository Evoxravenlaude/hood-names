// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {PublicResolver} from "../resolvers/PublicResolver.sol";
import {ENS} from "../registry/ENS.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";

/// @title HoodPublicResolver
/// @notice The ENS PublicResolver with one change: records belong to the
///         (name, owner) pair instead of to the name alone.
///
/// In stock ENS a name's records outlive its owner. Whoever gets the name
/// next, by buying it, by re-registering it after expiry or by being handed
/// a wrapped token, inherits records that still point at the previous owner
/// until they notice and overwrite every one.
///
/// Here every record is stored under a key that includes the name's current
/// owner (the registry owner, or the wrapped-token holder for wrapped names).
/// When the owner changes, the new owner sees an empty name. Nothing has to
/// be cleared, so there is no clean-up step to forget or to sabotage. It
/// holds for sales, wrapped-token transfers, wrapping or unwrapping to
/// someone else, and re-registration after expiry.
///
/// "Owner" here is whoever controls the name in the registry. A contract
/// that holds names for several people and writes records on their behalf
/// (a vault or a custom wrapper) is one owner as far as this resolver can
/// tell, and must call `clearRecords` itself when a name changes depositor.
///
/// If a name returns to an earlier owner, that owner's own records come back.
/// So moving a name through a vault or escrow contract hides its records
/// while it is away and restores them on return.
///
/// The ABI is unchanged. `clearRecords` still wipes the current owner's records.
contract HoodPublicResolver is PublicResolver {
    ENS private immutable _registry;
    INameWrapper private immutable _wrapper;

    constructor(
        ENS ens_,
        INameWrapper wrapper_,
        address trustedController,
        address trustedReverseRegistrar_
    ) PublicResolver(ens_, wrapper_, trustedController, trustedReverseRegistrar_) {
        _registry = ens_;
        _wrapper = wrapper_;
    }

    /// @notice The address whose records are currently shown for `node`.
    function recordOwner(bytes32 node) public view returns (address owner) {
        owner = _registry.owner(node);
        if (owner == address(_wrapper)) owner = _wrapper.ownerOf(uint256(node));
    }

    function _recordKey(bytes32 node) internal view override returns (uint256) {
        return
            uint256(
                keccak256(abi.encode(recordVersions[node], recordOwner(node)))
            );
    }
}
