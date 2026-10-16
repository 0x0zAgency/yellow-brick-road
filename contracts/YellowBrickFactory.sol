// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {YellowBrick} from "./YellowBrick.sol";

/// @notice No-platform-fee contract factory. Originator pays blockchain gas.
contract YellowBrickFactory {
    address public immutable implementation;
    mapping(address => bool) public isBrick;
    mapping(bytes32 => address) public brickById;

    event BrickDeployed(bytes32 indexed ipId, address indexed brick, address indexed originator, bytes32 contentHash);

    constructor() { implementation = address(new YellowBrick()); }

    function ipIdentity(address originator, bytes32 contentHash, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode("yellow-brick-road:ip:v1", originator, contentHash, nonce));
    }

    function deploymentSalt(address originator, bytes32 contentHash, bytes32 nonce) public pure returns (bytes32) {
        return keccak256(abi.encode("yellow-brick-road:factory:v1", originator, contentHash, nonce));
    }

    function deployBrick(bytes32 contentHash, string calldata uri, bytes32 nonce) external returns (address brick) {
        require(contentHash != bytes32(0) && bytes(uri).length > 0, "Factory: invalid registration");
        bytes32 salt = deploymentSalt(msg.sender, contentHash, nonce);
        bytes memory code = minimalProxyCode(implementation);
        assembly { brick := create2(0, add(code, 32), mload(code), salt) }
        require(brick != address(0), "Factory: duplicate or failed");
        bytes32 id = ipIdentity(msg.sender, contentHash, nonce);
        YellowBrick(brick).initialize(id, contentHash, msg.sender, uri);
        isBrick[brick] = true;
        brickById[id] = brick;
        emit BrickDeployed(id, brick, msg.sender, contentHash);
    }

    /// @notice Commit an exact metadata document digest at initial registration.
    /// @dev The on-chain digest proves a commitment, not ownership or truth of claimed facts.
    function deployBrickWithMetadataDigest(
        bytes32 contentHash, string calldata uri, bytes32 metadataDigest, bytes32 nonce
    ) external returns (address brick) {
        require(contentHash != bytes32(0) && bytes(uri).length > 0 && metadataDigest != bytes32(0),
                "Factory: invalid metadata registration");
        bytes32 salt = deploymentSalt(msg.sender, contentHash, nonce);
        bytes memory code = minimalProxyCode(implementation);
        assembly { brick := create2(0, add(code, 32), mload(code), salt) }
        require(brick != address(0), "Factory: duplicate or failed");
        bytes32 id = ipIdentity(msg.sender, contentHash, nonce);
        YellowBrick(brick).initializeWithDigest(id, contentHash, msg.sender, uri, metadataDigest);
        isBrick[brick] = true;
        brickById[id] = brick;
        emit BrickDeployed(id, brick, msg.sender, contentHash);
    }

    function predictBrickAddress(address originator, bytes32 contentHash, bytes32 nonce)
        external view returns (address)
    {
        bytes32 salt = deploymentSalt(originator, contentHash, nonce);
        bytes32 codeHash = keccak256(minimalProxyCode(implementation));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }

    function minimalProxyCode(address target) internal pure returns (bytes memory) {
        return abi.encodePacked(
            hex"3d602d80600a3d3981f3",
            hex"363d3d373d3d3d363d73",
            bytes20(target),
            hex"5af43d82803e903d91602b57fd5bf3"
        );
    }
}
