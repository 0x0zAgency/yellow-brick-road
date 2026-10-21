// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Free, revocable YBR Player preview declarations and versioned file commitments.
/// @dev A service identifier is a policy scope, not authentication or proof of copyright.
abstract contract YellowBrickContentPolicy {
    bytes32 public constant PLAYER_APPLICATION = keccak256("ybr:application:ybr-player:v1");
    uint8 public constant PLAY_PREVIEW = 1;
    uint8 public constant DISPLAY_ARTWORK = 2;
    uint8 public constant DISPLAY_LYRICS = 4;

    struct FileCommitments {
        bytes32 manifestDigest;
        bytes32 previewHash;
        bytes32 artworkHash;
        bytes32 lyricsHash;
    }
    struct InitialPolicy {
        FileCommitments files;
        uint8 permissions;
        bool locked;
    }

    bool public contentPolicyEnabled;
    bool public contentLocked;
    uint64 public contentRevision;
    bytes32 public currentContentHash;
    FileCommitments public fileCommitments;
    uint64 public playerPermissionVersion;
    uint8 public playerPermissions;
    address public playerAuthorizedBy;

    event ContentRevisionCommitted(uint64 indexed revision, bytes32 indexed workHash, bytes32 indexed manifestDigest,
        bytes32 previewHash, bytes32 artworkHash, bytes32 lyricsHash);
    event ContentPermanentlyLocked(uint64 indexed revision, bytes32 indexed manifestDigest);
    event PlayerPermissionsUpdated(uint64 indexed version, uint64 indexed revision, address indexed controller, uint8 permissions);

    function _policyController() internal view virtual returns (address);
    function _policyMetadataVersion() internal view virtual returns (uint64);
    function _policyCommitMetadata(string memory uri, bytes32 digest) internal virtual;

    modifier policyController() {
        require(contentPolicyEnabled, "Policy: legacy Brick");
        require(msg.sender == _policyController(), "Policy: not controller");
        _;
    }

    function contentPolicyVersion() external pure returns (uint8) { return 1; }

    function _initializeContentPolicy(bytes32 workHash, InitialPolicy calldata policy) internal {
        require(!contentPolicyEnabled, "Policy: initialized");
        require(workHash != bytes32(0) && policy.files.manifestDigest != bytes32(0), "Policy: missing commitment");
        contentPolicyEnabled = true;
        currentContentHash = workHash;
        contentRevision = 1;
        fileCommitments = policy.files;
        _setPlayerPermissions(policy.permissions);
        emit ContentRevisionCommitted(1, workHash, policy.files.manifestDigest,
            policy.files.previewHash, policy.files.artworkHash, policy.files.lyricsHash);
        if (policy.locked) _lockContent();
    }

    /// @notice Grants only apply while the authorizing controller is current.
    function effectivePlayerPermissions() public view returns (uint8) {
        return contentPolicyEnabled && playerAuthorizedBy == _policyController() ? playerPermissions : 0;
    }

    /// @notice Explicitly reapprove or revoke permissions. Content locking never blocks revocation.
    function setPlayerPermissions(uint8 permissions, uint64 expectedRevision, uint64 expectedPermissionVersion)
        external policyController
    {
        require(contentRevision == expectedRevision && playerPermissionVersion == expectedPermissionVersion,
            "Policy: stale review");
        _setPlayerPermissions(permissions);
    }

    function _setPlayerPermissions(uint8 permissions) internal {
        require(permissions <= 7, "Policy: unsupported permission");
        require((permissions & PLAY_PREVIEW) == 0 || fileCommitments.previewHash != bytes32(0), "Policy: missing preview");
        require((permissions & DISPLAY_ARTWORK) == 0 || fileCommitments.artworkHash != bytes32(0), "Policy: missing artwork");
        require((permissions & DISPLAY_LYRICS) == 0 || fileCommitments.lyricsHash != bytes32(0), "Policy: missing lyrics");
        playerPermissions = permissions;
        playerAuthorizedBy = _policyController();
        playerPermissionVersion++;
        emit PlayerPermissionsUpdated(playerPermissionVersion, contentRevision, playerAuthorizedBy, permissions);
    }

    /// @notice New file bytes require an explicit revision, never a rewritten original identity.
    /// @dev Every revision resets Player permissions to zero. Reapproval is a separate transaction.
    function reviseFiles(bytes32 workHash, FileCommitments calldata files, string calldata uri, bytes32 metadataDigest,
        uint64 expectedRevision, uint64 expectedMetadataVersion) external policyController
    {
        require(!contentLocked, "Policy: content locked");
        require(contentRevision == expectedRevision && _policyMetadataVersion() == expectedMetadataVersion,
            "Policy: stale review");
        require(workHash != bytes32(0) && files.manifestDigest != bytes32(0), "Policy: missing commitment");
        require(bytes(uri).length > 0 && bytes(uri).length <= 8192 && metadataDigest != bytes32(0), "Policy: missing metadata");
        currentContentHash = workHash;
        fileCommitments = files;
        contentRevision++;
        _policyCommitMetadata(uri, metadataDigest);
        _setPlayerPermissions(0);
        emit ContentRevisionCommitted(contentRevision, workHash, files.manifestDigest,
            files.previewHash, files.artworkHash, files.lyricsHash);
    }

    /// @notice Permanent seal of the current file set. No unlock operation exists.
    /// @dev Descriptive metadata, access revocation and ownership controls remain separate.
    function lockContent(uint64 expectedRevision) external policyController {
        require(contentRevision == expectedRevision, "Policy: stale review");
        require(!contentLocked, "Policy: already locked");
        _lockContent();
    }
    function _lockContent() internal {
        contentLocked = true;
        emit ContentPermanentlyLocked(contentRevision, fileCommitments.manifestDigest);
    }
}
