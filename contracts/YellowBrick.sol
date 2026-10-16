// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Per-work IP identity. Registration is not copyright adjudication.
/// @dev Deployed as an EIP-1167 clone. Implementation instance is locked.
contract YellowBrick {
    bytes32 public ipId;
    bytes32 public contentHash;
    address public originator;
    address public controller;
    address public pendingController;
    string public metadataURI;
    uint64 public metadataVersion;
    bool private initialized;

    event BrickInitialized(bytes32 indexed ipId, address indexed originator, bytes32 indexed contentHash);
    event MetadataUpdated(uint64 indexed version, string uri);
    event ControllerProposed(address indexed newController);
    event ControllerAccepted(address indexed newController);

    modifier onlyController() {
        require(msg.sender == controller, "Brick: not controller");
        _;
    }

    constructor() { initialized = true; }

    function initialize(bytes32 id, bytes32 hash, address creator, string calldata uri) external {
        require(!initialized, "Brick: initialized");
        require(id != bytes32(0) && hash != bytes32(0) && creator != address(0), "Brick: bad identity");
        initialized = true;
        ipId = id;
        contentHash = hash;
        originator = creator;
        controller = creator;
        metadataURI = uri;
        metadataVersion = 1;
        emit BrickInitialized(id, creator, hash);
    }

    function updateMetadata(string calldata uri) external onlyController {
        require(bytes(uri).length > 0, "Brick: empty metadata");
        metadataURI = uri;
        metadataVersion++;
        emit MetadataUpdated(metadataVersion, uri);
    }

    function proposeController(address next) external onlyController {
        require(next != address(0), "Brick: zero controller");
        pendingController = next;
        emit ControllerProposed(next);
    }

    function acceptController() external {
        require(msg.sender == pendingController, "Brick: not nominated");
        controller = msg.sender;
        pendingController = address(0);
        emit ControllerAccepted(msg.sender);
    }
}
