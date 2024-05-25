// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// @dev This is only for testing purposes
contract SYDMock is ERC20 {
    error InvalidInitialMintParams();
    error InvalidMintAddress();

    /**
     * @dev constructor
     * @param _name token name
     * @param _symbol token symbol
     * @param _mintAddresses array of address to hold initial tokens
     * @param _mintAmounts array of initial token amounts to be minted to mint addresses
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address[] memory _mintAddresses,
        uint256[] memory _mintAmounts
    ) ERC20(_name, _symbol) {
        if (_mintAddresses.length != _mintAmounts.length) {
            revert InvalidInitialMintParams();
        }

        for (uint i; i < _mintAddresses.length; i++) {
            if (_mintAddresses[i] == address(0)) {
                revert InvalidMintAddress();
            }
            ERC20._mint(_mintAddresses[i], _mintAmounts[i]);
        }
    }

    /**
     * @dev should allow every address to burn their own tokens (needed in SYD)
     * @param _amount amount to burn
     */
    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}
