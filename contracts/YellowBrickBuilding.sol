// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IYellowBrickFactoryView {
    function isBrick(address brick) external view returns (bool);
}

/// @notice Compositions reference IP works without acquiring their rights.
contract YellowBrickBuilding {
    struct Member { address brick; bytes32 relationship; bytes32 evidenceHash; bool active; }

    address public immutable factory;
    address public immutable builder;
    bytes32 public immutable buildingType;
    string public metadataURI;
    Member[] private members;
    mapping(address => uint256) private activeIndexPlusOne;

    event MemberLinked(address indexed brick, bytes32 indexed relationship, bytes32 indexed evidenceHash);
    event MemberUnlinked(address indexed brick);

    modifier onlyBuilder() {
        require(msg.sender == builder, "Building: not builder");
        _;
    }

    constructor(address registry, bytes32 kind, string memory uri) {
        require(registry.code.length != 0 && kind != bytes32(0), "Building: bad config");
        factory = registry;
        builder = msg.sender;
        buildingType = kind;
        metadataURI = uri;
    }

    function linkMember(address brick, bytes32 relation, bytes32 evidence) external onlyBuilder {
        require(IYellowBrickFactoryView(factory).isBrick(brick), "Building: unknown brick");
        require(relation != bytes32(0), "Building: missing relation");
        require(activeIndexPlusOne[brick] == 0, "Building: already linked");
        members.push(Member(brick, relation, evidence, true));
        activeIndexPlusOne[brick] = members.length;
        emit MemberLinked(brick, relation, evidence);
    }

    function unlinkMember(address brick) external onlyBuilder {
        uint256 index = activeIndexPlusOne[brick];
        require(index != 0, "Building: not linked");
        members[index - 1].active = false;
        delete activeIndexPlusOne[brick];
        emit MemberUnlinked(brick);
    }

    function memberCount() external view returns (uint256) { return members.length; }
    function memberAt(uint256 i) external view returns (Member memory) { return members[i]; }
    function isMember(address brick) external view returns (bool) { return activeIndexPlusOne[brick] != 0; }
}
