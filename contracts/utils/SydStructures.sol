// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

library SydStructures {
    uint8 internal constant DISTRIBUTE_TO_PARTICIPANTS = 0;
    uint8 internal constant ADD_TO_COMMUNITY = 1;
    uint8 internal constant TRANSFER_TO_ADDRESS = 2;
    uint8 internal constant DONATE_TO_CHARITY = 3;

    // COMMISSION_PRECISION is set to 10_000 instead of 100 to allow for two decimal places of precision.
    // As it allows us to represent percentages like 1.23% accurately.
    uint256 internal constant COMMISSION_PRECISION = 10_000;

    struct Challenge {
        uint64 id;
        uint32 checkInPeriod;
        uint8 penaltyType;
        uint8 participantsCount;
        string title;
        uint256 valuePromised;
        uint256 duration;
        address[] joinedParticipants;
        uint256 createdAt;
        uint256 startedAt;
        uint256 finalizedAt;
        uint256 platformCommission;
    }

    struct Participant {
        bool isAllowed;
        uint256 joinedAt;
    }

    struct ParticipantDetails {
        bool isAllowed;
        bool isWinner;
        uint256 joinedAt;
        uint256 checkInCount;
        uint256 lastCheckInAt;
    }

    struct LockDetails {
        uint256 amount;
        uint256 lockedAt;
        address lockedToken;
        bool hasAvailableValue;
        uint256 winAmount;
        uint256 unlockedAmount;
        uint256 lastWithdrawalAt;
        uint256 totalWithdrawn;
    }
}
