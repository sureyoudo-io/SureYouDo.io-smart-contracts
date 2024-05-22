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

    /**
     * @dev Adds a new charity to the system.
     * @param charityAddress The address of the charity contract.
    */
    function addCharity(address charityAddress, string calldata name) external onlyOwner {
        if (_charities[charityAddress].charityAddress != address(0)) {
            revert CharityAlreadyExists();
        }
        _charities[charityAddress] = Charity({name: name, charityAddress: charityAddress, isActive: true});
        _charityAddresses.push(charityAddress);
        emit CharityAdded(charityAddress);
    }

    /**
     * @dev Modifies an existing charity.
     * @param charityAddress The address of the charity contract.
     * @param name The new name of the charity.
     * @param isActive The new status of the charity.
    */
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

    /**
     * @dev Adds a donation to a charity.
     * @param charityAddress The address of the charity contract.
     * @param amount The amount of the donation.
     * @param targetToken The token address of the donation.
    */
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

    /**
     * @dev Checks if a charity is active.
     * @param charityAddress The address of the charity contract.
     * @return bool
    */
    function isCharityActive(address charityAddress) external view returns (bool) {
        return _charities[charityAddress].isActive;
    }

    /**
     * @dev Gets all charities.
     * @return Charity[] An array of all charities.
    */
    function getAllCharities() external view returns (Charity[] memory) {
        uint charityAddressesLength = _charityAddresses.length;

        Charity[] memory charities = new Charity[](charityAddressesLength);
        for (uint256 i = 0; i < charityAddressesLength; i++) {
            charities[i] = _charities[_charityAddresses[i]];
        }
        return charities;
    }

    /**
     * @dev Gets all charity addresses.
     * @return address[] An array of all charity addresses.
    */
    function getCharityAddresses() external view returns (address[] memory) {
        return _charityAddresses;
    }

    /**
     * @dev Gets a charity for a given address.
     * @param charityAddress The address of the charity contract.
     * @return Charity The charity object.
    */
    function getCharity(address charityAddress) external view returns (Charity memory) {
        return _charities[charityAddress];
    }

    /**
     * @dev Gets the total donation for a charity.
     * @param charityAddress The address of the charity contract.
     * @param targetToken The token address of the donation.
     * @return uint256 The total donation amount.
    */
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
