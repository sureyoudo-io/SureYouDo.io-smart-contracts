// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "./utils/Ownable.sol";

contract SydCharityManager is Ownable, ReentrancyGuard {
    error CharityAlreadyExists();
    error CharityDoesNotExist();
    error CharityNotActive();

    struct Charity {
        string name;
        address charityAddress;
        bool isActive;
    }

    address[] internal _charityAddresses;
    mapping(address => Charity) internal _charities;
    mapping(address => uint256) internal _totalDonationPerCharity;
    mapping(address => mapping(address => uint256)) internal _totalDonationPerCharityPerToken;

    event CharityAdded(address charityAddress);
    event CharityModified(address charityAddress);

    constructor(address owner, address mainContract) Ownable(owner, mainContract) {}

    function addCharity(address charityAddress, string calldata name) external onlyOwner {
        if (_charities[charityAddress].charityAddress != address(0)) {
            revert CharityAlreadyExists();
        }
        _charities[charityAddress] = Charity({name: name, charityAddress: charityAddress, isActive: true});
        _charityAddresses.push(charityAddress);
        emit CharityAdded(charityAddress);
    }

    function modifyCharity(address charityAddress, string calldata name, bool isActive) external onlyOwner {
        if (_charities[charityAddress].charityAddress == address(0)) {
            revert CharityDoesNotExist();
        }
        Charity storage charity = _charities[charityAddress];

        if (bytes(name).length > 0) {
            charity.name = name;
        }

        if (charity.isActive != isActive) {
            charity.isActive = isActive;
        }

        emit CharityModified(charityAddress);
    }

    function addDonation(
        address charityAddress,
        uint256 amount,
        address targetToken
    ) external onlyMainContract nonReentrant {
        if (_charities[charityAddress].charityAddress == address(0)) {
            revert CharityDoesNotExist();
        }
        if (!_charities[charityAddress].isActive) {
            revert CharityNotActive();
        }

        if (targetToken != address(0)) {
            _totalDonationPerCharityPerToken[charityAddress][targetToken] += amount;
        } else {
            _totalDonationPerCharity[charityAddress] += amount;
        }
    }

    function isCharityActive(address charityAddress) external view returns (bool) {
        return _charities[charityAddress].isActive;
    }

    function getAllCharities() external view returns (Charity[] memory) {
        Charity[] memory charities = new Charity[](_charityAddresses.length);
        for (uint256 i = 0; i < _charityAddresses.length; i++) {
            charities[i] = _charities[_charityAddresses[i]];
        }
        return charities;
    }

    function getCharityAddresses() external view returns (address[] memory) {
        return _charityAddresses;
    }

    function getCharity(address charityAddress) external view returns (Charity memory) {
        return _charities[charityAddress];
    }

    function getTotalDonation(address charityAddress, address targetToken) external view returns (uint256) {
        if (targetToken != address(0)) {
            return _totalDonationPerCharityPerToken[charityAddress][targetToken];
        }
        return _totalDonationPerCharity[charityAddress];
    }
}

interface ISydCharityManager {
    function initialize(address owner, address mainContract) external;
    function addCharity(address charityAddress, string calldata name) external;
    function modifyCharity(address charityAddress, string calldata name, bool isActive) external;
    function addDonation(address charityAddress, uint256 amount, address targetToken) external;
    function isCharityActive(address charityAddress) external view returns (bool);
    function getAllCharities() external view returns (ISydCharityManager.Charity[] memory);
    function getCharityAddresses() external view returns (address[] memory);
    function getCharity(address charityAddress) external view returns (ISydCharityManager.Charity memory);
    function getTotalDonation(address charityAddress, address targetToken) external view returns (uint256);

    struct Charity {
        string name;
        address charityAddress;
        bool isActive;
    }

    event CharityAdded(address charityAddress);
    event CharityModified(address charityAddress);
}
