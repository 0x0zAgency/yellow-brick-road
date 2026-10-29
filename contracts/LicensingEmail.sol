// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Bounded ASCII dot-atom mailbox and DNS domain. Empty clears the contact.
library LicensingEmail {
    function valid(bytes memory value) internal pure returns (bool) {
        if (value.length == 0) return true;
        if (value.length > 254) return false;
        uint256 at;
        bytes memory punctuation = bytes("!#$%&'*+-/=?^_`{|}~.");
        for (; at < value.length && value[at] != 0x40; ++at) {
            uint8 c = uint8(value[at]);
            bool allowed = alnum(c);
            for (uint256 j; !allowed && j < punctuation.length; ++j) allowed = value[at] == punctuation[j];
            if (!allowed || (c == 46 && (at == 0 || value[at - 1] == 0x2e))) return false;
        }
        if (at == 0 || at > 64 || at + 1 >= value.length || value[at - 1] == 0x2e) return false;
        uint256 label;
        uint256 dots;
        for (uint256 i = at + 1; i < value.length; ++i) {
            uint8 c = uint8(value[i]);
            if (c == 46) {
                if (label == 0 || value[i - 1] == 0x2d) return false;
                label = 0;
                dots++;
            } else {
                if (!alnum(c) && c != 45 || c == 45 && label == 0) return false;
                if (++label > 63) return false;
            }
        }
        return dots > 0 && label > 0 && value[value.length - 1] != 0x2d;
    }

    function alnum(uint8 c) private pure returns (bool) {
        return c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122;
    }
}
