// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Experimental weighted, universal-participation governance.
/// @dev A trusted identity attester is used in v0.3. It is NOT Sybil-proof.
contract RoadGovernance {
    struct Voter { bytes32 identity; uint8 weight; uint64 joinedAt; }
    struct Proposal {
        address target;
        bytes32 callHash;
        uint64 createdAt;
        uint64 voteEnds;
        uint64 unlocksAt;
        uint256 yesWeight;
        uint256 noWeight;
        uint32 yesPeople;
        uint32 noPeople;
        bool executed;
    }
    uint64 public constant VOTING_PERIOD = 2 days;
    uint64 public constant TIMELOCK = 1 days;
    uint8 public constant MAX_WEIGHT = 5;
    address public immutable attester;
    address public immutable bootstrapper;
    address public treasury;
    address public registry;
    bool public configured;
    uint256 public proposalCount;

    mapping(address => Voter) public voters;
    mapping(bytes32 => bool) public claimedIdentity;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public voted;

    event Enrolled(address indexed user, bytes32 indexed identity, uint8 weight);
    event TargetsConfigured(address treasury, address registry);
    event Proposed(uint256 indexed proposal, address indexed target, bytes32 callHash);
    event Voted(uint256 indexed proposal, address indexed user, bool support, uint8 weight);
    event Executed(uint256 indexed proposal);

    constructor(address _attester) {
        require(_attester != address(0), "Governance: zero attester");
        attester = _attester;
        bootstrapper = msg.sender;
    }

    /// @dev Permissioned proof-of-personhood placeholder. One weight per attested unique identity.
    function enroll(address user, bytes32 identity, uint8 weight) external {
        require(msg.sender == attester, "Governance: not attester");
        require(user != address(0) && identity != bytes32(0), "Governance: invalid identity");
        require(voters[user].weight == 0 && !claimedIdentity[identity], "Governance: duplicate identity");
        require(weight >= 1 && weight <= MAX_WEIGHT, "Governance: invalid weight");
        voters[user] = Voter(identity, weight, uint64(block.timestamp));
        claimedIdentity[identity] = true;
        emit Enrolled(user, identity, weight);
    }

    /// @notice One-time authorization of two narrowly-scoped contracts.
    function configureTargets(address _treasury, address _registry) external {
        require(msg.sender == bootstrapper && !configured, "Governance: bootstrap only");
        require(_treasury.code.length > 0 && _registry.code.length > 0, "Governance: contracts only");
        treasury = _treasury;
        registry = _registry;
        configured = true;
        emit TargetsConfigured(_treasury, _registry);
    }

    function propose(address target, bytes calldata callData) external returns (uint256 id) {
        require(configured && voters[msg.sender].weight > 0, "Governance: not eligible");
        require(target == treasury || target == registry, "Governance: target forbidden");
        require(callData.length >= 4, "Governance: empty action");
        id = ++proposalCount;
        proposals[id] = Proposal(
            target, keccak256(callData), uint64(block.timestamp),
            uint64(block.timestamp + VOTING_PERIOD),
            uint64(block.timestamp + VOTING_PERIOD + TIMELOCK),
            0, 0, 0, 0, false
        );
        emit Proposed(id, target, keccak256(callData));
    }

    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(p.target != address(0) && block.timestamp < p.voteEnds, "Governance: voting closed");
        Voter memory v = voters[msg.sender];
        require(v.weight > 0 && v.joinedAt <= p.createdAt, "Governance: not snapshot voter");
        require(!voted[id][msg.sender], "Governance: already voted");
        voted[id][msg.sender] = true;
        if (support) { p.yesWeight += v.weight; p.yesPeople++; }
        else { p.noWeight += v.weight; p.noPeople++; }
        emit Voted(id, msg.sender, support, v.weight);
    }

    function execute(uint256 id, bytes calldata callData) external {
        Proposal storage p = proposals[id];
        require(p.target != address(0), "Governance: unknown proposal");
        require(!p.executed && block.timestamp >= p.unlocksAt, "Governance: timelocked");
        require(p.callHash == keccak256(callData), "Governance: action mismatch");
        require(p.yesPeople >= 2 && p.yesWeight > p.noWeight, "Governance: not approved");
        require(p.yesWeight + p.noWeight >= 3, "Governance: quorum");
        p.executed = true;
        (bool ok, bytes memory result) = p.target.call(callData);
        if (!ok) {
            if (result.length != 0) {
                assembly { revert(add(result, 32), mload(result)) }
            }
            revert("Governance: execution failed");
        }
        emit Executed(id);
    }
}
