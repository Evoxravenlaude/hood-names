// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/// @notice Helpers for a dotted ASCII name such as "hood" or "names.example.eth".
library NameEncoding {
    /// @notice Splits a dotted name into its labels, left to right.
    function labels(string memory name) internal pure returns (string[] memory out) {
        bytes memory b = bytes(name);
        uint256 count = 1;
        for (uint256 i = 0; i < b.length; i++) if (b[i] == ".") count++;
        out = new string[](count);
        uint256 start = 0;
        uint256 n = 0;
        for (uint256 i = 0; i <= b.length; i++) {
            if (i == b.length || b[i] == ".") {
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) part[j - start] = b[j];
                require(part.length > 0 && part.length < 64, "bad label");
                out[n++] = string(part);
                start = i + 1;
            }
        }
    }

    /// @notice ENS namehash of a dotted name.
    function namehash(string memory name) internal pure returns (bytes32 node) {
        string[] memory parts = labels(name);
        for (uint256 i = parts.length; i > 0; i--) {
            node = keccak256(abi.encodePacked(node, keccak256(bytes(parts[i - 1]))));
        }
    }

    /// @notice DNS wire encoding: each label prefixed by its length, then 0x00.
    function dnsEncode(string memory name) internal pure returns (bytes memory out) {
        string[] memory parts = labels(name);
        for (uint256 i = 0; i < parts.length; i++) {
            out = abi.encodePacked(out, uint8(bytes(parts[i]).length), parts[i]);
        }
        out = abi.encodePacked(out, uint8(0));
    }
}
