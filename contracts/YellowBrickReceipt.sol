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

    /// @notice A self-contained default image for every registration NFT.
    /// @dev One artwork preset for now. Future IP-specific presets can be selected
    ///      here without changing the meaning of registration tokens.
    ///      SVG geometry is the visual fallback if wallet renderers lack emoji fonts.
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

    /// @notice Inline metadata so registration receipts do not depend on a remote host.
    /// @dev Never embeds creator-supplied plaintext or rights declarations.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat(
                '{"name":"Yellow Brick Registration",',
                '"description":"Non-transferable registration receipt. This token is not evidence of legal intellectual property ownership.",',
                '"image":"', defaultImage(), '",',
                '"attributes":[{"trait_type":"Default Artwork","value":"yellow-square-v1"},',
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
