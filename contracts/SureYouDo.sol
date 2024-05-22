// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SydCharityManager, ISydCharityManager} from "./SydCharityManager.sol";
import {Ownable} from "./utils/Ownable.sol";
import {AllowedTokensManager} from "./AllowedTokenManager.sol";
import {SydChallengeManager, ISydChallengeManager} from "./SydChallengeManager.sol";
import {SydStructures} from "./utils/SydStructures.sol";
import {ISYDToken} from "./SydToken.sol";

contract SureYouDo is AllowedTokensManager, ReentrancyGuard {
    using SafeERC20 for ERC20;

    error CheckInPeriodExceedsChallengeDuration();
    error ERC20TokenLockFailed();
    error EventAlreadyFinalized();
    error EventEnded();
    error EventNotEnded();
    error EventNotStarted();
    error ChallengeNotFinalized();
    error InsufficientSydBalance();
    error InvalidCharityAddress();
    error InvalidEnrollmentAmount(uint256 amount);
    error InvalidMaxParticipants();
    error InvalidPenaltyType();
    error InvalidRecipient();
    error InvalidTransaction();
    error InvalidUnlockAmount();
    error InvalidPledgedValue();
    error InvalidPercentageToDistribute();
    error JoinFailed();
    error MaxClaimsReached();
    error MaxSydLockReached();
    error NoAmountToTransfer();
    error NoAvailablePlatformCommissionValue();
    error NoAvailableValue();
    error NoLockedValue();
    error NoCommunityDistributionValueToDistribute();
    error NotAllowedToCancel();
    error NotAChallengeParticipant(address np);
    error NotAProAccount();
    error ChallengeParticipantsExceedMaximum();
    error ParticipantsRequiredForDistribution();
    error InvalidPlatformCommission();
    error MissingRequiredParameter(uint256 paramIndex);
    error NotAllowedERC20Token();
    error UserNotEnrolledInEvent();
    error ValueFinalizedAlready();
    error VerifierRequiredForDurationOnlyChallenge();

    struct CommunityDistributionEvent {
        uint256 id;
        uint256 startedAt;
        uint256 endsAt;
        uint256 finalizedAt;
        uint256 expectedSydLock;
        uint256 totalSydLocked;
        uint256 maxSydLockPerEnrollment;
        uint64 enrollmentsCount;
        address targetToken; // 0x0 for Network Token
        uint256 totalValueToDistribute;
        uint256 finalValueToDistribute;
    }

    // Locks data structure starts
    mapping(uint64 => mapping(address => uint256)) public lockAmount;
    mapping(uint64 => mapping(address => uint256)) public lockTimes;
    mapping(uint64 => mapping(address => address)) public lockedTokens;
    mapping(uint64 => mapping(address => bool)) public lockHasAvailableValue;
    mapping(uint64 => mapping(address => uint256)) public unlockedAmounts;
    mapping(uint64 => mapping(address => uint256)) public winAmounts;
    mapping(uint64 => mapping(address => uint256)) public lastWithdrawals;
    mapping(uint64 => mapping(address => uint256)) public totalWithdrawals;
    mapping(uint64 => mapping(address => uint256)) public valueFinalizedAt;
    // Locks data structure ends

    uint256 private constant PLATFORM_COMMISSION_ON_COMMUNITY_DISTRIBUTION = 10; // 10%

    uint256 public totalLockedValue;
    mapping(address => uint256) public totalLockedValuePerToken;
    uint256 public totalDonation;
    mapping(address => uint256) public totalDonationPerToken;
    uint256 public totalPlatformCommission;
    mapping(address => uint256) public totalPlatformCommissionPerToken;
    uint256 public availablePlatformCommission;
    mapping(address => uint256) public availablePlatformCommissionPerToken;
    uint256 public totalCommunityDistribution;
    mapping(address => uint256) public totalCommunityDistributionPerToken;
    uint256 public availableCommunityDistribution;
    mapping(address => uint256) public availableCommunityDistributionPerToken;

    // data structure to store the distribution events
    CommunityDistributionEvent[] public communityDistributionEvents;
    mapping(address => mapping(uint256 => uint256)) private _holdersLockedAmounts;

    // To store the limit of rewards that can be given to a user in a day
    uint256 public rewardLimitPerDayPerWallet;

    // To keep track of the last day when a challenge was finalized
    // This is used to manage the daily rewards limit for each participant
    uint256 public lastFinalizationDayTracker;

    // To store the daily reward given to each user. It is reset every day.
    mapping(address => uint256) public dailyRewardTracker;

    uint8 public maxParticipants; // Max 255 with creator included
    uint8 public maxParticipantsProAccount; // Max 255 with creator included
    uint32 public minPlatformCommission; // 0% commission for normal accounts
    uint32 public minPlatformCommissionProAccount; // 0% commission for pro accounts
    address public sydTokenAddress;
    uint256 public minimumProAccountBalance;


    ISydCharityManager private charityManager;
    ISydChallengeManager private challengeManager;

    event ChallengeCreated(uint64 indexed challengeId, address indexed creator);
    event ParticipantJoined(uint64 indexed challengeId, address indexed participant);
    event ChallengeCancelled(uint64 indexed challengeId);
    event CheckInAdded(uint64 indexed challengeId, address indexed participant);
    event ValueLost(uint64 indexed challengeId, address indexed participantAddress, uint256 amount);
    event ChallengeFinalized(uint64 indexed challengeId, address indexed finalizer);
    event ValueWithdrawn(uint64 indexed challengeId, address indexed participant, uint256 amount);
    event DistributionEventCreated(
        uint256 indexed eventId,
        uint256 duration,
        uint256 maxSydLockPerEnrollment,
        address targetToken
    );
    event EnrollmentAdded(address indexed claimer, uint256 indexed eventId, uint256 amount);
    event DistributionValueCollected(address indexed collector, uint256 indexed eventId, uint256 amount);

    constructor() AllowedTokensManager(msg.sender, address(this)) {}

    function initialize(address _charityManagerAddress, address _challengeManagerAddress) external onlyOwner {
        maxParticipants = 2;
        maxParticipantsProAccount = 4;
        minimumProAccountBalance = 10 ether;

        charityManager = ISydCharityManager(_charityManagerAddress);
        challengeManager = ISydChallengeManager(_challengeManagerAddress);
    }

    /**
     * @notice Fallback function to revert invalid transactions.
     */
    fallback() external {}

    /**
     * @notice Sets the SYD token address for the contract.
     * @param _sydTokenAddress The syd token address.
     */
    function setSydTokenAddress(address _sydTokenAddress) external onlyOwner {
        sydTokenAddress = _sydTokenAddress;
    }

    /**
     * @notice Updates the maximum number of participants allowed in a challenge.
     * @param newMaxParticipants The new maximum number of participants.
     * @param newMaxParticipantsProAccount The new maximum number of participants for pro accounts.
     */
    function updateMaxParticipants(uint8 newMaxParticipants, uint8 newMaxParticipantsProAccount) external onlyOwner {
        if (newMaxParticipants < 2 || newMaxParticipants > newMaxParticipantsProAccount) {
            revert InvalidMaxParticipants();
        }
        if (newMaxParticipants != maxParticipants) {
            maxParticipants = newMaxParticipants;
        }

        if (newMaxParticipantsProAccount != maxParticipantsProAccount) {
            maxParticipantsProAccount = newMaxParticipantsProAccount;
        }
    }

    /**
     * @notice Updates the minimum commission percentage that the platform can receive.
     * The commission percentage has a precision of two floating digits.
     * The value is represented in basis points where 1 basis point equals 0.01%
     * Here are some examples:
     * - For a commission of 0.01%, pass in 1.
     * - For a commission of 0.50%, pass in 50.
     * - For a commission of 5.00%, pass in 500.
     * - For a commission of 10.0%, pass in 1000.
     * - For a commission of 50.0%, pass in 5000.
     * - For a commission of 100.0%, pass in 10000.
     * @param newMinPlatformCommission The new minimum commission percentage for the platform.
     * @param newMinPlatformCommissionProAccount The new minimum commission percentage for pro accounts.
     */
    function updateMinPlatformCommission(
        uint32 newMinPlatformCommission,
        uint32 newMinPlatformCommissionProAccount
    ) external onlyOwner {
        if (
            newMinPlatformCommission > SydStructures.COMMISSION_PRECISION ||
            newMinPlatformCommissionProAccount > SydStructures.COMMISSION_PRECISION
        ) {
            revert InvalidPlatformCommission();
        }
        if (newMinPlatformCommission != minPlatformCommission) {
            minPlatformCommission = newMinPlatformCommission;
        }
        if (newMinPlatformCommissionProAccount != minPlatformCommissionProAccount) {
            minPlatformCommissionProAccount = newMinPlatformCommissionProAccount;
        }
    }

    /**
     * @notice Updates the minimum pro account balance.
     * @param _minimumProAccountBalance The new minimum pro account balance.
     */
    function updateMinimumProAccountBalance(uint256 _minimumProAccountBalance) external onlyOwner {
        minimumProAccountBalance = _minimumProAccountBalance;
    }

    /**
     * @notice Updates the reward limit per day per wallet.
     * @param newRewardLimit The new reward limit per day per wallet.
     */
    function updateDailyRewardLimitPerUser(uint256 newRewardLimit) external onlyOwner {
        if (newRewardLimit != rewardLimitPerDayPerWallet) {
            rewardLimitPerDayPerWallet = newRewardLimit;
        }
    }

    /**
     * @notice Creates a new challenge.
     * @param title The title of the challenge.
     * @param pledgedValue The pledged value of the challenge.
     * @param duration The duration of the challenge.
     * @param checkInPeriod The check-in period of the challenge.
     * @param verifier The verifier address.
     * @param penaltyType The penalty type.
     * @param penaltyRecipientAddress The penalty recipient address.
     * @param otherParticipants The other participants.
     * @param platformCommissionPercentage The platform commission percentage.
     * @param tokenToLock The token to lock.
     */
    function createChallenge(
        string memory title,
        uint256 pledgedValue,
        uint256 duration,
        uint32 checkInPeriod,
        address verifier,
        uint8 penaltyType,
        address penaltyRecipientAddress,
        address[] memory otherParticipants,
        uint32 platformCommissionPercentage,
        address tokenToLock
    ) external payable {
        if (bytes(title).length == 0) {
            revert MissingRequiredParameter(0);
        }

        if (duration == 0) {
            revert MissingRequiredParameter(1);
        }

        if (checkInPeriod > 0 && checkInPeriod > duration) {
            revert CheckInPeriodExceedsChallengeDuration();
        }

        bool isProAccount = _isProAccount(msg.sender);

        if (checkInPeriod > 1 && isProAccount == false) {
            revert NotAProAccount();
        }

        if (
            penaltyType != SydStructures.DISTRIBUTE_TO_PARTICIPANTS &&
            penaltyType != SydStructures.ADD_TO_COMMUNITY &&
            penaltyType != SydStructures.TRANSFER_TO_ADDRESS &&
            penaltyType != SydStructures.DONATE_TO_CHARITY
        ) {
            revert InvalidPenaltyType();
        }

        if (
            platformCommissionPercentage > SydStructures.COMMISSION_PRECISION ||
            (isProAccount && platformCommissionPercentage < minPlatformCommissionProAccount) ||
            (platformCommissionPercentage < minPlatformCommission)
        ) {
            revert InvalidPlatformCommission();
        }

        if (
            penaltyType == SydStructures.DONATE_TO_CHARITY && !charityManager.isCharityActive(penaltyRecipientAddress)
        ) {
            revert InvalidCharityAddress();
        }

        if (penaltyType == SydStructures.DISTRIBUTE_TO_PARTICIPANTS) {
            if (otherParticipants.length == 0) {
                revert ParticipantsRequiredForDistribution();
            }
            if (isProAccount == false) {
                revert NotAProAccount();
            }
        }

        if (penaltyType == SydStructures.TRANSFER_TO_ADDRESS && isProAccount == false) {
            revert NotAProAccount();
        }

        // double the participants for pro accounts
        uint256 maxAllowedParticipants = isProAccount ? maxParticipantsProAccount : maxParticipants;
        if (otherParticipants.length >= maxAllowedParticipants) {
            revert ChallengeParticipantsExceedMaximum();
        }

        if (checkInPeriod == 0) {
            if (verifier == address(0)) {
                revert VerifierRequiredForDurationOnlyChallenge();
            }
        }

        // The commission precision is set to 10_000. If the pledged value is less than this,
        // the division operation would result in zero when calculating the commission.
        // Therefore, we need to ensure that the pledged value is at least equal to
        // the commission precision to prevent this error.
        if (pledgedValue / SydStructures.COMMISSION_PRECISION == 0) {
            revert InvalidPledgedValue();
        }

        if (tokenToLock == address(0) && (msg.value == 0 || msg.value != pledgedValue)) {
            revert InvalidPledgedValue();
        }

        if (tokenToLock != address(0)) {
            if (_isTokenAllowed(tokenToLock) == false) {
                revert NotAllowedERC20Token();
            }

            if (_isProAccountOnlyToken(tokenToLock) && isProAccount == false) {
                revert NotAProAccount();
            }
        }

        // add new challenge
        uint64 challengeId = challengeManager.addChallenge(
            msg.sender,
            title,
            pledgedValue,
            duration,
            checkInPeriod,
            verifier,
            penaltyType,
            penaltyRecipientAddress,
            otherParticipants,
            platformCommissionPercentage,
            tokenToLock
        );

        // set lock for the creator
        lockTimes[challengeId][msg.sender] = block.timestamp;
        lockAmount[challengeId][msg.sender] = pledgedValue;

        if (tokenToLock != address(0)) {
            _lockERC20Token(challengeId, tokenToLock, pledgedValue);
            totalLockedValuePerToken[tokenToLock] += pledgedValue;
        } else {
            totalLockedValue += pledgedValue;
        }

        emit ChallengeCreated(challengeId, msg.sender);
    }

    /**
     * @notice To let a participant join a challenge.
     * @param challengeId The challenge id.
     * @param pledgedValue The pledged value.
     */
    function joinChallenge(uint64 challengeId, uint256 pledgedValue) external payable nonReentrant {
        (ISydChallengeManager.Challenge memory challenge, , address tokenToLock, ) = challengeManager.getChallenge(
            challengeId
        );

        if (challenge.startedAt > 0 || challenge.finalizedAt > 0) {
            revert JoinFailed();
        }
        if (tokenToLock == address(0) && (msg.value == 0 || msg.value != pledgedValue)) {
            revert InvalidPledgedValue();
        }

        if (tokenToLock != address(0)) {
            if (pledgedValue == 0) {
                revert InvalidPledgedValue();
            }

            if (_isProAccountOnlyToken(tokenToLock) && _isProAccount(msg.sender) == false) {
                revert NotAProAccount();
            }
        }

        // set lock details
        lockAmount[challengeId][msg.sender] = pledgedValue;
        lockTimes[challengeId][msg.sender] = block.timestamp;

        if (tokenToLock != address(0)) {
            _lockERC20Token(challengeId, tokenToLock, pledgedValue);
            totalLockedValuePerToken[tokenToLock] += pledgedValue;
        } else {
            totalLockedValue += pledgedValue;
        }

        bool addRes = challengeManager.addParticipantToChallenge(challengeId, msg.sender);
        if (!addRes) {
            revert JoinFailed();
        }
        emit ParticipantJoined(challengeId, msg.sender);
    }

    /**
     * @notice Cancels a challenge by creator.
     * @param challengeId The challenge id.
     */
    function cancelChallenge(uint64 challengeId) external nonReentrant {
        if (lockTimes[challengeId][msg.sender] == 0) {
            revert NoLockedValue();
        }

        // get participants of the challenge
        (ISydChallengeManager.Challenge memory challenge, , , ) = challengeManager.getChallenge(challengeId);
        address[] memory participants = challenge.joinedParticipants;
        if (msg.sender != participants[0]) {
            revert NotAllowedToCancel();
        }

        // loop over the participants and _cancelLock
        for (uint i = 0; i < participants.length; i++) {
            _cancelChallengeLock(participants[i], challengeId);
        }

        challengeManager.cancelChallenge(challengeId);
        emit ChallengeCancelled(challengeId);
    }

    /**
     * @notice Checks in for a challenge.
     * @param challengeId The challenge id.
     */
    function checkIn(uint64 challengeId) external nonReentrant {
        challengeManager.addCheckIn(challengeId, msg.sender);

        emit CheckInAdded(challengeId, msg.sender);
    }

    /**
     * @notice Finalizes a challenge.
     * @param challengeId The challenge id.
     */
    function finalizeChallenge(uint64 challengeId) external nonReentrant {
        address[] memory participants = challengeManager.finalizeChallenge(challengeId, msg.sender);

        // Update the last finalization day tracker when a challenge was finalized
        // This is used for managing the daily rewards limit for each participant
        _updateLastFinalizationDayTracker();

        for (uint i = 0; i < participants.length; i++) {
            // value may be finalized already if the participant has checked in on the last day
            if (valueFinalizedAt[challengeId][participants[i]] == 0) {
                _finalizeCheckInRequiredValue(challengeId, participants[i]);
            }
        }

        emit ChallengeFinalized(challengeId, msg.sender);
    }

    /**
     * @notice Verifies and finalizes a challenge.
     * @param challengeId The challenge id.
     * @param successfulParticipants The successful participants.
     * @param failedParticipants The failed participants.
     */
    function verifyAndFinalizeChallenge(
        uint64 challengeId,
        address[] calldata successfulParticipants,
        address[] calldata failedParticipants
    ) external nonReentrant {
        challengeManager.verifyAndFinalizeChallenge(
            challengeId,
            msg.sender,
            successfulParticipants,
            failedParticipants
        );

        // Update the last finalization day tracker when a challenge was finalized
        // This is used for managing the daily rewards limit for each participant
        _updateLastFinalizationDayTracker();

        for (uint i = 0; i < successfulParticipants.length; i++) {
            if (lockTimes[challengeId][successfulParticipants[i]] == 0) {
                revert NotAChallengeParticipant(successfulParticipants[i]);
            }
            _finalizeValueForSuccessfulParticipant(challengeId, successfulParticipants[i]);
        }

        for (uint i = 0; i < failedParticipants.length; i++) {
            if (lockTimes[challengeId][failedParticipants[i]] == 0) {
                revert NotAChallengeParticipant(failedParticipants[i]);
            }
            _finalizeValueForFailedParticipant(challengeId, failedParticipants[i]);
        }

        emit ChallengeFinalized(challengeId, msg.sender);

        // Send verifier reward
        _sendChallengeVerifierReward(msg.sender);
    }

    /**
     * @notice Withdraws the available value for a challenge.
     * @param challengeId The challenge id.
     */
    function withdraw(uint64 challengeId) external nonReentrant {
        (ISydChallengeManager.Challenge memory challenge, , , ) = challengeManager.getChallenge(challengeId);

        if (challenge.finalizedAt == 0) {
            revert ChallengeNotFinalized();
        }

        if (lockTimes[challengeId][msg.sender] == 0) {
            revert NoLockedValue();
        }

        uint256 amount = unlockedAmounts[challengeId][msg.sender] + winAmounts[challengeId][msg.sender];
        if (lockHasAvailableValue[challengeId][msg.sender] == false || amount == 0) {
            revert NoAvailableValue();
        }

        address lockedToken = lockedTokens[challengeId][msg.sender];
        if (lockedToken != address(0)) {
            // Tokens that are exclusively for pro accounts can only be withdrawn by pro accounts.
            if (_isProAccountOnlyToken(lockedToken) && _isProAccount(msg.sender) == false) {
                revert NotAProAccount();
            }

            _transferERC20To(lockedToken, msg.sender, amount);
        } else {
            _transferValueTo(msg.sender, amount);
        }

        totalWithdrawals[challengeId][msg.sender] += amount;
        lockHasAvailableValue[challengeId][msg.sender] = false;
        unlockedAmounts[challengeId][msg.sender] = 0;
        winAmounts[challengeId][msg.sender] = 0;
        lastWithdrawals[challengeId][msg.sender] = block.timestamp;

        emit ValueWithdrawn(challengeId, msg.sender, amount);
    }

    /**
     * @notice Withdraws the accumulated platform commission.
     * @param tokenAddress The token address.
     */
    function withdrawPlatformCommission(address tokenAddress) external onlyOwner {
        uint256 availableCommission = tokenAddress != address(0)
            ? availablePlatformCommissionPerToken[tokenAddress]
            : availablePlatformCommission;
        if (availableCommission == 0) {
            revert NoAvailablePlatformCommissionValue();
        }

        if (tokenAddress == address(0)) {
            availablePlatformCommission = 0;
            _transferValueTo(msg.sender, availableCommission);
        } else {
            availablePlatformCommissionPerToken[tokenAddress] = 0;
            _transferERC20To(tokenAddress, msg.sender, availableCommission);
        }
    }

    /**
     * @notice Starts a community distribution event by the owner.
     * @param duration The duration of the event.
     * @param minEnrollments The maximum number of claims.
     * @param targetToken The token to be distributed.
     */
    function initiateCommunityDistributionEvent(
        uint256 duration,
        uint64 minEnrollments,
        uint256 percentageToDistribute,
        address targetToken
    ) external onlyOwner {
        if (duration == 0) {
            revert MissingRequiredParameter(0);
        }
        if (minEnrollments == 0) {
            revert MissingRequiredParameter(1);
        }

        if (percentageToDistribute == 0 || percentageToDistribute > 100) {
            revert InvalidPercentageToDistribute();
        }

        uint256 availableDistributionValue = targetToken == address(0)
            ? availableCommunityDistribution
            : availableCommunityDistributionPerToken[targetToken];

        if (availableDistributionValue == 0) {
            revert NoAvailableValue();
        }

        uint256 valueToDistribute = (availableDistributionValue * percentageToDistribute) / 100;

        // platform commission on community distribution
        uint256 platformCommission = (valueToDistribute * PLATFORM_COMMISSION_ON_COMMUNITY_DISTRIBUTION) / 100;

        uint256 expectedSydLock = _calcExpectedSydToLockAndBurn();
        uint256 maxSydLockPerEnrollment = expectedSydLock / minEnrollments;

        uint256 eventId = communityDistributionEvents.length;
        communityDistributionEvents.push(
            CommunityDistributionEvent({
                id: eventId,
                startedAt: block.timestamp,
                endsAt: block.timestamp + (duration * 1 days),
                finalizedAt: 0,
                expectedSydLock: expectedSydLock,
                totalSydLocked: 0,
                maxSydLockPerEnrollment: maxSydLockPerEnrollment,
                enrollmentsCount: 0,
                targetToken: targetToken,
                totalValueToDistribute: valueToDistribute - platformCommission,
                finalValueToDistribute: 0
            })
        );

        if (targetToken == address(0)) {
            availableCommunityDistribution -= valueToDistribute;
            availablePlatformCommission += platformCommission;
        } else {
            availableCommunityDistributionPerToken[targetToken] -= valueToDistribute;
            availablePlatformCommissionPerToken[targetToken] += platformCommission;
        }

        emit DistributionEventCreated(eventId, duration, maxSydLockPerEnrollment, targetToken);
    }

    /**
     * @notice Enrolls a user for a community distribution event.
     * @param eventId The id of the event.
     * @param amount The amount of tokens to be locked.
     */
    function registerForCommunityDistributionEvent(uint256 eventId, uint256 amount) external nonReentrant {
        if (block.timestamp < communityDistributionEvents[eventId].startedAt) {
            revert EventNotStarted();
        }
        if (block.timestamp >= communityDistributionEvents[eventId].endsAt) {
            revert EventEnded();
        }
        if (
            amount < 1 ether ||
            _holdersLockedAmounts[msg.sender][eventId] + amount >
            communityDistributionEvents[eventId].maxSydLockPerEnrollment
        ) {
            revert InvalidEnrollmentAmount(amount);
        }
        if (_balanceOfSyd(msg.sender) < amount) {
            revert InsufficientSydBalance();
        }

        if (
            communityDistributionEvents[eventId].totalSydLocked + amount >
            communityDistributionEvents[eventId].expectedSydLock
        ) {
            revert MaxSydLockReached();
        }

        // calculate the collectable value for the enrollment
        uint256 collectableAmount = (communityDistributionEvents[eventId].totalValueToDistribute * amount) /
            communityDistributionEvents[eventId].expectedSydLock;
        communityDistributionEvents[eventId].finalValueToDistribute += collectableAmount;

        // lock the syd
        ERC20(sydTokenAddress).transferFrom(msg.sender, address(this), amount);

        // if the user is enrolling for the first time, increment the claims count
        if (_holdersLockedAmounts[msg.sender][eventId] == 0) {
            communityDistributionEvents[eventId].enrollmentsCount++;
        }

        _holdersLockedAmounts[msg.sender][eventId] += amount;
        communityDistributionEvents[eventId].totalSydLocked += amount;

        emit EnrollmentAdded(msg.sender, eventId, amount);
    }

    /**
     * @notice Collects the community distribution value for a user.
     * @param eventId The id of the event.
     */
    function collectCommunityEventDistributionValue(uint256 eventId) external {
        CommunityDistributionEvent storage _event = communityDistributionEvents[eventId];

        if (block.timestamp > _event.endsAt) {
            revert EventEnded();
        }
        if (_holdersLockedAmounts[msg.sender][eventId] == 0) {
            revert UserNotEnrolledInEvent();
        }

        uint256 memberLockAmount = _holdersLockedAmounts[msg.sender][eventId];
        uint256 collectableAmount = (_event.totalValueToDistribute * memberLockAmount) / _event.expectedSydLock;

        if (_event.targetToken == address(0)) {
            _transferValueTo(msg.sender, collectableAmount);
        } else {
            _transferERC20To(_event.targetToken, msg.sender, collectableAmount);
        }

        _holdersLockedAmounts[msg.sender][eventId] = 0;

        emit DistributionValueCollected(msg.sender, eventId, collectableAmount);
    }

    /**
     * @notice Finalizes a community distribution event and
     * adds the remaining value to the community distribution value.
     * @param eventId The id of the event.
     */
    function finalizeCommunityDistributionEvent(uint256 eventId) external onlyOwner {
        CommunityDistributionEvent storage _event = communityDistributionEvents[eventId];

        if (_event.finalizedAt > 0) {
            revert EventAlreadyFinalized();
        }
        if (block.timestamp < _event.endsAt) {
            revert EventNotEnded();
        }

        if (_event.targetToken == address(0)) {
            availableCommunityDistribution += _event.totalValueToDistribute - _event.finalValueToDistribute;
        } else {
            availableCommunityDistributionPerToken[_event.targetToken] +=
                _event.totalValueToDistribute -
                _event.finalValueToDistribute;
        }

        // burn locked syd
        ISYDToken(sydTokenAddress).burn(_event.totalSydLocked);

        _event.finalizedAt = block.timestamp;
    }

    /**
     * @notice Gets the enrolled amount for a user in a community distribution event.
     * @param user The user address.
     * @param eventId The event id.
     */
    function getCommunityEventEnrollmentAmount(address user, uint256 eventId) external view returns (uint256) {
        return _holdersLockedAmounts[user][eventId];
    }

    /**
     * @notice Gets the lock details of a user.
     * @param challengeId The challenge id.
     * @param user The user address.
     * @return LockDetails The lock details.
     */
    function getLockDetails(uint64 challengeId, address user) external view returns (SydStructures.LockDetails memory) {
        return
            SydStructures.LockDetails(
                lockAmount[challengeId][user],
                lockTimes[challengeId][user],
                lockedTokens[challengeId][user],
                lockHasAvailableValue[challengeId][user],
                winAmounts[challengeId][user],
                unlockedAmounts[challengeId][user],
                lastWithdrawals[challengeId][user],
                totalWithdrawals[challengeId][user]
            );
    }

    function _lockERC20Token(uint64 challengeId, address tokenToLock, uint256 valuePromised) internal {
        lockedTokens[challengeId][msg.sender] = tokenToLock;
        ERC20(tokenToLock).safeTransferFrom(msg.sender, address(this), valuePromised);
    }

    function _cancelChallengeLock(address user, uint64 challengeId) internal {
        uint256 _lockedAmount = lockAmount[challengeId][user];
        if (_lockedAmount > 0) {
            if (lockedTokens[challengeId][user] != address(0)) {
                _transferERC20To(lockedTokens[challengeId][user], user, _lockedAmount);
                totalLockedValuePerToken[lockedTokens[challengeId][user]] -= _lockedAmount;
            } else {
                _transferValueTo(user, _lockedAmount);
                totalLockedValue -= _lockedAmount;
            }
            lockAmount[challengeId][user] = 0;
        }
    }

    function _finalizeCheckInRequiredValue(uint64 challengeId, address participantAddress) internal {
        if (valueFinalizedAt[challengeId][participantAddress] > 0) {
            revert ValueFinalizedAlready();
        }

        (ISydChallengeManager.Challenge memory challenge, address penaltyRecipientAddress, , ) = challengeManager
            .getChallenge(challengeId);
        uint256 checkInCount = challengeManager.getParticipantCheckInCount(challengeId, participantAddress);

        uint256 maxCheckInCount = challenge.duration / challenge.checkInPeriod;
        uint256 netChallengeValue = challenge.valuePromised - challenge.platformCommission;
        uint256 valuePerCheckIn = netChallengeValue / maxCheckInCount;
        uint256 valueToLose = valuePerCheckIn * (maxCheckInCount - checkInCount);
        uint256 valueToUnlock = netChallengeValue - valueToLose; // Simplified calculation

        // Unlock the value (if any) and send participant reward
        _unlockPledgeAndSendReward(participantAddress, challengeId, valueToUnlock);

        address lockedToken = lockedTokens[challengeId][participantAddress];

        if (challenge.platformCommission > 0) {
            if (lockedToken == address(0)) {
                totalPlatformCommission += challenge.platformCommission;
                availablePlatformCommission += challenge.platformCommission;
            } else {
                totalPlatformCommissionPerToken[lockedToken] += challenge.platformCommission;
                availablePlatformCommissionPerToken[lockedToken] += challenge.platformCommission;
            }
        }

        if (valueToLose > 0) {
            _lostValuePenalize(
                challengeId,
                participantAddress,
                valueToLose,
                challenge.penaltyType,
                penaltyRecipientAddress,
                challenge.joinedParticipants,
                lockedToken
            );
        }

        // Set valueFinalizedAt for participant
        valueFinalizedAt[challengeId][participantAddress] = block.timestamp;
    }

    function _unlockPledgeAndSendReward(address user, uint64 challengeId, uint256 amount) internal {
        if (lockTimes[challengeId][user] == 0) {
            revert NoLockedValue();
        }

        // unlock amount is always less than the locked amount because of the platform commission
        if (amount >= lockAmount[challengeId][user]) {
            revert InvalidUnlockAmount();
        }

        if (amount > 0) {
            unlockedAmounts[challengeId][user] = amount;
            lockHasAvailableValue[challengeId][user] = true;
        }

        // send SYD token to the user as reward
        _sendChallengeParticipantReward(user);
    }

    function _lostValuePenalize(
        uint64 challengeId,
        address participantAddress,
        uint256 valueToLose,
        uint8 penaltyType,
        address penaltyRecipientAddress,
        address[] memory participants,
        address tokenToLock
    ) internal {
        assert(valueToLose > 0);

        if (penaltyType == SydStructures.DONATE_TO_CHARITY) {
            _donateLostValueTo(participantAddress, challengeId, penaltyRecipientAddress, valueToLose);
            charityManager.addDonation(penaltyRecipientAddress, valueToLose, tokenToLock);
        } else if (penaltyType == SydStructures.ADD_TO_COMMUNITY) {
            _addLostValueToCommunityValue(participantAddress, challengeId, valueToLose);
        } else if (penaltyType == SydStructures.TRANSFER_TO_ADDRESS) {
            _transferLostValueTo(participantAddress, challengeId, penaltyRecipientAddress, valueToLose);
        } else if (penaltyType == SydStructures.DISTRIBUTE_TO_PARTICIPANTS) {
            uint256 valueToDistribute = valueToLose / (participants.length - 1);
            for (uint i = 0; i < participants.length; i++) {
                address currentParticipant = participants[i];
                if (currentParticipant != participantAddress) {
                    winAmounts[challengeId][currentParticipant] += valueToDistribute;
                    lockHasAvailableValue[challengeId][currentParticipant] = true;
                }
            }
        }

        // Emitting a single event at the end to summarize the action taken
        emit ValueLost(challengeId, participantAddress, valueToLose);
    }

    function _donateLostValueTo(address user, uint64 challengeId, address charityAddress, uint256 amount) internal {
        if (charityAddress == address(0)) {
            revert InvalidCharityAddress();
        }

        address lockedToken = lockedTokens[challengeId][user];
        if (lockedToken != address(0)) {
            _transferERC20To(lockedToken, charityAddress, amount);
            totalDonationPerToken[lockedToken] += amount;
        } else {
            _transferValueTo(charityAddress, amount);
            totalDonation += amount;
        }
    }

    function _addLostValueToCommunityValue(address user, uint64 challengeId, uint256 amount) internal {
        address lockedToken = lockedTokens[challengeId][user];
        if (lockedToken == address(0)) {
            totalCommunityDistribution += amount;
            availableCommunityDistribution += amount;
        } else {
            totalCommunityDistributionPerToken[lockedToken] += amount;
            availableCommunityDistributionPerToken[lockedToken] += amount;
        }
    }

    function _transferLostValueTo(address user, uint64 challengeId, address to, uint256 amount) internal {
        address lockedToken = lockedTokens[challengeId][user];
        if (lockedToken != address(0)) {
            _transferERC20To(lockedToken, to, amount);
        } else {
            _transferValueTo(to, amount);
        }
    }

    function _transferValueTo(address recipient, uint256 amount) internal {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert NoAmountToTransfer();
        }
        (bool s, ) = payable(recipient).call{value: amount}("");
        assert(s);
    }

    function _transferERC20To(address tokenAddress, address recipient, uint256 amount) internal {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert NoAmountToTransfer();
        }
        ERC20(tokenAddress).safeTransfer(recipient, amount);
    }

    function _sendChallengeVerifierReward(address verifierAddress) internal {
        // amount is 0.000003% of the total supply
        uint256 amount = (_sydTotalSupply() * 3) / 10 ** 6;

        // double the reward if the verifier is a pro account
        if (_isProAccount(verifierAddress)) {
            amount *= 2;
        }

        ISYDToken(sydTokenAddress).transfer(verifierAddress, amount);
    }

    function _sendChallengeParticipantReward(address participantAddress) internal {
        // amount is 0.000002% of the total supply
        uint256 amount = (_sydTotalSupply() * 2) / 10 ** 6;

        // double the reward if the participant is a pro account
        if (_isProAccount(participantAddress)) {
            amount *= 2;
        }

        // If the daily reward limit is set, check if the participant has reached their daily reward limit
        if (rewardLimitPerDayPerWallet > 0) {
            bool isAnotherDay = lastFinalizationDayTracker < block.timestamp / 1 days;
            // If it's a new day, reset the daily reward limit for the participant
            if (isAnotherDay) {
                dailyRewardTracker[participantAddress] = 0;
            }

            // If the participant hasn't reached their daily reward limit,
            // transfer the reward to the participant and update the participant's daily reward limit
            if (amount + dailyRewardTracker[participantAddress] <= rewardLimitPerDayPerWallet) {
                dailyRewardTracker[participantAddress] += amount;
                ISYDToken(sydTokenAddress).transfer(participantAddress, amount);
            }
        } else {
            ISYDToken(sydTokenAddress).transfer(participantAddress, amount);
        }
    }

    function _finalizeValueForSuccessfulParticipant(uint64 challengeId, address participantAddress) internal {
        if (valueFinalizedAt[challengeId][participantAddress] > 0) {
            revert ValueFinalizedAlready();
        }
        (ISydChallengeManager.Challenge memory challenge, , , ) = challengeManager.getChallenge(challengeId);
        uint256 valueToUnlock = challenge.valuePromised - challenge.platformCommission;

        _unlockPledgeAndSendReward(participantAddress, challengeId, valueToUnlock);

        // Set valueFinalizedAt for participant directly to minimize storage access
        valueFinalizedAt[challengeId][participantAddress] = block.timestamp;
    }

    function _finalizeValueForFailedParticipant(uint64 challengeId, address participantAddress) internal {
        if (valueFinalizedAt[challengeId][participantAddress] > 0) {
            revert ValueFinalizedAlready();
        }
        (ISydChallengeManager.Challenge memory challenge, address penaltyRecipientAddress, , ) = challengeManager
            .getChallenge(challengeId);
        uint256 valueToLose = challenge.valuePromised - challenge.platformCommission;
        _lostValuePenalize(
            challengeId,
            participantAddress,
            valueToLose,
            challenge.penaltyType,
            penaltyRecipientAddress,
            challenge.joinedParticipants,
            lockedTokens[challengeId][participantAddress]
        );

        // Set valueFinalizedAt for participant directly to minimize storage access
        valueFinalizedAt[challengeId][participantAddress] = block.timestamp;
    }

    function _calcExpectedSydToLockAndBurn() internal view returns (uint256) {
        return (_sydTotalSupply() * 2) / 1000;
    }

    function _isProAccount(address account) internal view returns (bool) {
        return _balanceOfSyd(account) >= minimumProAccountBalance;
    }

    function _balanceOfSyd(address account) internal view returns (uint256) {
        return ISYDToken(sydTokenAddress).balanceOf(account);
    }

    function _sydTotalSupply() internal view returns (uint256) {
        return ISYDToken(sydTokenAddress).totalSupply();
    }

    /**
     * @notice Updates the last finalization day tracker.
     * This function is used to keep track of the last day when a challenge was finalized.
     * It is important for managing daily rewards limit for each participant.
     */
    function _updateLastFinalizationDayTracker() internal {
        uint256 currentDay = block.timestamp / 1 days;
        // Update the tracker only when the daily reward limit is set and it's a new day
        if (rewardLimitPerDayPerWallet > 0 && currentDay > lastFinalizationDayTracker) {
            lastFinalizationDayTracker = currentDay;
        }
    }
}
