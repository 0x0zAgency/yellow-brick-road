// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface IRoadNodeEligibility { function isEligible(address operator) external view returns (bool); }
interface IRoadPaymentAsset {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from,address to,uint256 value) external returns (bool);
    function transfer(address to,uint256 value) external returns (bool);
}
/// @notice Prototype community-budget-capped Road utility.
/// @dev Completely separate from rights-holder royalties; not yet hooked into settlement.
///      Exact payments and measured operator service are governed and attested externally.
contract RoadTreasury {
    address public immutable governance;
    IRoadNodeEligibility public immutable nodes;
    IRoadPaymentAsset public immutable asset;
    uint64 public currentPeriod;
    uint64 public periodEnds;
    uint256 public rateBps;
    uint256 public target;
    uint256 public collected;
    uint256 public spent;
    mapping(bytes32 => bool) public usedServiceClaims;
    bool private entered;
    event BudgetOpened(uint64 indexed period,uint256 fundingTarget,uint256 feeBps);
    event FeeCollected(uint64 indexed period,address indexed payer,uint256 amount);
    event ServicePaid(address indexed operator,bytes32 indexed workId,uint256 amount);
    modifier onlyGovernance() { require(msg.sender == governance,"Treasury: governance only"); _; }
    modifier nonReentrant() { require(!entered,"Treasury: reentrant"); entered=true; _; entered=false; }
    constructor(address governor,address nodeRegistry,address token) {
        require(governor.code.length>0 && nodeRegistry.code.length>0 && token.code.length>0,"Treasury: invalid contracts");
        governance=governor; nodes=IRoadNodeEligibility(nodeRegistry); asset=IRoadPaymentAsset(token);
    }
    /// @dev New period counts remaining treasury balance toward the next budget.
    ///      A new target must be funded only to the extent existing funds are insufficient.
    function openBudget(uint256 totalAuthorizedFunds,uint256 feeBps) external onlyGovernance {
        require(feeBps <= 100, "Treasury: max 1 percent");
        require(totalAuthorizedFunds > 0,"Treasury: zero budget");
        require(currentPeriod==0 || block.timestamp >= periodEnds,"Treasury: period still open");
        require(totalAuthorizedFunds >= asset.balanceOf(address(this)),"Treasury: below reserve");
        currentPeriod++;
        periodEnds=uint64(block.timestamp+30 days);
        target=totalAuthorizedFunds-asset.balanceOf(address(this));
        collected=0;
        spent=0;
        rateBps=feeBps;
        emit BudgetOpened(currentPeriod,target,feeBps);
    }
    function quote(uint256 transactionAmount) public view returns (uint256) {
        if(currentPeriod==0 || block.timestamp>=periodEnds || collected>=target) return 0;
        uint256 proposed=transactionAmount*rateBps/10000;
        uint256 remaining=target-collected;
        return proposed<=remaining?proposed:remaining;
    }
    /// @dev Payer-facing funding route; this cannot levy arbitrary off-protocol payments.
    function collect(uint256 transactionAmount,uint256 maximumFee) external nonReentrant returns(uint256 fee) {
        fee=quote(transactionAmount);
        require(fee<=maximumFee,"Treasury: fee slippage");
        if(fee==0) return 0;
        collected+=fee;
        uint256 beforeBalance=asset.balanceOf(address(this));
        require(asset.transferFrom(msg.sender,address(this),fee),"Treasury: payment failed");
        require(asset.balanceOf(address(this))-beforeBalance==fee,"Treasury: unsupported token");
        emit FeeCollected(currentPeriod,msg.sender,fee);
    }
    /// @dev A reviewed service payment must pass a weighted vote and timelock.
    ///      Neither operators nor founders can drain the treasury unilaterally.
    function payService(address operator,bytes32 workId,uint256 amount) external onlyGovernance nonReentrant {
        require(nodes.isEligible(operator),"Treasury: ineligible node");
        require(workId!=bytes32(0) && !usedServiceClaims[workId],"Treasury: duplicate work");
        require(amount>0 && amount<=asset.balanceOf(address(this)),"Treasury: insufficient funds");
        usedServiceClaims[workId]=true;
        spent+=amount;
        require(asset.transfer(operator,amount),"Treasury: payout failed");
        emit ServicePaid(operator,workId,amount);
    }
}
