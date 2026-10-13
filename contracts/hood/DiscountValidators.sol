// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IDiscountValidator} from "./HoodRegistrarController.sol";

abstract contract ControllerOnly {
    address public immutable controller;

    error NotController();

    constructor(address _controller) {
        controller = _controller;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert NotController();
        _;
    }
}

/// @title SignedDiscountValidator
/// @notice Accepts a registration if a trusted signer has signed for it.
///
/// This is the slot for an account-verification attestation. The operator of
/// an app with verified users (for example a broker) signs "account X may
/// register exactly this name to this address, until T". No personal data
/// goes on-chain: the account is an opaque identifier chosen by the signer.
///
/// What the signature binds, and why:
///  - the commitment, so the proof works for the one name the user chose and
///    cannot be spent by someone else on a different name;
///  - the discount key, so a proof for one discount cannot claim a larger one;
///  - the account identifier, so one account gets one discounted name however
///    many addresses it uses;
///  - this validator and the chain, so it cannot be replayed elsewhere.
/// Anyone may submit the registration, which allows a sponsoring relayer.
///
/// validationData = abi.encode(bytes32 accountId, uint256 validUntil, bytes signature)
contract SignedDiscountValidator is IDiscountValidator, ControllerOnly, Ownable2Step {
    address public signer;
    mapping(bytes32 => bool) public accountUsed;

    event SignerChanged(address indexed signer);

    constructor(address _controller, address _signer) ControllerOnly(_controller) {
        signer = _signer;
    }

    function setSigner(address _signer) external onlyOwner {
        signer = _signer;
        emit SignerChanged(_signer);
    }

    function digest(
        address claimer,
        bytes32 commitment,
        bytes32 key,
        bytes32 accountId,
        uint256 validUntil
    ) public view returns (bytes32) {
        return
            ECDSA.toEthSignedMessageHash(
                keccak256(
                    abi.encode(
                        address(this),
                        block.chainid,
                        claimer,
                        commitment,
                        key,
                        accountId,
                        validUntil
                    )
                )
            );
    }

    function validateAndConsume(
        address claimer,
        address,
        bytes32 commitment,
        bytes32 key,
        bytes calldata validationData
    ) external override onlyController returns (bool) {
        (bytes32 accountId, uint256 validUntil, bytes memory signature) = abi
            .decode(validationData, (bytes32, uint256, bytes));
        if (block.timestamp > validUntil || accountUsed[accountId]) return false;

        (address recovered, ECDSA.RecoverError err) = ECDSA.tryRecover(
            digest(claimer, commitment, key, accountId, validUntil),
            signature
        );
        if (
            err != ECDSA.RecoverError.NoError ||
            recovered == address(0) ||
            recovered != signer
        ) return false;

        accountUsed[accountId] = true;
        return true;
    }
}

/// @title ERC721HolderDiscountValidator
/// @notice Accepts a registration from the holder of a token in a given
///         collection, for example a pass collection run by a partner app.
///         Each token can be used once, so passing one token between
///         addresses does not multiply the discount, and only the holder
///         can submit, so nobody else can spend it for them.
///
/// validationData = abi.encode(uint256 tokenId)
contract ERC721HolderDiscountValidator is IDiscountValidator, ControllerOnly {
    IERC721 public immutable collection;
    mapping(uint256 => bool) public tokenUsed;

    constructor(address _controller, IERC721 _collection) ControllerOnly(_controller) {
        collection = _collection;
    }

    function validateAndConsume(
        address claimer,
        address sender,
        bytes32,
        bytes32,
        bytes calldata validationData
    ) external override onlyController returns (bool) {
        if (sender != claimer || validationData.length != 32) return false;
        uint256 tokenId = abi.decode(validationData, (uint256));
        if (tokenUsed[tokenId]) return false;
        try collection.ownerOf(tokenId) returns (address holder) {
            if (holder != claimer) return false;
        } catch {
            return false;
        }
        tokenUsed[tokenId] = true;
        return true;
    }
}
