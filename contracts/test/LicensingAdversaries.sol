// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract LicensingClaimRecipient {
    bool public rejectPayment;
    bool public reenter;
    bool public reentrySucceeded;
    function configure(bool reject, bool attack) external { rejectPayment = reject; reenter = attack; }
    function claim(address brick, address asset) external {
        (bool ok, bytes memory reason) = brick.call(abi.encodeWithSignature("claimIPFunds(address)", asset));
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }
    receive() external payable {
        require(!rejectPayment, "reject payment");
        if (reenter) (reentrySucceeded,) = msg.sender.call(abi.encodeWithSignature("claimIPFunds(address)", address(0)));
    }
}
contract LicensingContractController {
    address public immutable signer;
    constructor(address authority) { signer = authority; }
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return ECDSA.recover(digest, signature) == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
    function execute(address target, bytes calldata data) external {
        require(msg.sender == signer, "not signer");
        (bool ok, bytes memory reason) = target.call(data);
        if (!ok) assembly { revert(add(reason, 32), mload(reason)) }
    }
}
contract LicensingTaxToken is ERC20 {
    constructor() ERC20("Tax test token", "TAX") {}
    function mint(address recipient, uint256 amount) external { _mint(recipient, amount); }
    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 tax = amount / 10;
            super._update(from, address(1), tax);
            amount -= tax;
        }
        super._update(from, to, amount);
    }
}
