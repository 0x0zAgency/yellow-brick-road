// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {YellowBrickContentPolicy} from "./YellowBrickContentPolicy.sol";
import {LicensingEmail} from "./LicensingEmail.sol";

/// @notice Per-work IP identity. Registration is not copyright adjudication.
/// @dev Deployed as an EIP-1167 clone. Implementation instance is locked.
contract YellowBrick is YellowBrickContentPolicy {
    bytes32 public ipId;
    bytes32 public contentHash;
    address public originator;
    address public controller;
    address public pendingController;
    string public metadataURI;
    uint64 public metadataVersion;
    bool private initialized;
    bytes32 public metadataDigest; // SHA-256 or keccak256 commitment identified by off-chain schema
    string private _licensingEmail;
    uint64 private _licensingContactVersion;

    event LicensingContactUpdated(uint64 indexed version, address indexed controller, string email);

    /// @notice Public contact for approvals and agreements, not a license grant or verified mailbox.
    function licensingContact() external view returns (string memory email, uint64 version, address authority) {
        return (_licensingEmail, _licensingContactVersion, controller);
    }

    function setLicensingContact(string calldata email, uint64 expectedVersion) external onlyController {
        require(expectedVersion == _licensingContactVersion, "Brick: stale contact review");
        _setLicensingContact(email);
    }

    function _setLicensingContact(string memory email) internal {
        require(LicensingEmail.valid(bytes(email)), "Brick: invalid licensing email");
        _licensingEmail = email;
        _licensingContactVersion++;
        emit LicensingContactUpdated(_licensingContactVersion, controller, email);
    }

    event MetadataCommitted(uint64 indexed version, bytes32 indexed digest);


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
        _initialize(id, hash, creator, uri);
    }

    /// @notice Prefer a content-addressed URI and an explicit digest of its exact metadata bytes.
    function initializeWithDigest(bytes32 id, bytes32 hash, address creator, string calldata uri, bytes32 digest)
        external
    {
        require(digest != bytes32(0), "Brick: empty digest");
        _initialize(id, hash, creator, uri);
        metadataDigest = digest;
        emit MetadataCommitted(1, digest);
    }

    /// @notice File commitments and Player permissions are initialized atomically with the Brick.
    function initializeWithPolicy(bytes32 id, bytes32 hash, address creator, string calldata uri,
        bytes32 digest, InitialPolicy calldata policy) external
    {
        require(digest != bytes32(0), "Brick: empty digest");
        _initialize(id, hash, creator, uri);
        metadataDigest = digest;
        emit MetadataCommitted(1, digest);
        _initializeContentPolicy(hash, policy);
    }

    /// @notice Initializes a public licensing contact in the same transaction as the work.
    function initializeWithPolicyAndLicensingContact(bytes32 id, bytes32 hash, address creator, string calldata uri,
        bytes32 digest, InitialPolicy calldata policy, string calldata email) external
    {
        require(digest != bytes32(0), "Brick: empty digest");
        _initialize(id, hash, creator, uri);
        metadataDigest = digest;
        emit MetadataCommitted(1, digest);
        _initializeContentPolicy(hash, policy);
        _setLicensingContact(email);
    }

    function _policyController() internal view override returns (address) { return controller; }
    function _policyMetadataVersion() internal view override returns (uint64) { return metadataVersion; }
    function _policyCommitMetadata(string memory uri, bytes32 digest) internal override {
        metadataURI = uri;
        metadataVersion++;
        metadataDigest = digest;
        emit MetadataUpdated(metadataVersion, uri);
        emit MetadataCommitted(metadataVersion, digest);
    }

    function _initialize(bytes32 id, bytes32 hash, address creator, string memory uri) internal {
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

    /// @dev Legacy updates clear the digest; an old commitment cannot describe new metadata.
    function updateMetadata(string calldata uri) external onlyController {
        require(bytes(uri).length > 0, "Brick: empty metadata");
        metadataURI = uri;
        metadataVersion++;
        metadataDigest = bytes32(0);
        emit MetadataUpdated(metadataVersion, uri);
        emit MetadataCommitted(metadataVersion, bytes32(0));
    }

    function updateMetadataWithDigest(string calldata uri, bytes32 digest) external onlyController {
        require(bytes(uri).length > 0 && digest != bytes32(0), "Brick: missing metadata commitment");
        metadataURI = uri;
        metadataVersion++;
        metadataDigest = digest;
        emit MetadataUpdated(metadataVersion, uri);
        emit MetadataCommitted(metadataVersion, digest);
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
        // A round-trip controller transfer must not revive an earlier grant.
        if (contentPolicyEnabled) _setPlayerPermissions(0);
        // A new controller must publish its own contact, including on a round trip.
        _setLicensingContact("");
        emit ControllerAccepted(msg.sender);
    }
}
