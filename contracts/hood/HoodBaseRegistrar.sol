// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {BaseRegistrarImplementation} from "../ethregistrar/BaseRegistrarImplementation.sol";
import {ENS} from "../registry/ENS.sol";
import {HoodResolverPolicy} from "./HoodResolverPolicy.sol";

/// @title HoodBaseRegistrar
/// @notice The ENS base registrar with one change: when a name's NFT moves
///         to a new holder, control of the name moves with it.
///
/// In stock ENS the NFT and the registry entry are separate. After a sale the
/// seller still controls the name, and it keeps resolving to the seller's
/// address, until the buyer calls `reclaim` and rewrites the records. Buyers
/// routinely miss that step.
///
/// Here the recipient becomes the registry owner in the same transaction.
/// HoodPublicResolver stores records per owner, so the recipient also gets a
/// name with no inherited records. If the name pointed at a resolver the
/// policy does not allow, it is switched to the default resolver.
///
/// A consequence: the "manager" of a name (the registry owner) can differ
/// from the NFT holder only until the NFT next moves. `reclaim` still lets a
/// holder appoint a manager, and the manager keeps its own set of records.
///
/// No contract other than the registry and the policy is called during a
/// transfer.
///
/// Not covered: subnames created under a name stay with whoever owns them.
/// The new owner of the parent can reassign each one, but must know it exists.
contract HoodBaseRegistrar is BaseRegistrarImplementation {
    /// @notice Resolver policy, or zero to leave resolvers untouched on transfer.
    HoodResolverPolicy public policy;

    /// @notice When the current holder received the name. Lets wallets warn
    ///         before sending to a name that changed hands recently. Updated
    ///         on registration, transfer and unwrap; not on transfers of the
    ///         wrapped token, which this contract does not see.
    mapping(uint256 => uint256) public heldSince;

    event ControlTransferred(
        uint256 indexed id,
        address indexed from,
        address indexed to
    );
    event PolicyChanged(address indexed policy);

    constructor(
        ENS _ens,
        bytes32 _baseNode
    ) BaseRegistrarImplementation(_ens, _baseNode) {}

    function setPolicy(HoodResolverPolicy _policy) external onlyOwner {
        policy = _policy;
        emit PolicyChanged(address(_policy));
    }

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        super._afterTokenTransfer(from, to, tokenId, batchSize);

        if (to != address(0) && from != to && !controllers[to])
            heldSince[tokenId] = block.timestamp;

        // Mints and burns are registrations, handled by the controller.
        if (from == address(0) || to == address(0) || from == to) return;
        // A controller receiving a name (wrapping) sets the registry itself.
        if (controllers[to]) return;
        // If the TLD has been moved to another registrar, do not block transfers.
        if (ens.owner(baseNode) != address(this)) return;

        bytes32 label = bytes32(tokenId);

        if (controllers[from]) {
            // Leaving a controller: a fresh registration, or an unwrap. Make
            // sure the holder, and nobody else, ends up in control. The
            // resolver was chosen in that same operation and is left as is.
            ens.setSubnodeOwner(baseNode, label, to);
        } else {
            bytes32 node = keccak256(abi.encodePacked(baseNode, label));
            address resolver = ens.resolver(node);
            HoodResolverPolicy _policy = policy;
            // Judged before the owner changes, so the outgoing owner's own
            // approval of a custom resolver does not carry over.
            if (
                address(_policy) != address(0) &&
                !_policy.trustedResolvers(resolver)
            ) resolver = _policy.defaultResolver();
            ens.setSubnodeRecord(baseNode, label, to, resolver, 0);
        }

        emit ControlTransferred(tokenId, from, to);
    }
}
