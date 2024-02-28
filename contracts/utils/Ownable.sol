// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Ownable {
    error Unauthorized();
    error OwnerAddressRequired();

    address public owner;
    address public mainContract;

    constructor(address _owner, address _mainContract) {
        if (_owner == address(0)) {
            revert OwnerAddressRequired();
        }
        owner = _owner;
        mainContract = _mainContract;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyMainContract() {
        if (msg.sender != mainContract) {
            revert Unauthorized();
        }
        _;
    }
}
