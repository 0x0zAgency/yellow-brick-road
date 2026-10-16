// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice Governance-attested node and service operator registry.
/// @dev Off-chain attestations are not cryptographic proof of hardware ownership.
contract RoadNodeRegistry {
    struct Operator { bytes32 nodeProof; bytes32 serviceProof; bool eligible; }
    address public immutable governance;
    mapping(address => Operator) public operators;
    event OperatorAttested(address indexed operator, bytes32 nodeProof, bytes32 serviceProof, bool eligible);
    constructor(address governor) {
        require(governor.code.length > 0, "Registry: governor required");
        governance = governor;
    }
    function attest(address operator, bytes32 nodeProof, bytes32 serviceProof, bool eligible) external {
        require(msg.sender == governance, "Registry: governance only");
        require(operator != address(0), "Registry: zero operator");
        require(!eligible || (nodeProof != bytes32(0) && serviceProof != bytes32(0)), "Registry: evidence required");
        operators[operator] = Operator(nodeProof, serviceProof, eligible);
        emit OperatorAttested(operator, nodeProof, serviceProof, eligible);
    }
    function isEligible(address operator) external view returns (bool) {
        return operators[operator].eligible;
    }
}
