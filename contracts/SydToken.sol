// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ISYDToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function mint(address account, uint256 amount) external;
    function burn(uint256 amount) external;
}

contract SydToken is ERC20 {
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
