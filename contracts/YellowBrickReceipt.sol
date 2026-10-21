// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Non-transferable wallet-visible proof that a factory registered a Brick.
/// @dev Receipt ownership does not grant IP title, licensing, or control of the Brick.
contract YellowBrickReceipt is ERC721 {
    address public immutable factory;
    mapping(uint256 => address) public brickForToken;
    mapping(uint256 => string) public coverURI;

    // ERC-4906 metadata-update extension. Artwork does not change Brick commitments.
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(address authorizedFactory) ERC721("Yellow Brick Registration", "YBRR") {
        require(authorizedFactory != address(0), "Receipt: bad factory");
        factory = authorizedFactory;
    }

    function mint(address holder, uint256 tokenId, address brick) external {
        require(msg.sender == factory, "Receipt: only factory");
        require(brick != address(0), "Receipt: bad brick");
        brickForToken[tokenId] = brick;
        _mint(holder, tokenId);
    }

    function artworkVersion() external pure returns (uint256) { return 1; }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0x49064906 || super.supportsInterface(interfaceId);
    }

    /// @notice Publish a cover for owned receipts, or clear it with an empty URI.
    /// @dev Only the receipt holder may change its display. Approved operators cannot.
    ///      A bare IPFS CID is required: no mutable hosts, keys, paths or JSON injection.
    ///      Setting an image is a display assertion, not a grant of artwork rights.
    function setCovers(uint256[] calldata tokenIds, string calldata imageURI) external {
        require(tokenIds.length > 0 && tokenIds.length <= 32, "Receipt: cover batch limit");
        require(_validCoverURI(bytes(imageURI)), "Receipt: invalid cover URI");
        bytes32 digest = keccak256(bytes(imageURI));
        for (uint256 i; i < tokenIds.length; ++i) {
            uint256 id = tokenIds[i];
            require(_requireOwned(id) == msg.sender, "Receipt: only holder");
            if (keccak256(bytes(coverURI[id])) != digest) {
                coverURI[id] = imageURI;
                emit MetadataUpdate(id);
            }
        }
    }

    function _validCoverURI(bytes memory value) private pure returns (bool) {
        if (value.length == 0) return true;
        if (value.length < 53 || value.length > 135) return false;
        bytes memory prefix = bytes("ipfs://");
        for (uint256 i; i < 7; ++i) if (value[i] != prefix[i]) return false;
        // Display URI syntax only. The publishing bridge validates the image and CID bytes.
        if (!((value[7] == 0x62 && value[8] == 0x61 && value[9] == 0x66) ||
              (value[7] == 0x51 && value[8] == 0x6d))) return false;
        for (uint256 i = 7; i < value.length; ++i) {
            uint8 c = uint8(value[i]);
            if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122))) return false;
        }
        return true;
    }

    /// @notice Self-contained fallback for registrations without a published cover.
    function defaultImage() public pure returns (string memory) {
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img">',
            '<title>', unicode"🟨", ' Yellow Brick</title>',
            '<rect width="512" height="512" rx="48" fill="#172027"/>',
            '<rect x="64" y="64" width="384" height="384" rx="40" fill="#FFD93D"/>',
            '</svg>'
        );
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }

    /// @notice ERC-721 metadata. Its image points to the public cover, never encrypted sources.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory image = coverURI[tokenId];
        bool hasCover = bytes(image).length != 0;
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat(
                '{"name":"Yellow Brick Registration",',
                '"description":"Non-transferable registration receipt. This token is not evidence of legal intellectual property ownership.",',
                '"image":"', hasCover ? image : defaultImage(), '",',
                '"attributes":[{"trait_type":"Default Artwork","value":"',
                hasCover ? "creator-published-cover" : "yellow-square-v1", '"},',
                '{"trait_type":"Brick Contract","value":"',
                Strings.toHexString(brickForToken[tokenId]),
                '"},{"trait_type":"Registration IP ID","value":"',
                Strings.toHexString(tokenId, 32),
                '"}]}'
            )))
        );
    }

    /// @dev Prevent sales or transfer of a registration receipt mistaken for IP rights.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address prior = _ownerOf(tokenId);
        require(prior == address(0) || to == address(0), "Receipt: not transferable");
        return super._update(to, tokenId, auth);
    }
}
