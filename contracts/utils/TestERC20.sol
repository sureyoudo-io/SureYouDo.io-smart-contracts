// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor() ERC20("TestERC20", "TST") {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }
}
