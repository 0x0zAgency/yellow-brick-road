// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {YellowBrickLicense} from "./YellowBrickLicense.sol";

interface IBrickFactoryForSettlement {
    function isBrick(address candidate) external view returns (bool);
}
interface IBrickControllerForSettlement {
    function controller() external view returns (address);
}
interface ISettlementToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Versioned per-IP payouts for authorized economic usage.
/// @dev Charges ZERO Road operating fee. A future network fee must respect
///      approved budget caps and verified blockchain-node operator eligibility.
contract RoadRoyaltySettlement {
    struct Share { address recipient; uint16 bps; }

    ISettlementToken public immutable token;
    YellowBrickLicense public immutable licenses;
    address public immutable factory;

    uint256 public constant MAX_RECIPIENTS = 16;
    mapping(address => uint64) public latestPayoutVersion;
    mapping(address => mapping(uint64 => Share[])) private policies;
    mapping(bytes32 => bool) public settledUsage;
    mapping(address => uint256) public claimable;
    uint256 public totalClaimable;
    bool private entered;

    event PayoutConfigured(address indexed brick, uint64 indexed version);
    event UsageSettled(
        bytes32 indexed licenseId,
        bytes32 indexed usageKey,
        address indexed brick,
        uint256 amount,
        bytes32 evidenceHash,
        uint64 payoutVersion
    );
    event RoyaltyClaimed(address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        require(!entered, "Settlement: reentrant");
        entered = true;
        _;
        entered = false;
    }

    constructor(address asset, address registry, address brickFactory) {
        require(asset.code.length > 0, "Settlement: token required");
        require(registry.code.length > 0, "Settlement: licenses required");
        require(brickFactory.code.length > 0, "Settlement: factory required");
        token = ISettlementToken(asset);
        licenses = YellowBrickLicense(registry);
        factory = brickFactory;
    }

    /// @notice Preserve immutable split versions so licenses can pin their terms.
    function configurePayout(address brick, address[] calldata recipients, uint16[] calldata bps)
        external returns (uint64 version)
    {
        require(IBrickFactoryForSettlement(factory).isBrick(brick), "Settlement: unknown brick");
        require(IBrickControllerForSettlement(brick).controller() == msg.sender, "Settlement: not controller");
        require(recipients.length > 0 && recipients.length <= MAX_RECIPIENTS, "Settlement: recipient count");
        require(recipients.length == bps.length, "Settlement: lengths differ");
        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0) && bps[i] > 0, "Settlement: bad share");
            for (uint256 j = 0; j < i; j++) {
                require(recipients[j] != recipients[i], "Settlement: duplicate recipient");
            }
            total += bps[i];
        }
        require(total == 10_000, "Settlement: shares must total 10000");
        version = ++latestPayoutVersion[brick];
        for (uint256 i = 0; i < recipients.length; i++) {
            policies[brick][version].push(Share(recipients[i], bps[i]));
        }
        emit PayoutConfigured(brick, version);
    }

    function payoutShares(address brick, uint64 version) external view returns (Share[] memory) {
        return policies[brick][version];
    }

    /// @dev Evidence hash is an attestation commitment, NOT proof of model causality.
    function settle(bytes32 licenseId, bytes32 usageId, bytes32 evidenceHash) external nonReentrant {
        require(licenseId != bytes32(0) && usageId != bytes32(0) && evidenceHash != bytes32(0),
                "Settlement: missing evidence");
        YellowBrickLicense.Grant memory grant = licenses.getGrant(licenseId);
        require(grant.active && grant.brick != address(0), "Settlement: inactive license");
        require(grant.licensee == msg.sender && grant.asset == address(token), "Settlement: wrong payer or asset");
        require(grant.expiresAt == 0 || block.timestamp <= grant.expiresAt, "Settlement: expired");
        Share[] storage shares = policies[grant.brick][grant.payoutVersion];
        require(shares.length > 0, "Settlement: payout version missing");

        bytes32 key = keccak256(abi.encode(block.chainid, address(this), licenseId, usageId));
        require(!settledUsage[key], "Settlement: duplicate usage");
        settledUsage[key] = true;

        uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), grant.pricePerUse), "Settlement: payment failed");
        require(token.balanceOf(address(this)) - beforeBalance == grant.pricePerUse,
                "Settlement: transfer-fee tokens unsupported");

        uint256 distributed;
        for (uint256 i = 0; i < shares.length; i++) {
            uint256 amount = i + 1 == shares.length
                ? grant.pricePerUse - distributed
                : grant.pricePerUse * shares[i].bps / 10_000;
            claimable[shares[i].recipient] += amount;
            distributed += amount;
        }
        totalClaimable += grant.pricePerUse;
        emit UsageSettled(
            licenseId, key, grant.brick, grant.pricePerUse, evidenceHash, grant.payoutVersion
        );
    }

    /// @notice Rights holders receive royalties regardless of node ownership.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "Settlement: nothing to claim");
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        require(token.transfer(msg.sender, amount), "Settlement: payout failed");
        emit RoyaltyClaimed(msg.sender, amount);
    }
}
