// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "./utils/Ownable.sol";
import {SydStructures} from "./utils/SydStructures.sol";

contract SydChallengeManager is Ownable {
    error NotAllowedToJoin();
    error AlreadyJoined();
    error ChallengeAlreadyStarted();
    error NotAllowedToCheckIn();
    error AlreadyCheckedIn();
    error CheckInDurationEnded();
    error CheckInNotRequired();
    error ChallengeNotStarted();
    error ChallengeNotEnded();
    error VerificationRequired();
    error NotEligibleToFinalize();
    error ChallengeAlreadyFinalized();
    error NotEligibleToVerify();
    error NotAllParticipantsHaveCheckedIn();
    error InvalidParticipantsCount();

    struct Verifier {
        address verifierAddress;
        uint256 verifiedAt;
    }

    // Challenge data structure starts
    SydStructures.Challenge[] internal _challenges;
    mapping(uint256 => mapping(address => bool)) internal _challengeParticipantIsAllowed;
    mapping(uint256 => mapping(address => uint256)) internal _challengeParticipantJoinedAt;
    mapping(uint256 => mapping(address => uint256)) internal _challengeParticipantCheckIns;
    mapping(uint256 => mapping(address => uint256)) internal _challengeParticipantLastCheckInTimes;
    mapping(uint256 => mapping(address => bool)) internal _challengeWinners;
    mapping(uint256 => Verifier) internal _challengeVerifiers;
    mapping(uint256 => address) internal _challengeTokenToLock;
    mapping(uint256 => address) internal _challengePenaltyToAddress;
    mapping(address => uint256[]) internal _userChallenges;
    mapping(address => uint256[]) internal _verifierChallenges;
    // Challenge data structure ends

    event ChallengeStarted(uint64 indexed challengeId);

    constructor(address owner, address mainContract) Ownable(owner, mainContract) {}

    /**
     * @dev Adds a new challenge to the list of challenges.
     * @param creator The address of the creator of the challenge.
     * @param title The title of the challenge.
     * @param valuePromised The value promised by the creator.
     * @param duration The duration of the challenge in days.
     * @param checkInPeriod The check-in period of the challenge in days.
     * @param verifier The address of the verifier of the challenge.
     * @param penaltyType The action to be taken in case of failure.
     * @param penaltyRecipientAddress The address to which the penalty will be transferred.
     * @param otherParticipants The addresses of the other participants.
     * @param platformCommissionPercentage The commission percentage of the platform.
     * @param tokenToLock The address of the token to be locked.
     * @return uint64 The id of the challenge.
     */
    function addChallenge(
        address creator,
        string memory title,
        uint256 valuePromised,
        uint256 duration,
        uint32 checkInPeriod,
        address verifier,
        uint8 penaltyType,
        address penaltyRecipientAddress,
        address[] memory otherParticipants,
        uint32 platformCommissionPercentage,
        address tokenToLock
    ) external onlyMainContract returns (uint64) {
        uint64 id = uint64(_challenges.length);

        address[] memory joinedParticipants = new address[](1);
        joinedParticipants[0] = creator;

        SydStructures.Challenge memory challenge;
        challenge.id = id;
        challenge.title = title;
        challenge.valuePromised = valuePromised;
        challenge.duration = duration;
        challenge.checkInPeriod = checkInPeriod;
        challenge.penaltyType = penaltyType;
        challenge.participantsCount = 1 + uint8(otherParticipants.length);
        challenge.joinedParticipants = joinedParticipants;
        challenge.createdAt = block.timestamp;
        challenge.platformCommission =
            (valuePromised * platformCommissionPercentage) /
            SydStructures.COMMISSION_PRECISION;

        if (verifier != address(0)) {
            _challengeVerifiers[id] = Verifier({verifierAddress: verifier, verifiedAt: 0});
            _verifierChallenges[verifier].push(id);
        }

        if (penaltyType == SydStructures.TRANSFER_TO_ADDRESS || penaltyType == SydStructures.DONATE_TO_CHARITY) {
            _challengePenaltyToAddress[id] = penaltyRecipientAddress;
        }

        if (tokenToLock != address(0)) {
            _challengeTokenToLock[id] = tokenToLock;
        }

        if (otherParticipants.length == 0) {
            challenge.startedAt = block.timestamp;
            emit ChallengeStarted(id);
        }

        _challenges.push(challenge);
        _userChallenges[creator].push(id);

        _challengeParticipantIsAllowed[id][creator] = true;
        _challengeParticipantJoinedAt[id][creator] = block.timestamp;

        // add all other participants to the challenge
        for (uint i = 0; i < otherParticipants.length; i++) {
            _challengeParticipantIsAllowed[id][otherParticipants[i]] = true;
        }

        return id;
    }

    /**
     * @dev Adds a participant to the challenge.
     * @param challengeId The id of the challenge.
     * @param participant The address of the participant to be added.
     * @return bool True if the participant is added, false otherwise.
     */
    function addParticipantToChallenge(
        uint64 challengeId,
        address participant
    ) external onlyMainContract returns (bool) {
        if (_challengeParticipantIsAllowed[challengeId][participant] == false) {
            revert NotAllowedToJoin();
        }

        // Check if the participant has already joined
        if (_challengeParticipantJoinedAt[challengeId][participant] > 0) {
            revert AlreadyJoined();
        }

        SydStructures.Challenge storage challenge = _challenges[challengeId];

        // Update participant's joined status
        _challengeParticipantJoinedAt[challengeId][participant] = block.timestamp;
        challenge.joinedParticipants.push(participant);
        _userChallenges[participant].push(challengeId);

        // Start the challenge if all participants have joined
        if (challenge.joinedParticipants.length == challenge.participantsCount) {
            challenge.startedAt = block.timestamp;
            emit ChallengeStarted(challengeId);
        }

        return true;
    }

    /**
     * @dev Returns the challenge details.
     * @param challengeId The id of the challenge.
     * @return SydStructures.Challenge The challenge details.
     * @return address The address to which the penalty will be transferred.
     */
    function getChallenge(
        uint64 challengeId
    ) external view returns (SydStructures.Challenge memory, address, address, address) {
        return (
            _challenges[challengeId],
            _challengePenaltyToAddress[challengeId],
            _challengeTokenToLock[challengeId],
            _challengeVerifiers[challengeId].verifierAddress
        );
    }

    /**
     * @dev Returns all challenges.
     * @return Challenge[] All challenges.
     */
    function getChallenges() external view returns (SydStructures.Challenge[] memory) {
        return _challenges;
    }

    /**
     * @dev Returns the participants of a challenge.
     * @param challengeId The id of the challenge.
     * @return ParticipantDetails The details of the participant.
     */
    function getChallengeParticipant(
        uint256 challengeId,
        address participant
    ) external view returns (SydStructures.ParticipantDetails memory) {
        SydStructures.ParticipantDetails memory participantDetails;
        participantDetails.isAllowed = _challengeParticipantIsAllowed[challengeId][participant];
        participantDetails.joinedAt = _challengeParticipantJoinedAt[challengeId][participant];
        participantDetails.lastCheckInAt = _challengeParticipantLastCheckInTimes[challengeId][participant];
        participantDetails.checkInCount = _challengeParticipantCheckIns[challengeId][participant];
        participantDetails.isWinner = _challengeWinners[challengeId][participant];

        return participantDetails;
    }

    function getParticipantCheckInCount(uint256 challengeId, address participant) external view returns (uint256) {
        return _challengeParticipantCheckIns[challengeId][participant];
    }

    /**
     * @dev Returns all challenges count.
     * @return uint256 The count of all challenges.
     */
    function getChallengesCount() external view returns (uint256) {
        return _challenges.length;
    }

    /**
     * @dev Return platform commission of a challenge.
     * @param challengeId The id of the challenge.
     * @return platformCommission The platform commission of the challenge.
     */
    function getPlatformCommission(uint64 challengeId) external view returns (uint256) {
        return _challenges[challengeId].platformCommission;
    }

    /**
     * @dev Cancels a challenge.
     * @param challengeId The id of the challenge.
     */
    function cancelChallenge(uint256 challengeId) external onlyMainContract {
        SydStructures.Challenge storage challenge = _challenges[challengeId];
        if (challenge.startedAt > 0) {
            revert ChallengeAlreadyStarted();
        }

        // delete challenge token to lock
        delete _challengeTokenToLock[challengeId];

        // delete challenge penalty to address
        delete _challengePenaltyToAddress[challengeId];

        // delete challenge verifier
        delete _challengeVerifiers[challengeId];

        // delete challenge participants
        for (uint i = 0; i < challenge.joinedParticipants.length; i++) {
            delete _challengeParticipantIsAllowed[challengeId][challenge.joinedParticipants[i]];
            delete _challengeParticipantJoinedAt[challengeId][challenge.joinedParticipants[i]];
        }

        challenge.finalizedAt = block.timestamp;
    }

    /**
     * @dev Adds a check-in for a participant.
     * @param challengeId The id of the challenge.
     * @param participantAddress The address of the participant.
     * @return bool True if the check-in is the last one, false otherwise.
     */
    function addCheckIn(uint64 challengeId, address participantAddress) external onlyMainContract returns (bool) {
        SydStructures.Challenge storage challenge = _challenges[challengeId];
        if (challenge.startedAt == 0) {
            revert ChallengeNotStarted();
        }
        if (challenge.checkInPeriod == 0) {
            revert CheckInNotRequired();
        }

        uint256 currentDay = block.timestamp / 1 days;
        uint256 startDay = challenge.startedAt / 1 days;
        uint256 goalDay = startDay + challenge.duration;
        uint256 lastCheckInDay = _challengeParticipantLastCheckInTimes[challengeId][participantAddress] / 1 days;

        if (currentDay < lastCheckInDay + challenge.checkInPeriod) {
            revert AlreadyCheckedIn();
        }
        if (currentDay >= goalDay) {
            revert CheckInDurationEnded();
        }

        _challengeParticipantCheckIns[challengeId][participantAddress]++;
        _challengeParticipantLastCheckInTimes[challengeId][participantAddress] = block.timestamp;

        bool isLastCheckInDay = currentDay + challenge.checkInPeriod >= goalDay;

        return isLastCheckInDay;
    }

    /**
     * @dev Finalizes a challenge.
     * @param challengeId The id of the challenge.
     * @param participantAddress The address of the participant.
     * @return address[] The addresses of the participants.
     */
    function finalizeChallenge(
        uint256 challengeId,
        address participantAddress
    ) external onlyMainContract returns (address[] memory) {
        if (_challengeParticipantIsAllowed[challengeId][participantAddress] == false) {
            revert NotEligibleToFinalize();
        }

        SydStructures.Challenge storage challenge = _challenges[challengeId];
        if (challenge.checkInPeriod == 0 && _challengeVerifiers[challengeId].verifiedAt == 0) {
            revert VerificationRequired();
        }

        if (challenge.startedAt == 0) {
            revert ChallengeNotStarted();
        }
        if (challenge.finalizedAt > 0) {
            revert ChallengeAlreadyFinalized();
        }

        uint256 currentDay = block.timestamp / 1 days;
        uint256 lastCheckInDay = _challengeParticipantLastCheckInTimes[challengeId][participantAddress] / 1 days;
        uint256 goalDay = challenge.startedAt / 1 days + challenge.duration;

        // Check if all participants have checked in on the last day
        if (currentDay == goalDay - 1 && challenge.joinedParticipants.length > 1) {
            for (uint i = 0; i < challenge.joinedParticipants.length; i++) {
                if (_challengeParticipantLastCheckInTimes[challengeId][challenge.joinedParticipants[i]] < goalDay - 1) {
                    revert NotAllParticipantsHaveCheckedIn();
                }
            }
        }

        // Challenge can finalize only if on:
        // - Goal day and after or
        // - One day before the goal day if the participant has checked in on that day
        if (lastCheckInDay < goalDay - 1 && currentDay < goalDay) {
            revert ChallengeNotEnded();
        }

        challenge.finalizedAt = block.timestamp;

        return challenge.joinedParticipants;
    }

    /**
     * @dev Verifies and finalizes a challenge.
     * @param challengeId The id of the challenge.
     * @param verifierAddress The address of the verifier.
     * @param successfulParticipants The addresses of the successful participants.
     * @param failedParticipants The addresses of the failed participants.
     * @return bool True if the challenge is verified and finalized, false otherwise.
     */
    function verifyAndFinalizeChallenge(
        uint256 challengeId,
        address verifierAddress,
        address[] calldata successfulParticipants,
        address[] calldata failedParticipants
    ) external onlyMainContract returns (bool) {
        Verifier storage verifier = _challengeVerifiers[challengeId];
        if (verifier.verifierAddress != verifierAddress) {
            revert NotEligibleToVerify();
        }
        SydStructures.Challenge storage challenge = _challenges[challengeId];
        if (challenge.startedAt == 0) {
            revert ChallengeNotStarted();
        }
        uint256 endsAt = challenge.startedAt + (challenge.duration * 1 days);
        if (block.timestamp <= endsAt) {
            revert ChallengeNotEnded();
        }

        uint256 allParticipantsCount = successfulParticipants.length + failedParticipants.length;
        if (allParticipantsCount != challenge.participantsCount) {
            revert InvalidParticipantsCount();
        }

        for (uint i = 0; i < successfulParticipants.length; i++) {
            _challengeWinners[challengeId][successfulParticipants[i]] = true;
        }

        verifier.verifiedAt = block.timestamp;
        challenge.finalizedAt = block.timestamp;
        return true;
    }

    function getUserChallenges(address user) external view returns (uint256[] memory) {
        return _userChallenges[user];
    }

    function getVerifierChallenges(address verifier) external view returns (uint256[] memory) {
        return _verifierChallenges[verifier];
    }
}

interface ISydChallengeManager {
    function initialize(address owner, address mainContract) external;
    function addChallenge(
        address creator,
        string calldata title,
        uint256 valuePromised,
        uint256 duration,
        uint32 checkInPeriod,
        address verifier,
        uint8 penaltyType,
        address penaltyRecipientAddress,
        address[] calldata otherParticipants,
        uint32 platformCommissionPercentage,
        address tokenToLock
    ) external returns (uint64);
    function addParticipantToChallenge(uint64 challengeId, address participant) external returns (bool);
    function getChallenge(
        uint64 challengeId
    ) external view returns (ISydChallengeManager.Challenge memory, address, address, address);
    function getChallenges() external view returns (ISydChallengeManager.Challenge[] memory);
    function getChallengeParticipant(
        uint256 challengeId,
        address participant
    ) external view returns (bool, uint256, bool, uint256, uint256);
    function getParticipantCheckInCount(uint256 challengeId, address participant) external view returns (uint256);
    function getChallengesCount() external view returns (uint256);
    function getPlatformCommission(uint64 challengeId) external view returns (uint256);
    function cancelChallenge(uint256 challengeId) external;
    function addCheckIn(uint64 challengeId, address participantAddress) external returns (bool);
    function finalizeChallenge(uint256 challengeId, address participantAddress) external returns (address[] memory);
    function verifyAndFinalizeChallenge(
        uint256 challengeId,
        address verifierAddress,
        address[] calldata successfulParticipants,
        address[] calldata failedParticipants
    ) external returns (bool);
    function getUserChallenges(address user) external view returns (uint256[] memory);
    function getVerifierChallenges(address verifier) external view returns (uint256[] memory);

    struct Challenge {
        uint64 id;
        string title;
        uint256 valuePromised;
        uint256 duration;
        uint32 checkInPeriod;
        uint8 penaltyType;
        uint8 participantsCount;
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

    event ChallengeStarted(uint64 indexed challengeId);
}
