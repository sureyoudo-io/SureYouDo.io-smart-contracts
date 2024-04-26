// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

import "./utils/Ownable.sol";

/**
 * @title AllowedTokensManager
 * @notice This contract manages the tokens that are allowed for locking in the SureYouDo contract.
 * It leverages the Ownable contract for ownership management.
 */
contract AllowedTokensManager is Ownable {
    error ATM_InvalidTokenAddress();
    error ATM_TokenAlreadyAdded();
    error ATM_TokenDoesNotExist();

    mapping(address => bool) internal _allowedTokens;
    mapping(address => bool) internal _proAccountAllowedOnlyTokens;

    event AllowedTokenAdded(address indexed tokenAddress);
    event AllowedTokenRemoved(address indexed tokenAddress);

    /**
     * @notice Constructs the AllowedTokensManager contract.
     * @param ownerAddress The address of the owner.
     * @param sureYouDoContract The address of the SureYouDo contract with which is the main contract.
     */
    constructor(address ownerAddress, address sureYouDoContract) Ownable(ownerAddress, sureYouDoContract) {}

    /**
     * @notice Adds a token to the list of allowed tokens. Only the owner can call this function.
     * @param tokenAddress The address of the token to be added.
     */
    function addAllowedToken(address tokenAddress, bool proAccountOnly) external onlyOwner {
        if (tokenAddress == address(0)) {
            revert ATM_InvalidTokenAddress();
        }
        if (_allowedTokens[tokenAddress]) {
            revert ATM_TokenAlreadyAdded();
        }
        _allowedTokens[tokenAddress] = true;
        if (proAccountOnly) {
            _proAccountAllowedOnlyTokens[tokenAddress] = true;
        }
        emit AllowedTokenAdded(tokenAddress);
    }

    /**
     * @notice Removes a token from the list of allowed tokens. Only the owner can call this function.
     * @param tokenAddress The address of the token to be removed.
     */
    function removeAllowedToken(address tokenAddress) external onlyOwner {
        if (!_allowedTokens[tokenAddress] || tokenAddress == address(0)) {
            revert ATM_TokenDoesNotExist();
        }
        delete _allowedTokens[tokenAddress];
        delete _proAccountAllowedOnlyTokens[tokenAddress];
        emit AllowedTokenRemoved(tokenAddress);
    }

    /**
     * @notice Updates the proAccountOnly status of a token. Only the owner can call this function.
     * @param tokenAddress The address of the token to be updated.
     * @param proAccountOnly The new status of the token.
     */
    function updateProAccountOnlyToken(address tokenAddress, bool proAccountOnly) external onlyOwner {
        if (!_allowedTokens[tokenAddress] || tokenAddress == address(0)) {
            revert ATM_TokenDoesNotExist();
        }
        if (proAccountOnly) {
            _proAccountAllowedOnlyTokens[tokenAddress] = true;
        } else {
            delete _proAccountAllowedOnlyTokens[tokenAddress];
        }
    }

    /**
     * @notice Checks if a token is allowed. This internal function supports functionality
     * within the contract or its derivatives.
     * @param tokenAddress The address of the token to be checked.
     * @return bool Returns true if the token is allowed, false otherwise.
     */
    function _isTokenAllowed(address tokenAddress) internal view returns (bool) {
        return _allowedTokens[tokenAddress];
    }

    function _isProAccountOnlyToken(address tokenAddress) internal view returns (bool) {
        return _proAccountAllowedOnlyTokens[tokenAddress];
    }
}
