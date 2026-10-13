// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ENS} from "../registry/ENS.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";

/// @title HoodResolverPolicy
/// @notice Decides which resolver a name is allowed to be answered by.
///
/// A resolver is honoured for a name if either:
///  - it is a trusted resolver (the public resolver and its successors), or
///  - the name's current owner has approved that resolver for that name.
///
/// Why: a resolver is arbitrary code. In stock ENS the resolver pointer
/// survives a change of owner, so a seller can leave a name pointing at a
/// custom resolver that keeps answering with the seller's address. Under
/// this policy an approval belongs to the owner who gave it, so it lapses
/// the moment the name changes hands, however that happens.
///
/// Anyone using a custom resolver makes one extra call, `approveResolver`.
contract HoodResolverPolicy is Ownable2Step {
    ENS public immutable ens;
    INameWrapper public immutable nameWrapper;

    mapping(address => bool) public trustedResolvers;
    /// @notice Resolver given to a transferred name whose resolver is not allowed.
    address public defaultResolver;
    /// @notice node => owner => resolver that owner approved for the node.
    mapping(bytes32 => mapping(address => address)) public approvedResolver;

    /// @notice subnode => owner of the registrable name above it => what
    ///         that owner approved: a hash of the subname's owner and
    ///         resolver at the time, or zero for no approval.
    mapping(bytes32 => mapping(address => bytes32)) public subnameApproval;

    error NotNameOwner();
    error DefaultNotTrusted();

    event TrustedResolverChanged(address indexed resolver, bool trusted);
    event DefaultResolverChanged(address indexed resolver);
    event SubnameApproved(
        bytes32 indexed subnode,
        address indexed owner,
        bool approved
    );
    event ResolverApproved(
        bytes32 indexed node,
        address indexed owner,
        address indexed resolver
    );

    constructor(ENS _ens, INameWrapper _nameWrapper) {
        ens = _ens;
        nameWrapper = _nameWrapper;
    }

    function setTrustedResolver(address resolver, bool trusted) external onlyOwner {
        trustedResolvers[resolver] = trusted;
        emit TrustedResolverChanged(resolver, trusted);
    }

    function setDefaultResolver(address resolver) external onlyOwner {
        // An untrusted default would make every transferred name unresolvable.
        if (resolver != address(0) && !trustedResolvers[resolver])
            revert DefaultNotTrusted();
        defaultResolver = resolver;
        emit DefaultResolverChanged(resolver);
    }

    /// @notice The address that currently owns `node`: the registry owner, or
    ///         the wrapped-token holder for a wrapped name.
    function nameOwner(bytes32 node) public view returns (address owner) {
        owner = ens.owner(node);
        if (owner == address(nameWrapper))
            owner = nameWrapper.ownerOf(uint256(node));
    }

    /// @notice Approves a custom resolver for a name you own. Pass the zero
    ///         address to withdraw the approval.
    function approveResolver(bytes32 node, address resolver) external {
        if (nameOwner(node) != msg.sender) revert NotNameOwner();
        approvedResolver[node][msg.sender] = resolver;
        emit ResolverApproved(node, msg.sender, resolver);
    }

    /// @notice Approves or withdraws names below a name the caller owns.
    ///
    /// A subname resolves only while the current owner of the registrable
    /// name above it has approved it. Without this, subnames a previous
    /// owner created (pay.alice, support.alice) would go on resolving, and
    /// working as primary names, under a name that now belongs to someone
    /// else, including after expiry and re-registration, and including
    /// wrapped subnames the new owner cannot remove.
    ///
    /// The approval is recorded against the caller, so it only counts while
    /// the caller is the owner of the name above. No check is made that the
    /// subnodes sit under a name the caller owns: an approval by anyone else
    /// is simply never consulted.
    ///
    /// What is approved is the subname as it stands: its current owner and
    /// resolver. If either changes, the approval stops counting until it is
    /// given again. So if the name above is sold, or lapses and is taken by
    /// someone else, and later comes back to the caller, nothing the owner
    /// in between did to the subname can resolve on the old approval.
    /// Create the subname and set its resolver first, then approve it.
    function approveSubnames(bytes32[] calldata subnodes, bool approved) external {
        for (uint256 i = 0; i < subnodes.length; i++) {
            subnameApproval[subnodes[i]][msg.sender] = approved
                ? _subnameState(subnodes[i])
                : bytes32(0);
            emit SubnameApproved(subnodes[i], msg.sender, approved);
        }
    }

    /// @notice True if `subnode`, with its present owner and resolver, is
    ///         approved by the current owner of `parent`, the registrable
    ///         name it sits under.
    function isSubnameLive(bytes32 parent, bytes32 subnode) public view returns (bool) {
        address owner = nameOwner(parent);
        if (owner == address(0)) return false;
        bytes32 approval = subnameApproval[subnode][owner];
        return approval != bytes32(0) && approval == _subnameState(subnode);
    }

    function _subnameState(bytes32 subnode) internal view returns (bytes32) {
        return keccak256(abi.encode(nameOwner(subnode), ens.resolver(subnode)));
    }

    /// @notice True if `resolver` may answer for `node` right now.
    function isAllowed(bytes32 node, address resolver) public view returns (bool) {
        if (trustedResolvers[resolver]) return true;
        address owner = nameOwner(node);
        return owner != address(0) && approvedResolver[node][owner] == resolver;
    }
}
