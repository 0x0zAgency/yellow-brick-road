// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBrickFactoryForLicense {
    function isBrick(address candidate) external view returns (bool);
}
interface IBrickControllerForLicense {
    function controller() external view returns (address);
}

/// @notice Versioned, non-transferable, controller-issued license declarations.
/// @dev A declaration is NOT independent proof of copyright title or permitted usage.
contract YellowBrickLicense {
    struct Grant {
        address brick;
        address licensee;
        address asset;
        uint256 pricePerUse;
        bytes32 termsHash;
        uint64 payoutVersion;
        uint64 expiresAt; // 0 = indefinite
        bool active;
    }

    address public immutable factory;
    mapping(bytes32 => Grant) private grants;

    event LicenseIssued(
        bytes32 indexed licenseId,
        address indexed brick,
        address indexed licensee,
        address asset,
        uint256 pricePerUse,
        uint64 payoutVersion,
        bytes32 termsHash
    );
    event LicenseRevoked(bytes32 indexed licenseId, address indexed brick);

    constructor(address brickFactory) {
        require(brickFactory.code.length > 0, "License: factory required");
        factory = brickFactory;
    }

    function issueLicense(
        address brick,
        address licensee,
        address asset,
        uint256 pricePerUse,
        bytes32 termsHash,
        uint64 payoutVersion,
        uint64 expiresAt,
        bytes32 nonce
    ) external returns (bytes32 licenseId) {
        require(IBrickFactoryForLicense(factory).isBrick(brick), "License: unregistered brick");
        require(msg.sender == IBrickControllerForLicense(brick).controller(), "License: not controller");
        require(licensee != address(0) && asset.code.length > 0, "License: bad counterparty or asset");
        require(pricePerUse > 0 && termsHash != bytes32(0), "License: missing price or terms");
        require(payoutVersion > 0, "License: missing payout version");
        require(expiresAt == 0 || expiresAt > block.timestamp, "License: expired on issue");

        licenseId = keccak256(abi.encode(
            "0x0z-road-license-v1", block.chainid, address(this),
            msg.sender, brick, licensee, asset, pricePerUse,
            termsHash, payoutVersion, expiresAt, nonce
        ));
        require(grants[licenseId].brick == address(0), "License: duplicate");
        grants[licenseId] = Grant(
            brick, licensee, asset, pricePerUse, termsHash, payoutVersion, expiresAt, true
        );
        emit LicenseIssued(
            licenseId, brick, licensee, asset, pricePerUse, payoutVersion, termsHash
        );
    }

    function revokeLicense(bytes32 licenseId) external {
        Grant storage grant = grants[licenseId];
        require(grant.brick != address(0), "License: unknown");
        require(msg.sender == IBrickControllerForLicense(grant.brick).controller(), "License: not controller");
        require(grant.active, "License: already revoked");
        grant.active = false;
        emit LicenseRevoked(licenseId, grant.brick);
    }

    function getGrant(bytes32 licenseId) external view returns (Grant memory) {
        return grants[licenseId];
    }
}
