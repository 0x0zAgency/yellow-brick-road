// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Direct, prepaid project licenses. Negotiation and documents remain app-side.
/// @dev EIP-712 and ERC-1271 authorizations; IP funds remain in this Brick until recipients claim.
abstract contract YellowBrickLicensing {
    using SafeERC20 for IERC20;
    error LicenseNotController();
    error LicenseReentrant();
    error LicenseStalePayout();
    error LicensePayoutCount();
    error LicenseInvalidPayee();
    error LicenseDuplicatePayee();
    error LicenseSharesTotal10000();
    error LicenseNotInitialized();
    error LicenseNoUnallocatedFunds();
    error LicenseNothingToClaim();
    error LicenseClaimFailed();
    error LicenseInvalidScope();
    error LicenseStalePolicy();
    error LicenseIncompletePolicy();
    error LicenseInvalidAsset();
    error LicenseWrongParty();
    error LicenseStaleOffer();
    error LicenseIncompleteOffer();
    error LicenseExpiredOffer();
    error LicenseSpentOrCancelled();
    error LicenseApprovalRequired();
    error LicenseWrongPayment();
    error LicenseTransferFeeAsset();
    error LicenseAlreadyLicensed();
    error LicenseInactiveLicense();
    error LicenseMissingEvidence();
    error LicenseDuplicateOrExhausted();
    error LicenseNotRevocable();

    struct LicenseOffer {
        address controller;
        address licensee;
        address receiver;
        address deployment;
        address asset; // zero = native currency
        uint8 scope; // 1 = ingestion; 2 = publishing
        bytes32 projectHash;
        bytes32 termsHash;
        uint128 unitPrice;
        uint64 units;
        uint64 expiresAt;
        uint64 deadline;
        uint64 epoch;
        bytes32 nonce;
        bool revocable;
    }
    struct AutoLicensePolicy {
        bool enabled;
        address asset;
        bytes32 termsHash;
        bytes32 projectHash; // zero explicitly permits any project with these terms
        uint128 minUnitPrice;
        uint64 maxUnits;
        uint64 maxDuration;
        bool revocable;
        uint64 epoch;
        uint64 version;
    }
    struct ProjectLicense {
        address licensee;
        address issuer;
        address receiver;
        address asset;
        uint8 scope;
        bytes32 projectHash;
        bytes32 termsHash;
        uint64 units;
        uint64 consumed;
        uint64 expiresAt;
        bool revocable;
        bool revoked;
        uint256 paid;
    }
    bytes32 private constant OFFER_TYPEHASH = keccak256("LicenseOffer(address controller,address licensee,address receiver,address deployment,address asset,uint8 scope,bytes32 projectHash,bytes32 termsHash,uint128 unitPrice,uint64 units,uint64 expiresAt,uint64 deadline,uint64 epoch,bytes32 nonce,bool revocable)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 public licensingDomainSalt;
    uint64 public licensingEpoch;
    struct PayoutShare { address recipient; uint16 bps; }
    uint64 public licensePayoutVersion;
    mapping(uint64 => PayoutShare[]) private _licensePayouts;
    mapping(address => mapping(address => uint256)) public licenseClaimable;
    mapping(address => uint256) public totalLicenseClaimable;
    mapping(uint8 => AutoLicensePolicy) private _automatic;
    mapping(bytes32 => ProjectLicense) private _projectLicenses;
    mapping(bytes32 => bool) public cancelledLicenseOffers;
    mapping(bytes32 => mapping(bytes32 => bool)) public recordedLicenseUses;
    bool private _licensingEntered;

    event LicensePayoutConfigured(uint64 indexed version, uint64 epoch);
    event IPFundsReceived(address indexed asset, uint256 amount, uint64 indexed payoutVersion);
    event IPFundsClaimed(address indexed asset, address indexed recipient, uint256 amount);
    event AutoLicensePolicyUpdated(uint8 indexed scope, uint64 version, uint64 epoch);
    event ProjectLicenseAccepted(bytes32 indexed licenseId, address indexed licensee, uint8 indexed scope, address receiver, address asset, uint256 paid, bytes32 projectHash, bytes32 termsHash);
    event LicenseOfferCancelled(bytes32 indexed offerId, address indexed actor);
    event LicensedUseRecorded(bytes32 indexed licenseId, bytes32 indexed usageId, uint64 units, bytes32 evidenceHash);
    event ProjectLicenseRevoked(bytes32 indexed licenseId);

    function _licensingController() internal view virtual returns (address);
    modifier onlyLicensingController() { if (!(msg.sender == _licensingController())) revert LicenseNotController(); _; }
    modifier licensingNonReentrant() { if (_licensingEntered) revert LicenseReentrant(); _licensingEntered = true; _; _licensingEntered = false; }
    function projectLicensingVersion() external pure returns (uint8) { return 1; }
    function _initializeProjectLicensing(bytes32 id) internal {
        licensingDomainSalt = keccak256(abi.encode(block.chainid, address(this), blockhash(block.number - 1), id));
        _licensePayouts[0].push(PayoutShare(_licensingController(), 10000));
    }
    /// @notice The per-IP contract is the receiving wallet, including for its NFT receipt.
    function licenseReceiver() public view returns (address) { return address(this); }
    function licensePayout(uint64 version) public view returns (PayoutShare[] memory shares) {
        shares = _licensePayouts[version];
    }
    function configureLicensePayout(address[] calldata recipients, uint16[] calldata bps,
        uint64 expectedEpoch, uint64 expectedVersion) external onlyLicensingController
    {
        if (!(expectedEpoch == licensingEpoch && expectedVersion == licensePayoutVersion)) revert LicenseStalePayout();
        if (!(recipients.length > 0 && recipients.length <= 16 && recipients.length == bps.length)) revert LicensePayoutCount();
        uint256 total;
        for (uint256 i; i < recipients.length; ++i) {
            if (!(recipients[i] != address(0) && recipients[i] != address(this) && bps[i] > 0)) revert LicenseInvalidPayee();
            for (uint256 j; j < i; ++j) if (!(recipients[j] != recipients[i])) revert LicenseDuplicatePayee();
            total += bps[i];
        }
        if (!(total == 10000)) revert LicenseSharesTotal10000();
        licensePayoutVersion++;
        licensingEpoch++; // unaccepted signatures and automatic rules must be reviewed again
        for (uint256 i; i < recipients.length; ++i) _licensePayouts[licensePayoutVersion].push(PayoutShare(recipients[i], bps[i]));
        emit LicensePayoutConfigured(licensePayoutVersion, licensingEpoch);
    }
    function _resetProjectLicensing() internal {
        licensingEpoch++;
        licensePayoutVersion++;
        _licensePayouts[licensePayoutVersion].push(PayoutShare(_licensingController(), 10000));
        emit LicensePayoutConfigured(licensePayoutVersion, licensingEpoch);
    }
    function _creditIPFunds(address asset, uint256 amount) private {
        if (amount == 0) return;
        if (!(_licensingController() != address(0))) revert LicenseNotInitialized();
        PayoutShare[] memory shares = licensePayout(licensePayoutVersion);
        uint256 distributed;
        for (uint256 i; i < shares.length; ++i) {
            uint256 part = i + 1 == shares.length ? amount - distributed : amount * shares[i].bps / 10000;
            licenseClaimable[asset][shares[i].recipient] += part;
            distributed += part;
        }
        totalLicenseClaimable[asset] += amount;
        emit IPFundsReceived(asset, amount, licensePayoutVersion);
    }
    receive() external payable { _creditIPFunds(address(0), msg.value); }
    /// @notice Account for direct ERC-20 transfers or forced native deposits using current splits.
    function accountReceivedIPFunds(address asset) external licensingNonReentrant {
        uint256 balance = asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
        if (!(balance > totalLicenseClaimable[asset])) revert LicenseNoUnallocatedFunds();
        _creditIPFunds(asset, balance - totalLicenseClaimable[asset]);
    }
    /// @notice Each recipient extracts only its accrued balance. Payout edits never reassign it.
    function claimIPFunds(address asset) external licensingNonReentrant {
        uint256 amount = licenseClaimable[asset][msg.sender];
        if (!(amount > 0)) revert LicenseNothingToClaim();
        licenseClaimable[asset][msg.sender] = 0;
        totalLicenseClaimable[asset] -= amount;
        if (asset == address(0)) {
            (bool ok,) = payable(msg.sender).call{value: amount}(""); if (!(ok)) revert LicenseClaimFailed();
        } else IERC20(asset).safeTransfer(msg.sender, amount);
        emit IPFundsClaimed(asset, msg.sender, amount);
    }
    function autoLicensePolicy(uint8 scope) external view returns (AutoLicensePolicy memory policy) {
        policy = _automatic[scope];
        if (policy.epoch != licensingEpoch) policy.enabled = false;
    }
    function setAutoLicensePolicy(uint8 scope, AutoLicensePolicy calldata next, uint64 expectedEpoch, uint64 expectedVersion)
        external onlyLicensingController
    {
        if (!(scope == 1 || scope == 2)) revert LicenseInvalidScope();
        if (!(expectedEpoch == licensingEpoch && expectedVersion == _automatic[scope].version)) revert LicenseStalePolicy();
        if (!(!next.enabled || (next.termsHash != bytes32(0) && next.maxUnits > 0 && next.maxDuration > 0))) revert LicenseIncompletePolicy();
        if (!(next.asset == address(0) || next.asset.code.length > 0)) revert LicenseInvalidAsset();
        _automatic[scope] = next;
        _automatic[scope].epoch = licensingEpoch;
        _automatic[scope].version = expectedVersion + 1;
        emit AutoLicensePolicyUpdated(scope, expectedVersion + 1, licensingEpoch);
    }
    function licenseOfferDigest(LicenseOffer calldata offer) public view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("Yellow Brick Project License"), keccak256("1"), block.chainid, address(this), licensingDomainSalt));
        // All fields are static ABI types: encoding the tuple matches EIP-712 field encoding.
        return keccak256(abi.encodePacked(hex"1901", domain, keccak256(abi.encode(OFFER_TYPEHASH, offer))));
    }
    function qualifiesForAutomaticLicense(LicenseOffer calldata o) public view returns (bool) {
        AutoLicensePolicy storage p = _automatic[o.scope];
        return p.enabled && p.epoch == licensingEpoch && o.epoch == licensingEpoch &&
            o.controller == _licensingController() && o.receiver == licenseReceiver() &&
            o.asset == p.asset && o.termsHash == p.termsHash && (p.projectHash == bytes32(0) || o.projectHash == p.projectHash) &&
            o.unitPrice >= p.minUnitPrice && o.units > 0 && o.units <= p.maxUnits &&
            o.expiresAt > block.timestamp && o.expiresAt - block.timestamp <= p.maxDuration && o.revocable == p.revocable &&
            o.deadline >= block.timestamp && o.licensee != address(0) && o.projectHash != bytes32(0);
    }
    /// @notice Pay this Brick and obtain a license bound to the exact project and terms.
    function acceptProjectLicense(LicenseOffer calldata o, bytes calldata controllerSignature)
        external payable licensingNonReentrant returns (bytes32 id)
    {
        if (!(msg.sender == o.licensee && o.controller == _licensingController())) revert LicenseWrongParty();
        if (!(o.epoch == licensingEpoch && o.receiver == licenseReceiver())) revert LicenseStaleOffer();
        if (!(o.scope == 1 || o.scope == 2)) revert LicenseInvalidScope();
        if (!(o.projectHash != bytes32(0) && o.termsHash != bytes32(0) && o.nonce != bytes32(0) && o.deployment != address(0) && o.units > 0)) revert LicenseIncompleteOffer();
        if (!(o.deadline >= block.timestamp && o.expiresAt > block.timestamp)) revert LicenseExpiredOffer();
        id = licenseOfferDigest(o);
        if (!(!cancelledLicenseOffers[id] && _projectLicenses[id].licensee == address(0))) revert LicenseSpentOrCancelled();
        if (!(qualifiesForAutomaticLicense(o) || SignatureChecker.isValidSignatureNow(o.controller, id, controllerSignature))) revert LicenseApprovalRequired();
        uint256 amount = uint256(o.unitPrice) * o.units;
        _projectLicenses[id] = ProjectLicense(o.licensee, o.controller, o.receiver, o.asset, o.scope, o.projectHash, o.termsHash, o.units, 0, o.expiresAt, o.revocable, false, amount);
        if (o.asset == address(0)) {
            if (!(msg.value == amount)) revert LicenseWrongPayment();

        } else {
            if (!(msg.value == 0 && o.asset.code.length > 0)) revert LicenseInvalidAsset();
            if (amount > 0) {
                uint256 beforeBalance = IERC20(o.asset).balanceOf(address(this));
                IERC20(o.asset).safeTransferFrom(msg.sender, address(this), amount);
                if (!(IERC20(o.asset).balanceOf(address(this)) - beforeBalance == amount)) revert LicenseTransferFeeAsset();
            }
        }
        _creditIPFunds(o.asset, amount);
        emit ProjectLicenseAccepted(id, o.licensee, o.scope, o.receiver, o.asset, amount, o.projectHash, o.termsHash);
    }
    function cancelLicenseOffer(LicenseOffer calldata o) external {
        if (!(msg.sender == o.licensee || msg.sender == _licensingController())) revert LicenseWrongParty();
        bytes32 id = licenseOfferDigest(o);
        if (!(_projectLicenses[id].licensee == address(0))) revert LicenseAlreadyLicensed();
        cancelledLicenseOffers[id] = true;
        emit LicenseOfferCancelled(id, msg.sender);
    }
    function projectLicense(bytes32 id) external view returns (ProjectLicense memory) { return _projectLicenses[id]; }
    function recordLicensedUse(bytes32 id, bytes32 usageId, uint64 units, bytes32 evidenceHash) external {
        ProjectLicense storage grant = _projectLicenses[id];
        if (!(grant.licensee == msg.sender && !grant.revoked && block.timestamp <= grant.expiresAt)) revert LicenseInactiveLicense();
        if (!(usageId != bytes32(0) && evidenceHash != bytes32(0) && units > 0)) revert LicenseMissingEvidence();
        if (!(!recordedLicenseUses[id][usageId] && units <= grant.units - grant.consumed)) revert LicenseDuplicateOrExhausted();
        recordedLicenseUses[id][usageId] = true;
        grant.consumed += units;
        emit LicensedUseRecorded(id, usageId, units, evidenceHash);
    }
    function revokeProjectLicense(bytes32 id) external onlyLicensingController {
        ProjectLicense storage grant = _projectLicenses[id];
        if (!(grant.licensee != address(0) && grant.revocable && !grant.revoked)) revert LicenseNotRevocable();
        grant.revoked = true;
        emit ProjectLicenseRevoked(id);
    }
}
