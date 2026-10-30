// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {YellowBrick} from "./YellowBrick.sol";
import {YellowBrickContentPolicy} from "./YellowBrickContentPolicy.sol";
import {YellowBrickReceipt} from "./YellowBrickReceipt.sol";

/// @notice No-platform-fee contract factory. Originator pays blockchain gas.
contract YellowBrickFactory {
    address public immutable implementation;
    address public immutable receiptToken;
    mapping(address => bool) public isBrick;
    mapping(bytes32 => address) public brickById;

    uint256 public constant MAX_MINT_BATCH = 32;
    struct Registration {
        bytes32 contentHash;
        string uri;
        bytes32 metadataDigest;
        bytes32 nonce;
        bool withPolicy;
        YellowBrickContentPolicy.InitialPolicy policy;
    }

    /// @notice One creator-signed transaction, including initial ERC-721 artwork.
    function mintBatchVersion() external pure returns (uint8) { return 1; }
    function projectLicensingVersion() external pure returns (uint8) { return 1; }
    function licensingContactInterfaceVersion() external pure returns (uint8) { return 1; }

    event BrickDeployed(bytes32 indexed ipId, address indexed brick, address indexed originator, bytes32 contentHash);

    constructor() {
        implementation = address(new YellowBrick());
        receiptToken = address(new YellowBrickReceipt(address(this)));
    }

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
        YellowBrick(payable(brick)).initialize(id, contentHash, msg.sender, uri);
        isBrick[brick] = true;
        brickById[id] = brick;
        YellowBrickReceipt(receiptToken).mint(msg.sender, uint256(id), brick);
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
        YellowBrick(payable(brick)).initializeWithDigest(id, contentHash, msg.sender, uri, metadataDigest);
        isBrick[brick] = true;
        brickById[id] = brick;
        YellowBrickReceipt(receiptToken).mint(msg.sender, uint256(id), brick);
        emit BrickDeployed(id, brick, msg.sender, contentHash);
    }

    /// @notice Capability check; old immutable factories cannot retroactively support this method.
    function contentPolicyVersion() external pure returns (uint8) { return 1; }

    function deployBrickWithPolicy(bytes32 contentHash, string calldata uri, bytes32 metadataDigest, bytes32 nonce,
        YellowBrickContentPolicy.InitialPolicy calldata policy) external returns (address brick)
    {
        require(contentHash != bytes32(0) && bytes(uri).length > 0 && bytes(uri).length <= 8192 && metadataDigest != bytes32(0),
            "Factory: invalid metadata registration");
        bytes32 salt = deploymentSalt(msg.sender, contentHash, nonce);
        bytes memory code = minimalProxyCode(implementation);
        assembly { brick := create2(0, add(code, 32), mload(code), salt) }
        require(brick != address(0), "Factory: duplicate or failed");
        bytes32 id = ipIdentity(msg.sender, contentHash, nonce);
        YellowBrick(payable(brick)).initializeWithPolicy(id, contentHash, msg.sender, uri, metadataDigest, policy);
        isBrick[brick] = true;
        brickById[id] = brick;
        YellowBrickReceipt(receiptToken).mint(msg.sender, uint256(id), brick);
        emit BrickDeployed(id, brick, msg.sender, contentHash);
    }

    /// @notice Register an entire release atomically. Every item belongs to msg.sender.
    /// @dev No external recipient callbacks, delegated multicall, fees or partial success.
    ///      The shared display URI is stored once by the receipt collection.
    function deployBricksWithPolicy(Registration[] calldata registrations, string calldata imageURI)
        external returns (address[] memory bricks)
    {
        return _deployBricks(registrations, imageURI, new string[](0));
    }

    /// @notice Each new Brick carries its own controller-declared licensing email.
    function deployBricksWithLicensingContact(Registration[] calldata registrations, string calldata imageURI,
        string[] calldata licensingEmails) external returns (address[] memory bricks)
    {
        require(licensingEmails.length == registrations.length, "Factory: contact count");
        return _deployBricks(registrations, imageURI, licensingEmails);
    }

    function _deployBricks(Registration[] calldata registrations, string calldata imageURI,
        string[] memory licensingEmails) internal returns (address[] memory bricks)
    {
        uint256 length = registrations.length;
        require(length > 0 && length <= MAX_MINT_BATCH, "Factory: batch limit");
        bricks = new address[](length);
        uint256[] memory tokenIds = new uint256[](length);
        bytes memory code = minimalProxyCode(implementation);
        for (uint256 i; i < length; ++i) {
            (address brick, bytes32 id) = _register(registrations[i], code,
                licensingEmails.length > 0 ? licensingEmails[i] : "", licensingEmails.length > 0);
            bricks[i] = brick;
            tokenIds[i] = uint256(id);
        }
        // Invalid artwork or a failed receipt reverts ALL deployments and events above.
        YellowBrickReceipt(receiptToken).mintBatch(msg.sender, tokenIds, bricks, imageURI);
    }

    function _register(Registration calldata r, bytes memory code, string memory email, bool withContact)
        internal returns (address brick, bytes32 id)
    {
        require(r.contentHash != bytes32(0) && bytes(r.uri).length > 0 &&
            bytes(r.uri).length <= 8192 && r.metadataDigest != bytes32(0),
            "Factory: invalid metadata registration");
        bytes32 salt = deploymentSalt(msg.sender, r.contentHash, r.nonce);
        assembly { brick := create2(0, add(code, 32), mload(code), salt) }
        require(brick != address(0), "Factory: duplicate or failed");
        id = ipIdentity(msg.sender, r.contentHash, r.nonce);
        if (withContact) {
            require(r.withPolicy, "Factory: contact requires policy");
            YellowBrick(payable(brick)).initializeWithPolicyAndLicensingContact(id, r.contentHash, msg.sender,
                r.uri, r.metadataDigest, r.policy, email);
        } else if (r.withPolicy) {
            YellowBrick(payable(brick)).initializeWithPolicy(id, r.contentHash, msg.sender, r.uri, r.metadataDigest, r.policy);
        } else {
            require(r.policy.files.manifestDigest == bytes32(0) &&
                r.policy.files.previewHash == bytes32(0) &&
                r.policy.files.artworkHash == bytes32(0) &&
                r.policy.files.lyricsHash == bytes32(0) &&
                r.policy.permissions == 0 && !r.policy.locked, "Factory: unexpected policy");
            YellowBrick(payable(brick)).initializeWithDigest(id, r.contentHash, msg.sender, r.uri, r.metadataDigest);
        }
        isBrick[brick] = true;
        brickById[id] = brick;
        emit BrickDeployed(id, brick, msg.sender, r.contentHash);
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
