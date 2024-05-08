import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import {
  SureYouDo,
  SydChallengeManager,
  SydCharityManager,
  SydToken,
  TestERC20,
} from "../typechain-types";

const DAY_IN_SECONDS = 86400;
const COMMISSION_PRECISION = 10_000n;
const defaultMaxParticipants = 3;
const defaultMaxParticipantsProAccount = 6;

enum PenaltyType {
  DISTRIBUTE_TO_PARTICIPANTS,
  ADD_TO_COMMUNITY,
  TRANSFER_TO_ADDRESS,
  DONATE_TO_CHARITY,
}

type ChallengeProperties = {
  title: string;
  pledgedValue: bigint;
  verifier: string;
  duration: number;
  checkInPeriod: number;
  penaltyType: PenaltyType;
  penaltyRecipientAddress: string;
  otherParticipants: string[];
  platformCommission: number;
  msgValue?: bigint;
  // @ts-expect-error "ethers" is not available in this context
  tokenToLock: ethers.Addressable | string;
};

const defaultProperties: ChallengeProperties = {
  title: "Challenge 1",
  pledgedValue: ethers.parseEther("10"),
  verifier: ethers.ZeroAddress,
  duration: 10,
  checkInPeriod: 1,
  penaltyType: PenaltyType.ADD_TO_COMMUNITY,
  penaltyRecipientAddress: ethers.ZeroAddress,
  otherParticipants: [],
  platformCommission: 1000, // 10%
  tokenToLock: ethers.ZeroAddress,
};

const endedDayUnix = DAY_IN_SECONDS * (defaultProperties.duration + 1);

const getSigners = async () => {
  const [
    owner,
    addr1,
    addr2,
    addr3,
    addr4,
    addr5,
    addr6,
    addr7,
    addr8,
    addr9,
    addr10,
  ] = await ethers.getSigners();
  return {
    owner,
    addr1,
    addr2,
    addr3,
    addr4,
    addr5,
    addr6,
    addr7,
    addr8,
    addr9,
    addr10,
  };
};

const deployContracts = async () => {
  const { owner, addr1, addr2, addr3, ...rest } = await getSigners();

  const SYD = await ethers.getContractFactory("SureYouDo");
  const sureYouDo = await SYD.deploy();

  // deploy the charity contract
  const CharityManager = await ethers.getContractFactory("SydCharityManager");
  const charityManager = await CharityManager.deploy(
    owner.address,
    sureYouDo.target,
  );

  // deploy the challenge contract
  const ChallengeManager = await ethers.getContractFactory(
    "SydChallengeManager",
  );
  const challengeManager = await ChallengeManager.deploy(
    owner.address,
    sureYouDo.target,
  );

  // init syd contract
  await sureYouDo.initialize(charityManager.target, challengeManager.target);

  // deploy SYD Token
  const SYDToken = await ethers.getContractFactory("SydToken", owner);
  const sydToken = await SYDToken.deploy(
    "SureYouDo.io",
    "SYD",
    [owner.address, sureYouDo.target],
    [ethers.parseEther("50000"), ethers.parseEther("50000")],
  );

  // set the syd token address in the main contract
  await sureYouDo.setSydTokenAddress(sydToken.target);

  return {
    sureYouDo,
    charityManager,
    challengeManager,
    sydToken,
    owner,
    addr1,
    addr2,
    addr3,
    ...rest,
  };
};

const deployContractWithActiveCharity = async () => {
  const { sureYouDo, charityManager, owner, addr1, ...rest } =
    await loadFixture(deployContracts);
  await charityManager.connect(owner).addCharity(addr1.address, "Charity 1");
  return {
    sureYouDo,
    charityManager,
    charityAddress: addr1.address,
    owner,
    ...rest,
  };
};

const createChallengeWith = (
  contract: SureYouDo,
  challengeProperties: Partial<typeof defaultProperties> = {},
) => {
  const {
    title,
    pledgedValue,
    verifier,
    duration,
    checkInPeriod,
    penaltyType,
    penaltyRecipientAddress,
    otherParticipants,
    platformCommission,
    msgValue,
    tokenToLock,
  } = {
    ...defaultProperties,
    ...challengeProperties,
  };
  return contract.createChallenge(
    title,
    pledgedValue,
    duration,
    checkInPeriod,
    verifier,
    penaltyType,
    penaltyRecipientAddress,
    otherParticipants,
    platformCommission,
    tokenToLock,
    {
      value: msgValue === undefined ? pledgedValue : msgValue,
    },
  );
};

const deployContractWithAChallenge = async (
  challengeProperties: Partial<typeof defaultProperties> = {},
) => {
  const properties = {
    ...defaultProperties,
    ...challengeProperties,
  };
  const { sureYouDo, owner, ...rest } = await loadFixture(deployContracts);
  await createChallengeWith(sureYouDo, properties);
  return {
    sureYouDo,
    creator: owner,
    ...rest,
  };
};

const deployTstERC20 = async () => {
  const { addr1, addr2, addr3, addr4, addr5, addr10 } = await getSigners();
  const ERC20 = await ethers.getContractFactory("TestERC20", addr10);
  const tstToken = await ERC20.deploy();

  const tokenToSend = ethers.parseEther("1000");
  await tstToken.transfer(addr1.address, tokenToSend);
  await tstToken.transfer(addr2.address, tokenToSend);
  await tstToken.transfer(addr3.address, tokenToSend);
  await tstToken.transfer(addr4.address, tokenToSend);
  await tstToken.transfer(addr5.address, tokenToSend);

  return tstToken;
};

describe("SureYouDo", () => {
  let tstToken: TestERC20;

  before(async () => {
    tstToken = await deployTstERC20();
  });

  it("Should set proper owner and parent owner", async () => {
    const { sureYouDo, owner } = await loadFixture(deployContracts);
    expect(await sureYouDo.owner()).to.equal(owner.address);
    expect(await sureYouDo.mainContract()).to.equal(sureYouDo.target);
  });

  describe("Allowed Tokens Manager", () => {
    it("Should add a token to the allowed-tokens list", async () => {
      const { sureYouDo, addr2: creator } = await loadFixture(deployContracts);

      // add tstToken to allowed-tokens list
      await expect(sureYouDo.addAllowedToken(tstToken.target, false)).to.emit(
        sureYouDo,
        "AllowedTokenAdded",
      );

      // creator approves token to be used
      await tstToken
        .connect(creator)
        .approve(sureYouDo.target, defaultProperties.pledgedValue);

      await expect(
        createChallengeWith(sureYouDo.connect(creator), {
          msgValue: 0n,
          tokenToLock: tstToken.target,
        }),
      ).to.not.be.reverted;
    });

    it("Should add a pro-account only token to the allowed-tokens list", async () => {
      const {
        sureYouDo,
        sydToken,
        addr2: creator,
      } = await loadFixture(deployContracts);

      // transfer SYD to addr2 to make him a pro-account
      await sydToken.transfer(creator.address, ethers.parseEther("100"));

      // add tstToken to allowed-tokens list
      await expect(sureYouDo.addAllowedToken(tstToken.target, true)).to.emit(
        sureYouDo,
        "AllowedTokenAdded",
      );

      // creator approves token to be used
      await tstToken
        .connect(creator)
        .approve(sureYouDo.target, defaultProperties.pledgedValue);

      // creator can use the token to create a challenge as he is a pro-account
      await expect(
        createChallengeWith(sureYouDo.connect(creator), {
          msgValue: 0n,
          tokenToLock: tstToken.target,
        }),
      ).to.not.be.reverted;
    });

    it("Should revert when allowed token is removed", async () => {
      const { sureYouDo, addr2: creator } = await loadFixture(deployContracts);

      // add tstToken to allowed-tokens list
      await expect(sureYouDo.addAllowedToken(tstToken.target, false)).to.emit(
        sureYouDo,
        "AllowedTokenAdded",
      );

      // creator approves token to be used
      await tstToken
        .connect(creator)
        .approve(sureYouDo.target, defaultProperties.pledgedValue);

      // remove tstToken from the allowed-tokens list
      await expect(sureYouDo.removeAllowedToken(tstToken.target)).to.emit(
        sureYouDo,
        "AllowedTokenRemoved",
      );

      await expect(
        createChallengeWith(sureYouDo.connect(creator), {
          msgValue: 0n,
          tokenToLock: tstToken.target,
        }),
      ).to.be.revertedWithCustomError(sureYouDo, "NotAllowedERC20Token");
    });

    it("Should not add and revert when token added already", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await sureYouDo.addAllowedToken(tstToken.target, false);
      await expect(
        sureYouDo.addAllowedToken(tstToken.target, false),
      ).to.be.revertedWithCustomError(sureYouDo, "ATM_TokenAlreadyAdded");
    });

    it("Should not remove and revert when token does not exist", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await expect(
        sureYouDo.removeAllowedToken(tstToken.target),
      ).to.be.revertedWithCustomError(sureYouDo, "ATM_TokenDoesNotExist");
    });

    it("Should update the pro-account only status of a token", async () => {
      const { sureYouDo, addr2: creator } = await loadFixture(deployContracts);
      await sureYouDo.addAllowedToken(tstToken.target, true);

      // creator approves token to be used
      await tstToken
        .connect(creator)
        .approve(sureYouDo.target, defaultProperties.pledgedValue);

      // expect to be reverted when creator is not a pro-account
      await expect(
        createChallengeWith(sureYouDo.connect(creator), {
          msgValue: 0n,
          tokenToLock: tstToken.target,
        }),
      ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");

      await sureYouDo.updateProAccountOnlyToken(tstToken.target, false);

      // expect to not be reverted when token is not a pro-account-only token anymore
      await expect(
        createChallengeWith(sureYouDo.connect(creator), {
          msgValue: 0n,
          tokenToLock: tstToken.target,
        }),
      ).to.not.be.reverted;
    });
  });

  describe("Update max participants", () => {
    it("Should update max participants", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await sureYouDo.updateMaxParticipants(
        defaultMaxParticipants,
        defaultMaxParticipantsProAccount,
      );
      expect(await sureYouDo.maxParticipants()).to.equal(3);
      expect(await sureYouDo.maxParticipantsProAccount()).to.equal(6);
    });

    it("Should revert when max participants is less than 2", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await expect(
        sureYouDo.updateMaxParticipants(1, 2),
      ).to.be.revertedWithCustomError(sureYouDo, "InvalidMaxParticipants");
    });
  });

  describe("Update mai platform commissions", () => {
    it("Should update min platform commissions", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await sureYouDo.updateMinPlatformCommission(10, 1);
      expect(await sureYouDo.minPlatformCommission()).to.equal(10);
      expect(await sureYouDo.minPlatformCommissionProAccount()).to.equal(1);
    });

    it("Should revert when passed commission is more than 10_000", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);
      await expect(
        sureYouDo.updateMinPlatformCommission(10_001, 10),
      ).to.be.revertedWithCustomError(sureYouDo, "InvalidPlatformCommission");

      await expect(
        sureYouDo.updateMinPlatformCommission(10, 10_001),
      ).to.be.revertedWithCustomError(sureYouDo, "InvalidPlatformCommission");
    });
  });

  describe("Update min pro-account SYD balance", () => {
    it("Should update min pro-account SYD", async () => {
      const { sureYouDo } = await loadFixture(deployContracts);

      const newMinimumProAccountBalance = ethers.parseEther("10");
      await sureYouDo.updateMinimumProAccountBalance(
        newMinimumProAccountBalance,
      );
      expect(await sureYouDo.minimumProAccountBalance()).to.equal(
        newMinimumProAccountBalance,
      );
    });
  });

  describe("createChallenge", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when title is empty", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              title: "",
            }),
          )
            .to.be.revertedWithCustomError(
              sureYouDo,
              "MissingRequiredParameter",
            )
            .withArgs(0);
        });

        it("Should revert when duration is 0", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              duration: 0,
            }),
          )
            .to.be.revertedWithCustomError(
              sureYouDo,
              "MissingRequiredParameter",
            )
            .withArgs(1);
        });

        it("Should revert when valuePromised is 0", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              pledgedValue: 0n,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "InvalidPledgedValue");
        });

        it("Should revert when valuePromised is not equal to msg.value", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              msgValue: defaultProperties.pledgedValue + 100n,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "InvalidPledgedValue");
        });

        it("Should revert when checkInPeriod is greater than duration", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              checkInPeriod: 11,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "CheckInPeriodExceedsChallengeDuration",
          );
        });

        it("Should revert when checkInPeriod is greater than one but creator is not a pro-account", async () => {
          const { sureYouDo, sydToken, addr2 } =
            await loadFixture(deployContracts);

          expect(await sydToken.balanceOf(addr2.address)).to.equal(0);

          await expect(
            createChallengeWith(sureYouDo.connect(addr2), {
              checkInPeriod: 2,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");
        });

        it("Should revert when penalty type is invalid", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              // @ts-expect-error invalid value
              penaltyType: 10,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "InvalidPenaltyType");
        });

        it("Should revert when platformCommissionPercentage is greater than 99", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              platformCommission: 10_001,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "InvalidPlatformCommission",
          );
        });

        it("Should revert when platformCommissionPercentage is less than minimum percentage specified", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);

          // set the minimum platform commission to 10
          await sureYouDo.updateMinPlatformCommission(10, 10);

          await expect(
            createChallengeWith(sureYouDo, {
              platformCommission: 5,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "InvalidPlatformCommission",
          );
        });

        it("Should revert when penalty type is PenaltyOption.DONATE_TO_CHARITY and charity is not active", async () => {
          const { sureYouDo, addr2 } = await loadFixture(
            deployContractWithActiveCharity,
          );
          await expect(
            createChallengeWith(sureYouDo, {
              penaltyType: PenaltyType.DONATE_TO_CHARITY,
              penaltyRecipientAddress: addr2.address,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "InvalidCharityAddress");
        });

        it("Should revert when penalty type is DISTRIBUTE_TO_PARTICIPANTS and otherParticipants length is 0", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
              penaltyRecipientAddress: ethers.ZeroAddress,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "ParticipantsRequiredForDistribution",
          );
        });

        it("Should revert when penalty type is DISTRIBUTE_TO_PARTICIPANTS and creator is not a pro-account", async () => {
          const {
            sureYouDo,
            addr2: creator,
            addr3: p2,
          } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo.connect(creator), {
              penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
              penaltyRecipientAddress: ethers.ZeroAddress,
              otherParticipants: [p2.address],
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");
        });

        it("Should revert when penalty type is TRANSFER_TO_ADDRESS and creator is not a pro-account", async () => {
          const { sureYouDo, addr2: creator } =
            await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo.connect(creator), {
              penaltyType: PenaltyType.TRANSFER_TO_ADDRESS,
              penaltyRecipientAddress: ethers.ZeroAddress,
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");
        });

        it("Should revert when participants is more than maxParticipants", async () => {
          const {
            sureYouDo,
            addr1,
            addr2,
            addr3: creator,
          } = await loadFixture(deployContracts);
          const otherParticipants = [addr1.address, addr2.address];
          await expect(
            createChallengeWith(sureYouDo.connect(creator), {
              otherParticipants,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "ChallengeParticipantsExceedMaximum",
          );
        });

        it("Should revert when participants is more than double maxParticipants for pro-account", async () => {
          const { sureYouDo, sydToken, addr1, addr2, addr3, addr4 } =
            await loadFixture(deployContracts);

          // transfer SYD to addr2 to make him a pro-account
          await sydToken.transfer(addr2.address, ethers.parseEther("100"));

          const otherParticipants = [
            addr1.address,
            addr2.address,
            addr3.address,
            addr4.address,
          ];
          await expect(
            createChallengeWith(sureYouDo, {
              otherParticipants,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "ChallengeParticipantsExceedMaximum",
          );
        });

        it("Should revert when verifier address is missing for duration only challenge", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);
          await expect(
            createChallengeWith(sureYouDo, {
              verifier: ethers.ZeroAddress,
              checkInPeriod: 0,
            }),
          ).to.be.revertedWithCustomError(
            sureYouDo,
            "VerifierRequiredForDurationOnlyChallenge",
          );
        });
      });

      describe("When Challenge is created", () => {
        it("Should emit ChallengeCreated event", async () => {
          const { sureYouDo, owner } = await loadFixture(deployContracts);
          await expect(createChallengeWith(sureYouDo))
            .to.emit(sureYouDo, "ChallengeCreated")
            .withArgs(0, owner.address);
        });

        it("Should create a personal challenge and start it", async () => {
          const { sureYouDo, creator, challengeManager } = await loadFixture(
            deployContractWithAChallenge,
          );
          const [challenge, challengePenaltyAddress] =
            await challengeManager.getChallenge(0);
          expect(challenge.id).to.equal(0n);
          expect(challenge.title).to.equal(defaultProperties.title);
          expect(challenge.valuePromised).to.equal(
            defaultProperties.pledgedValue,
          );
          expect(challenge.duration).to.equal(defaultProperties.duration);
          expect(challenge.checkInPeriod).to.equal(
            defaultProperties.checkInPeriod,
          );
          expect(challenge.penaltyType).to.eqls(
            BigInt(PenaltyType.ADD_TO_COMMUNITY),
          );
          expect(challenge.joinedParticipants).to.eqls([creator.address]);
          expect(challenge.participantsCount).to.equal(1);
          const platformCommission =
            (BigInt(defaultProperties.platformCommission) *
              defaultProperties.pledgedValue) /
            COMMISSION_PRECISION;
          expect(challenge.platformCommission).to.equal(platformCommission);

          expect(challenge.createdAt).to.be.greaterThan(0);
          expect(challenge.startedAt).to.be.greaterThan(0);
          expect(challenge.finalizedAt).to.equal(0n);
          expect(challengePenaltyAddress).to.equal(ethers.ZeroAddress);

          const lockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );
          expect(lockDetails.amount).to.equal(defaultProperties.pledgedValue);

          // expect totalLockedValue to be updated
          expect(await sureYouDo.totalLockedValue()).to.equal(
            defaultProperties.pledgedValue,
          );
        });

        it("Should create a challenge with other participant (maxParticipants is 2)", async () => {
          const { addr1 } = await getSigners();

          const {
            sureYouDo,
            challengeManager,
            owner: creator,
          } = await loadFixture(deployContracts);
          await createChallengeWith(sureYouDo.connect(creator), {
            otherParticipants: [addr1.address],
          });
          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.joinedParticipants).to.eqls([creator.address]);
          expect(challenge.participantsCount).to.equal(2);

          const p1 = await challengeManager.getChallengeParticipant(
            challenge.id,
            creator.address,
          );
          expect(p1.joinedAt).to.be.greaterThan(0);
          expect(p1.checkInCount).to.equal(0);
          expect(p1.lastCheckInAt).to.equal(0n);
          const p1LockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );
          expect(p1LockDetails.amount).to.equal(defaultProperties.pledgedValue);

          // p2 does not lock any amount yet
          const p2 = await challengeManager.getChallengeParticipant(
            challenge.id,
            addr1.address,
          );
          expect(p2.joinedAt).to.equal(0n);
          const p2LockDetails = await sureYouDo.getLockDetails(
            0,
            addr1.address,
          );
          expect(p2LockDetails.amount).to.equal(0n);
        });

        it("Should let a pro-account to create a challenge with checkInPeriod greater than 1", async () => {
          const { sureYouDo, sydToken, addr2 } =
            await loadFixture(deployContracts);

          // transfer SYD to addr2 to make him a pro-account
          await sydToken.transfer(addr2.address, ethers.parseEther("100"));

          expect(await sureYouDo.minimumProAccountBalance()).to.equal(
            ethers.parseEther("10"),
          );

          await expect(
            createChallengeWith(sureYouDo.connect(addr2), {
              checkInPeriod: 2,
            }),
          ).to.emit(sureYouDo, "ChallengeCreated");
        });

        it("Should let a pro-account to create a challenge with double maxParticipants", async () => {
          const { sureYouDo, sydToken, addr1, addr2, addr3 } =
            await loadFixture(deployContracts);

          // transfer SYD to addr2 to make him a pro-account
          await sydToken.transfer(addr2.address, ethers.parseEther("100"));

          const otherParticipants = [
            addr1.address,
            addr2.address,
            addr3.address,
          ];
          await expect(
            createChallengeWith(sureYouDo, {
              otherParticipants,
            }),
          ).to.not.be.reverted;
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("Validations", () => {
        it("Should revert when promised value is zero", async () => {
          const {
            sureYouDo,
            addr1,
            addr2: notAllowedTokenAddress,
          } = await loadFixture(deployContracts);

          // approve token to be used
          await tstToken
            .connect(addr1)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await expect(
            createChallengeWith(sureYouDo, {
              msgValue: 0n,
              pledgedValue: 0n,
              tokenToLock: notAllowedTokenAddress.address,
            }),
          ).to.be.reverted;
        });

        it("Should revert when tokenToLock is not allowed", async () => {
          const {
            sureYouDo,
            addr1,
            addr2: notAllowedTokenAddress,
          } = await loadFixture(deployContracts);

          // approve token to be used
          await tstToken
            .connect(addr1)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await expect(
            createChallengeWith(sureYouDo, {
              msgValue: 0n,
              tokenToLock: notAllowedTokenAddress.address,
            }),
          ).to.be.reverted;
        });

        it("Should revert when token is allowed but user is not approved to spend the token", async () => {
          const { sureYouDo } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          await expect(
            createChallengeWith(sureYouDo, {
              msgValue: 0n,
              tokenToLock: tstToken.target,
            }),
          )
            .to.be.revertedWithCustomError(
              tstToken,
              "ERC20InsufficientAllowance",
            )
            .withArgs(sureYouDo.target, 0, defaultProperties.pledgedValue);
        });

        it("Should revert when user approved the spend but his balance is not enough", async () => {
          const { sureYouDo, addr1 } = await loadFixture(deployContracts);

          // owner adds tstToken to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // approve token to be used
          await tstToken
            .connect(addr1)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await expect(
            createChallengeWith(sureYouDo.connect(addr1), {
              msgValue: 0n,
              tokenToLock: tstToken.target,
              pledgedValue: ethers.parseEther("100000000"),
            }),
          ).to.be.revertedWithCustomError(
            tstToken,
            "ERC20InsufficientAllowance",
          );

          // expect no lock to be created
          const lockDetails = await sureYouDo.getLockDetails(0, addr1.address);
          expect(lockDetails.lockedAt).to.equal(0n);
          expect(lockDetails.amount).to.equal(0n);
        });

        it("Should revert when token is pro-account-only token but creator is not a pro-account", async () => {
          const { sureYouDo, addr1 } = await loadFixture(deployContracts);

          // owner adds tstToken to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, true);

          // approve token to be used
          await tstToken
            .connect(addr1)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await expect(
            createChallengeWith(sureYouDo.connect(addr1), {
              msgValue: 0n,
              tokenToLock: tstToken.target,
              pledgedValue: ethers.parseEther("100000000"),
            }),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");

          // expect no lock to be created
          const lockDetails = await sureYouDo.getLockDetails(0, addr1.address);
          expect(lockDetails.lockedAt).to.equal(0n);
          expect(lockDetails.amount).to.equal(0n);
        });
      });

      describe("When Challenge is created", () => {
        it("Should create a challenge with a non-pro-account ERC20 token", async () => {
          const { sureYouDo, addr2 } = await loadFixture(deployContracts);

          const sureYouDoAddr = sureYouDo.target;

          // owner adds tstToken to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // approve token to be used
          await tstToken
            .connect(addr2)
            .approve(sureYouDoAddr, defaultProperties.pledgedValue);

          // expect the contract to have zero balance of tstToken before lock
          expect(
            await tstToken.connect(addr2).balanceOf(sureYouDoAddr),
          ).to.equal(0n);

          await createChallengeWith(sureYouDo.connect(addr2), {
            msgValue: 0n,
            tokenToLock: tstToken.target,
          });

          const lockDetails = await sureYouDo.getLockDetails(0, addr2.address);
          expect(lockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(lockDetails.lockedAt).to.be.greaterThan(0);
          expect(lockDetails.unlockedAmount).to.equal(0n);
          expect(lockDetails.winAmount).to.equal(0n);
          expect(lockDetails.lockedToken).to.equal(tstToken.target);

          expect(await tstToken.balanceOf(sureYouDoAddr)).to.equal(
            defaultProperties.pledgedValue,
          );

          // expect totalLockedValue to be updated
          expect(
            await sureYouDo.totalLockedValuePerToken(tstToken.target),
          ).to.equal(defaultProperties.pledgedValue);
        });

        it("Should create a challenge with pro-account-only ERC20 token", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
          } = await loadFixture(deployContracts);

          const sureYouDoAddr = sureYouDo.target;

          // transfer SYD to creator to make him a pro-account
          await sydToken.transfer(creator.address, ethers.parseEther("100"));

          // owner adds tstToken to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, true);

          // approve token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDoAddr, defaultProperties.pledgedValue);

          // expect the contract to have zero balance of tstToken before lock
          expect(
            await tstToken.connect(creator).balanceOf(sureYouDoAddr),
          ).to.equal(0n);

          await createChallengeWith(sureYouDo.connect(creator), {
            msgValue: 0n,
            tokenToLock: tstToken.target,
          });

          const lockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );
          expect(lockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(lockDetails.lockedAt).to.be.greaterThan(0);
          expect(lockDetails.unlockedAmount).to.equal(0n);
          expect(lockDetails.winAmount).to.equal(0n);
          expect(lockDetails.lockedToken).to.equal(tstToken.target);

          expect(await tstToken.balanceOf(sureYouDoAddr)).to.equal(
            defaultProperties.pledgedValue,
          );
        });
      });
    });
  });

  describe("joinChallenge", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when challenge is started already", async () => {
          const { sureYouDo, addr2 } = await loadFixture(
            deployContractWithAChallenge,
          );

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          ).to.be.revertedWithCustomError(sureYouDo, "JoinFailed");
        });

        it("Should revert when challenge is finalized already", async () => {
          const { sureYouDo, addr2 } = await loadFixture(deployContracts);

          // create a challenge
          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          // cancel the challenge to finalize it
          await sureYouDo.cancelChallenge(0);

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          ).to.be.revertedWithCustomError(sureYouDo, "JoinFailed");
        });

        it("Should revert when user is not allowed to join (is not a participant)", async () => {
          const { sureYouDo, addr2, addr4, challengeManager } =
            await loadFixture(deployContracts);

          // create a challenge
          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo
              .connect(addr4)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          ).to.be.revertedWithCustomError(challengeManager, "NotAllowedToJoin");
        });

        it("Should revert when already joined", async () => {
          const {
            sureYouDo,
            owner: creator,
            addr2,
            challengeManager,
          } = await loadFixture(deployContracts);

          // create a challenge
          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo
              .connect(creator)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          ).to.be.revertedWithCustomError(challengeManager, "AlreadyJoined");
        });

        it("Should revert when valuePromised is not equal to msg.value", async () => {
          const { sureYouDo, addr2 } = await loadFixture(deployContracts);

          // create a challenge
          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue + 100n, {
                value: defaultProperties.pledgedValue,
              }),
          ).to.be.revertedWithCustomError(sureYouDo, "InvalidPledgedValue");
        });
      });

      describe("When joined a challenge", () => {
        it("Should join a challenge and lock the amount", async () => {
          const {
            sureYouDo,
            owner: creator,
            addr2,
            challengeManager,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await sureYouDo
            .connect(addr2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.joinedParticipants).to.eqls([
            creator.address,
            addr2.address,
          ]);
          expect(challenge.participantsCount).to.equal(2);

          const p2 = await challengeManager.getChallengeParticipant(
            challenge.id,
            addr2.address,
          );
          expect(p2.joinedAt).to.be.greaterThan(0);
          expect(p2.checkInCount).to.equal(0);
          expect(p2.lastCheckInAt).to.equal(0n);

          const p2LockDetails = await sureYouDo.getLockDetails(
            0,
            addr2.address,
          );
          expect(p2LockDetails.amount).to.equal(defaultProperties.pledgedValue);

          // expect totalLockedValue to be updated
          expect(await sureYouDo.totalLockedValue()).to.equal(
            defaultProperties.pledgedValue * 2n,
          );
        });

        it("Should emit ParticipantJoined event from challengeManager", async () => {
          const { sureYouDo, addr2 } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, addr2.address);
        });

        it("Should start a challenge and emit ParticipantJoined and ChallengeStarted events when all participants joined", async () => {
          const { sureYouDo, challengeManager, addr2 } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, addr2.address)
            .to.emit(challengeManager, "ChallengeStarted")
            .withArgs(0);
        });

        it("Should start a challenge, emit ParticipantJoined event, but not emit ChallengeStarted event when not all participants have joined", async () => {
          const { sureYouDo, challengeManager, addr2, addr3 } =
            await loadFixture(deployContracts);

          // set maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address, addr3.address],
          });

          await expect(
            sureYouDo
              .connect(addr2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, addr2.address)
            .to.not.emit(challengeManager, "ChallengeStarted");
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("Validations", () => {
        it("Should revert when user is not allowed to join (is not a participant)", async () => {
          const {
            sureYouDo,
            addr3: creator,
            addr4,
            addr5,
            challengeManager,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // approve token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);
          await tstToken
            .connect(addr4)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);
          await tstToken
            .connect(addr5)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // create a challenge with a token
          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            msgValue: 0n,
            otherParticipants: [addr4.address],
          });

          await expect(
            sureYouDo
              .connect(addr5)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          ).to.be.revertedWithCustomError(challengeManager, "NotAllowedToJoin");
        });

        it("Should revert when already joined", async () => {
          const {
            sureYouDo,
            addr3: creator,
            addr4,
            challengeManager,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue * 2n);
          await tstToken
            .connect(addr4)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // create a challenge with a token
          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            msgValue: 0n,
            otherParticipants: [addr4.address],
          });

          await expect(
            sureYouDo
              .connect(creator)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          ).to.be.revertedWithCustomError(challengeManager, "AlreadyJoined");
        });

        it("Should revert when user is not approved the spend", async () => {
          const {
            sureYouDo,
            addr2: creator,
            addr3: p2,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // balance of creator
          const creatorBalance = await tstToken.balanceOf(creator.address);
          expect(ethers.formatEther(creatorBalance)).to.equal("1000.0");

          // balance of p2
          const p2Balance = await tstToken.balanceOf(p2.address);
          expect(ethers.formatEther(p2Balance)).to.equal("1000.0");

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          await expect(
            sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          )
            .to.be.revertedWithCustomError(
              tstToken,
              "ERC20InsufficientAllowance",
            )
            .withArgs(sureYouDo.target, 0, defaultProperties.pledgedValue);
        });

        it("Should revert when token is pro-account-only but participant is not a pro-account", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr3: p2,
          } = await loadFixture(deployContracts);

          // add tstToken to pro-account-only allowed tokens list
          await sureYouDo.addAllowedToken(tstToken.target, true);

          // transfer SYD to creator to make him a pro-account
          await sydToken.transfer(creator.address, ethers.parseEther("100"));

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // balance of creator
          const creatorBalance = await tstToken.balanceOf(creator.address);
          expect(ethers.formatEther(creatorBalance)).to.equal("1000.0");

          // balance of p2
          const p2Balance = await tstToken.balanceOf(p2.address);
          expect(ethers.formatEther(p2Balance)).to.equal("1000.0");

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          await expect(
            sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");
        });
      });

      describe("When joined a challenge", () => {
        it("Should join a challenge and lock the amount and emit ParticipantJoined event", async () => {
          const {
            sureYouDo,
            addr2: creator,
            addr3: p2,
            challengeManager,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // balance of creator
          const creatorBalance = await tstToken.balanceOf(creator.address);
          expect(ethers.formatEther(creatorBalance)).to.equal("1000.0");

          // balance of p2
          const p2Balance = await tstToken.balanceOf(p2.address);
          expect(ethers.formatEther(p2Balance)).to.equal("1000.0");

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: 0n,
            });

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.joinedParticipants).to.eqls([
            creator.address,
            p2.address,
          ]);
          expect(challenge.participantsCount).to.equal(2);

          const creatorLockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );
          expect(creatorLockDetails.amount).to.equal(
            defaultProperties.pledgedValue,
          );
          expect(creatorLockDetails.lockedAt).to.be.greaterThan(0);
          expect(creatorLockDetails.unlockedAmount).to.equal(0n);
          expect(creatorLockDetails.winAmount).to.equal(0n);
          expect(creatorLockDetails.lockedToken).to.equal(tstToken.target);

          const p2LockDetails = await sureYouDo.getLockDetails(0, p2.address);
          expect(p2LockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(p2LockDetails.lockedAt).to.be.greaterThan(0);
          expect(p2LockDetails.unlockedAmount).to.equal(0n);
          expect(p2LockDetails.winAmount).to.equal(0n);
          expect(p2LockDetails.lockedToken).to.equal(tstToken.target);

          // expect totalLockedValue to be updated
          expect(
            await sureYouDo.totalLockedValuePerToken(tstToken.target),
          ).to.equal(defaultProperties.pledgedValue * 2n);
        });

        it("Should join and emit ParticipantJoined event only when not all participants have joined", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
            addr3: p2,
            addr4: p3,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address, p3.address],
          });

          await expect(
            sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, p2.address)
            .to.not.emit(challengeManager, "ChallengeStarted");
        });

        it("Should join and emit ChallengeStarted event when all participants joined", async () => {
          const {
            sureYouDo,
            addr2: creator,
            addr3: p2,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          await expect(
            sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, p2.address);
        });

        it("Should join when token is a pro-account-only", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr3: p2,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, true);

          // transfer SYD to creator to make him a pro-account
          await sydToken.transfer(creator.address, ethers.parseEther("100"));

          // transfer SYD to p2 to make him a pro-account
          await sydToken.transfer(p2.address, ethers.parseEther("100"));

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          await expect(
            sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: 0n,
              }),
          )
            .to.emit(sureYouDo, "ParticipantJoined")
            .withArgs(0, p2.address);
        });
      });
    });
  });

  describe("cancelChallenge", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when challenge already started", async () => {
          const { sureYouDo, challengeManager } = await loadFixture(
            deployContractWithAChallenge,
          );

          await expect(
            sureYouDo.cancelChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeAlreadyStarted",
          );
        });

        it("Should revert when there is no locked value", async () => {
          const { sureYouDo, addr2 } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [addr2.address],
          });

          await expect(
            sureYouDo.connect(addr2).cancelChallenge(0),
          ).to.be.revertedWithCustomError(sureYouDo, "NoLockedValue");
        });

        it("Should revert when canceler is not the creator", async () => {
          const {
            sureYouDo,
            addr2: p2,
            addr3: p3,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address, p3.address],
          });

          // p2 joins the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          await expect(
            sureYouDo.connect(p2).cancelChallenge(0),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAllowedToCancel");
        });
      });

      describe("When challenge is canceled", () => {
        it("Should cancel the challenge and emit ChallengeCanceled event", async () => {
          const { sureYouDo, addr2: p2 } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address],
          });

          // expect totalLockedValue to be updated
          expect(await sureYouDo.totalLockedValue()).to.equal(
            defaultProperties.pledgedValue,
          );

          await expect(sureYouDo.cancelChallenge(0))
            .to.emit(sureYouDo, "ChallengeCancelled")
            .withArgs(0);

          // expect totalLockedValue to be updated
          expect(await sureYouDo.totalLockedValue()).to.equal(0n);
        });

        it("Should cancel the challenge and return the locked value to the joined participants", async () => {
          const {
            sureYouDo,
            owner: creator,
            addr2: p2,
            addr3: p3,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address, p3.address],
          });

          // p2 joins the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          const creatorBalanceBefore = await ethers.provider.getBalance(
            creator.address,
          );
          const p2BalanceBefore = await ethers.provider.getBalance(p2.address);

          await sureYouDo.cancelChallenge(0);

          const creatorBalanceAfter = await ethers.provider.getBalance(
            creator.address,
          );
          const p2BalanceAfter = await ethers.provider.getBalance(p2.address);

          // expect creator balance diff to be close to the locked value
          expect(
            parseFloat(
              ethers.formatEther(creatorBalanceAfter - creatorBalanceBefore),
            ),
          ).to.be.closeTo(
            parseFloat(ethers.formatEther(defaultProperties.pledgedValue)),
            0.1, // possible gas fee in eth
          );

          // expect p2 balance diff to be close to the locked value
          expect(
            parseFloat(ethers.formatEther(p2BalanceAfter - p2BalanceBefore)),
          ).to.be.closeTo(
            parseFloat(ethers.formatEther(defaultProperties.pledgedValue)),
            0.1, // possible gas fee in eth
          );
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("Validations", () => {
        it("Should revert when challenge already started", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr4: creator,
          } = await loadFixture(deployContracts);

          // add token to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
          });

          await expect(
            sureYouDo.connect(creator).cancelChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeAlreadyStarted",
          );
        });

        it("Should revert when there is no locked value", async () => {
          const {
            sureYouDo,
            addr4: creator,
            addr5: p2,
          } = await loadFixture(deployContracts);

          // add token to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          // p2 did not join so expect to have no value locked
          await expect(
            sureYouDo.connect(p2).cancelChallenge(0),
          ).to.be.revertedWithCustomError(sureYouDo, "NoLockedValue");
        });

        it("Should revert when canceler is not the creator", async () => {
          const {
            sureYouDo,
            addr4: creator,
            addr5: p2,
            addr3: p3,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          // add token to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address, p3.address],
          });

          // p2 joins the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          await expect(
            sureYouDo.connect(p2).cancelChallenge(0),
          ).to.be.revertedWithCustomError(sureYouDo, "NotAllowedToCancel");
        });
      });

      describe("When challenge is canceled", () => {
        it("Should cancel the challenge and emit ChallengeCanceled event", async () => {
          const {
            sureYouDo,
            addr2: p2,
            addr4: p3,
          } = await loadFixture(deployContracts);

          // add token to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p3)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(p2), {
            otherParticipants: [p3.address],
            tokenToLock: tstToken.target,
          });

          // expect totalLockedValue to be updated after lock
          expect(
            await sureYouDo.totalLockedValuePerToken(tstToken.target),
          ).to.equal(defaultProperties.pledgedValue);

          await expect(sureYouDo.connect(p2).cancelChallenge(0))
            .to.emit(sureYouDo, "ChallengeCancelled")
            .withArgs(0);

          // expect totalLockedValue to be updated after cancel
          expect(
            await sureYouDo.totalLockedValuePerToken(tstToken.target),
          ).to.equal(0n);
        });

        it("Should cancel the challenge and return the locked value to the joined participants", async () => {
          const {
            sureYouDo,
            addr4: creator,
            addr2: p2,
            addr6: p3,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          // add token to the allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            otherParticipants: [p2.address, p3.address],
          });

          // p2 joins the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          const creatorBalanceBefore = await tstToken.balanceOf(
            creator.address,
          );
          const p2BalanceBefore = await tstToken.balanceOf(p2.address);

          await sureYouDo.connect(creator).cancelChallenge(0);

          const creatorBalanceAfter = await tstToken.balanceOf(creator.address);
          const p2BalanceAfter = await tstToken.balanceOf(p2.address);

          // expect creator tstToken balance diff to be 0
          expect(
            parseFloat(
              ethers.formatEther(creatorBalanceAfter - creatorBalanceBefore),
            ),
          ).to.equal(0n);

          // expect p2 tstToken balance diff to be 0
          expect(
            parseFloat(ethers.formatEther(p2BalanceAfter - p2BalanceBefore)),
          ).to.equal(0n);
        });
      });
    });
  });

  describe("checkIn", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when challenge is not started", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: p2,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address],
          });

          // creator wants to check in
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotStarted",
          );
        });

        it("Should revert when its not a checkin required challenge", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // creator wants to check in
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "CheckInNotRequired",
          );
        });

        it("Should revert when already checked in in the period", async () => {
          const { sureYouDo, challengeManager } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo);

          // creator checks in
          await sureYouDo.checkIn(0);

          // creator checks in again
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "AlreadyCheckedIn",
          );
        });

        it("Should revert when current day is after the last day", async () => {
          const { sureYouDo, challengeManager } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            duration: 2,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [DAY_IN_SECONDS * 3]);

          // creator checks in
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "CheckInDurationEnded",
          );
        });
      });

      describe("When participant checks in", () => {
        it("Should add check-in and update the checkInCount and lastCheckInAt", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo);

          await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "CheckInAdded");

          const participant = await challengeManager.getChallengeParticipant(
            0,
            creator.address,
          );

          expect(participant.checkInCount).to.equal(1);
          expect(participant.lastCheckInAt).to.be.greaterThan(0);
        });

        describe("On last check-in day", () => {
          let sureYouDo: SureYouDo;
          let challengeManager: SydChallengeManager;
          let sydToken: SydToken;
          let charityManager: SydCharityManager;
          let creator: HardhatEthersSigner;
          let p2: HardhatEthersSigner;
          let charityAddress: string;

          const platformCommissionValue =
            (defaultProperties.pledgedValue *
              BigInt(defaultProperties.platformCommission)) /
            COMMISSION_PRECISION;
          const valuePerCheckIn =
            (defaultProperties.pledgedValue - platformCommissionValue) /
            BigInt(defaultProperties.duration);
          const endDayUnix = DAY_IN_SECONDS * (defaultProperties.duration - 1);

          beforeEach(async () => {
            const contracts = await loadFixture(
              deployContractWithActiveCharity,
            );
            sureYouDo = contracts.sureYouDo;
            sydToken = contracts.sydToken;
            challengeManager = contracts.challengeManager;
            charityManager = contracts.charityManager;
            charityAddress = contracts.charityAddress;
            creator = contracts.owner;
            p2 = contracts.addr4;
          });

          it("Should check in and finalize the value on last check-in day when penalty is DISTRIBUTE_TO_PARTICIPANTS", async () => {
            await createChallengeWith(sureYouDo, {
              checkInPeriod: 1,
              otherParticipants: [p2.address],
              penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
            });

            // p2 joins and starts the challenge
            await sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "ValueLost");

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);

            const p2Participant =
              await challengeManager.getChallengeParticipant(0, p2.address);

            const p2LockDetails = await sureYouDo.getLockDetails(0, p2.address);

            // expect p2 to have 0 check-in and have available value per one check-in
            expect(p2Participant.checkInCount).to.equal(0);
            expect(p2LockDetails.amount).to.equal(
              defaultProperties.pledgedValue,
            );
            expect(p2LockDetails.hasAvailableValue).to.equal(true);
            expect(p2LockDetails.unlockedAmount).to.equal(0n);
            expect(p2LockDetails.winAmount).to.equal(valuePerCheckIn * 9n); // creator missed 9 check-ins
          });

          it("Should check in and finalize the value on last check-in day when penalty is ADD_TO_COMMUNITY", async () => {
            await createChallengeWith(sureYouDo, {
              checkInPeriod: 1,
              penaltyType: PenaltyType.ADD_TO_COMMUNITY,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "ValueLost");

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);

            expect(await sureYouDo.availableCommunityDistribution()).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );
          });

          it("Should check in and finalize the value on last check-in day when penalty is TRANSFER_TO_ADDRESS", async () => {
            await createChallengeWith(sureYouDo, {
              checkInPeriod: 1,
              penaltyType: PenaltyType.TRANSFER_TO_ADDRESS,
              penaltyRecipientAddress: p2.address,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            const p2BalanceBefore = await ethers.provider.getBalance(
              p2.address,
            );

            await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "ValueLost");

            const p2BalanceAfter = await ethers.provider.getBalance(p2.address);

            expect(p2BalanceAfter - p2BalanceBefore).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
          });

          it("Should check in and finalize the value on last check-in day when penalty is DONATE_TO_CHARITY", async () => {
            await createChallengeWith(sureYouDo, {
              penaltyType: PenaltyType.DONATE_TO_CHARITY,
              penaltyRecipientAddress: charityAddress,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "ValueLost");

            expect(await sureYouDo.totalDonation()).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );

            expect(
              await charityManager.getTotalDonation(
                charityAddress,
                ethers.ZeroAddress,
              ),
            ).to.equal(valuePerCheckIn * 9n);

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
          });

          it("Should check in and finalize the value and mint the reward SYD for participant", async () => {
            await createChallengeWith(sureYouDo.connect(p2), {
              checkInPeriod: 1,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            const p2BalanceBefore = await sydToken.balanceOf(p2.address);

            await expect(sureYouDo.connect(p2).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            const p2BalanceAfter = await sydToken.balanceOf(p2.address);

            expect(p2BalanceAfter - p2BalanceBefore).to.equal(
              ethers.parseEther("0.2"),
            );
          });

          it("Should check in and finalize the value and mint the doubled reward SYD for pro-account", async () => {
            expect(await sydToken.balanceOf(creator.address)).to.greaterThan(
              await sureYouDo.minimumProAccountBalance(),
            );

            await createChallengeWith(sureYouDo, {
              checkInPeriod: 1,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            const creatorBalanceBefore = await sydToken.balanceOf(
              creator.address,
            );

            await expect(sureYouDo.checkIn(0)).to.emit(sureYouDo, "ValueLost");

            const creatorBalanceAfter = await sydToken.balanceOf(
              creator.address,
            );

            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
              ethers.parseEther("0.4"),
            );
          });
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("Validations", () => {
        it("Should revert when challenge is not started", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr3: creator,
            addr2: p2,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
            otherParticipants: [p2.address],
          });

          // creator wants to check in
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotStarted",
          );
        });

        it("Should revert when its not a checkin required challenge", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: verifier,
            addr4: creator,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
            tokenToLock: tstToken.target,
          });

          // creator wants to check in
          await expect(sureYouDo.checkIn(0)).to.be.revertedWithCustomError(
            challengeManager,
            "CheckInNotRequired",
          );
        });

        it("Should revert when already checked in in the period", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
          });

          // creator checks in
          await sureYouDo.connect(creator).checkIn(0);

          // creator checks in again
          await expect(
            sureYouDo.connect(creator).checkIn(0),
          ).to.be.revertedWithCustomError(challengeManager, "AlreadyCheckedIn");
        });

        it("Should revert when current day is after the last day", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            duration: 2,
            tokenToLock: tstToken.target,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [DAY_IN_SECONDS * 3]);

          // creator checks in
          await expect(
            sureYouDo.connect(creator).checkIn(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "CheckInDurationEnded",
          );
        });
      });

      describe("When participant checks in", () => {
        it("Should add check-in and update the checkInCount and lastCheckInAt", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
          });

          await sureYouDo.connect(creator).checkIn(0);

          const participant = await challengeManager.getChallengeParticipant(
            0,
            creator.address,
          );

          expect(participant.checkInCount).to.equal(1);
          expect(participant.lastCheckInAt).to.be.greaterThan(0);
        });

        describe("On last check-in day", () => {
          let sureYouDo: SureYouDo;
          let sydToken: SydToken;
          let challengeManager: SydChallengeManager;
          let charityManager: SydCharityManager;
          let creator: HardhatEthersSigner;
          let p2: HardhatEthersSigner;
          let charityAddress: string;

          const platformCommissionValue =
            (defaultProperties.pledgedValue *
              BigInt(defaultProperties.platformCommission)) /
            COMMISSION_PRECISION;
          const valuePerCheckIn =
            (defaultProperties.pledgedValue - platformCommissionValue) /
            BigInt(defaultProperties.duration);
          const endDayUnix = DAY_IN_SECONDS * (defaultProperties.duration - 1);

          beforeEach(async () => {
            const contracts = await loadFixture(
              deployContractWithActiveCharity,
            );
            sureYouDo = contracts.sureYouDo;
            sydToken = contracts.sydToken;
            challengeManager = contracts.challengeManager;
            charityManager = contracts.charityManager;
            charityAddress = contracts.charityAddress;
            creator = contracts.addr5;
            p2 = contracts.addr4;

            // add tstToken to allowed-tokens list
            await sureYouDo.addAllowedToken(tstToken.target, false);

            // creator approves token to be used
            await tstToken
              .connect(creator)
              .approve(sureYouDo.target, defaultProperties.pledgedValue);

            // p2 approves token to be used
            await tstToken
              .connect(p2)
              .approve(sureYouDo.target, defaultProperties.pledgedValue);
          });

          it("Should check in and finalize the value on last check-in day when penalty is DISTRIBUTE_TO_PARTICIPANTS", async () => {
            // transfer 100 SYD to creator to make him a pro-account
            await sydToken.transfer(creator.address, ethers.parseEther("100"));

            await createChallengeWith(sureYouDo.connect(creator), {
              checkInPeriod: 1,
              otherParticipants: [p2.address],
              penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
              tokenToLock: tstToken.target,
            });

            // p2 joins and starts the challenge
            await sureYouDo
              .connect(p2)
              .joinChallenge(0, defaultProperties.pledgedValue, {
                value: defaultProperties.pledgedValue,
              });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.connect(creator).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
            expect(creatorLockDetails.lockedToken).to.equal(tstToken.target);

            const p2Participant =
              await challengeManager.getChallengeParticipant(0, p2.address);

            const p2LockDetails = await sureYouDo.getLockDetails(0, p2.address);

            // expect p2 to have 0 check-in and have available value per one check-in
            expect(p2Participant.checkInCount).to.equal(0);
            expect(p2LockDetails.amount).to.equal(
              defaultProperties.pledgedValue,
            );
            expect(p2LockDetails.hasAvailableValue).to.equal(true);
            expect(p2LockDetails.unlockedAmount).to.equal(0n);
            expect(p2LockDetails.winAmount).to.equal(valuePerCheckIn * 9n); // creator missed 9 check-ins
            expect(p2LockDetails.lockedToken).to.equal(tstToken.target);
          });

          it("Should check in and finalize the value on last check-in day when penalty is ADD_TO_COMMUNITY", async () => {
            await createChallengeWith(sureYouDo.connect(creator), {
              checkInPeriod: 1,
              penaltyType: PenaltyType.ADD_TO_COMMUNITY,
              tokenToLock: tstToken.target,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.connect(creator).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
            expect(creatorLockDetails.lockedToken).to.equal(tstToken.target);

            expect(
              await sureYouDo.availableCommunityDistributionPerToken(
                tstToken.target,
              ),
            ).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );
          });

          it("Should check in and finalize the value on last check-in day when penalty is TRANSFER_TO_ADDRESS", async () => {
            // transfer 100 SYD to creator to make him a pro-account
            await sydToken.transfer(creator.address, ethers.parseEther("100"));

            await createChallengeWith(sureYouDo.connect(creator), {
              checkInPeriod: 1,
              penaltyType: PenaltyType.TRANSFER_TO_ADDRESS,
              penaltyRecipientAddress: p2.address,
              tokenToLock: tstToken.target,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            const p2BalanceBefore = await tstToken.balanceOf(p2.address);

            await expect(sureYouDo.connect(creator).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            const p2BalanceAfter = await tstToken.balanceOf(p2.address);

            expect(p2BalanceAfter - p2BalanceBefore).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
          });

          it("Should check in and finalize the value on last check-in day when penalty is DONATE_TO_CHARITY", async () => {
            await createChallengeWith(sureYouDo.connect(creator), {
              penaltyType: PenaltyType.DONATE_TO_CHARITY,
              penaltyRecipientAddress: charityAddress,
              tokenToLock: tstToken.target,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(sureYouDo.connect(creator).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            expect(await sureYouDo.totalDonationPerToken(tstToken)).to.equal(
              valuePerCheckIn * 9n, // creator missed 9 check-ins
            );

            expect(
              await charityManager.getTotalDonation(
                charityAddress,
                tstToken.target,
              ),
            ).to.equal(valuePerCheckIn * 9n);

            const creatorParticipant =
              await challengeManager.getChallengeParticipant(
                0,
                creator.address,
              );

            const creatorLockDetails = await sureYouDo.getLockDetails(
              0,
              creator.address,
            );

            // expect creator to have 1 check-in and have available value per one check-in
            expect(creatorParticipant.checkInCount).to.equal(1);
            expect(creatorLockDetails.hasAvailableValue).to.equal(true);
            expect(creatorLockDetails.unlockedAmount).to.equal(
              valuePerCheckIn * creatorParticipant.checkInCount, // only one check-in
            );
            expect(creatorLockDetails.winAmount).to.equal(0n);
          });

          it("Should check in and finalize the value and mint the reward SYD for participant", async () => {
            await createChallengeWith(sureYouDo.connect(creator), {
              checkInPeriod: 1,
              tokenToLock: tstToken.target,
            });

            // increase time to go to the last check-in day
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            const creatorBalanceBefore = await sydToken.balanceOf(
              creator.address,
            );

            await expect(sureYouDo.connect(creator).checkIn(0)).to.emit(
              sureYouDo,
              "ValueLost",
            );

            const creatorBalanceAfter = await sydToken.balanceOf(
              creator.address,
            );

            expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
              ethers.parseEther("0.2"),
            );
          });
        });
      });
    });
  });

  describe("finalizeChallenge", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when user is not eligible to finalize", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
            addr3,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [creator.address],
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          // creator wants to finalize
          await expect(
            sureYouDo.connect(addr3).finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "NotEligibleToFinalize",
          );
        });

        it("Should revert when only verifier can finalize a challenge", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr3: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          // creator wants to finalize
          await expect(
            sureYouDo.finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "VerificationRequired",
          );
        });

        it("Should revert when challenge is not started", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: p2,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address],
          });

          // creator wants to finalize
          await expect(
            sureYouDo.finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotStarted",
          );
        });

        it("Should revert when challenge is not ended", async () => {
          const { sureYouDo, challengeManager } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo);

          // creator wants to finalize
          await expect(
            sureYouDo.finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotEnded",
          );
        });

        it("Should revert when check-in duration not ended for all participants", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: p2,
          } = await loadFixture(deployContracts);

          const duration = 2;
          await createChallengeWith(sureYouDo, {
            otherParticipants: [p2.address],
            duration,
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // go to the last day of the challenge
          await ethers.provider.send("evm_increaseTime", [
            DAY_IN_SECONDS * (duration - 1),
          ]);

          // creator check-ins
          await sureYouDo.checkIn(0);

          // creator wants to finalize
          await expect(
            sureYouDo.finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "NotAllParticipantsHaveCheckedIn",
          );
        });

        it("Should revert when challenge is already finalized", async () => {
          const { sureYouDo, challengeManager } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo);

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          // creator finalizes the challenge
          await sureYouDo.finalizeChallenge(0);

          // creator wants to finalize again
          await expect(
            sureYouDo.finalizeChallenge(0),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeAlreadyFinalized",
          );
        });
      });

      describe("When challenge is finalized", () => {
        it("Should finalize the challenge and emit ChallengeFinalized event", async () => {
          const { sureYouDo, challengeManager, owner } =
            await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {});

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          await expect(sureYouDo.finalizeChallenge(0))
            .to.emit(sureYouDo, "ChallengeFinalized")
            .withArgs(0, owner.address);

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.finalizedAt).to.be.greaterThan(0);
        });

        it("Should finalize the challenge and emit ValueLost event", async () => {
          const {
            sureYouDo,
            addr2: p2,
            addr6: penaltyRecipientAddress,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            platformCommission: 0,
            penaltyType: PenaltyType.TRANSFER_TO_ADDRESS,
            penaltyRecipientAddress: penaltyRecipientAddress.address,
            otherParticipants: [p2.address],
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const penaltyAddressBalanceBefore = await ethers.provider.getBalance(
            penaltyRecipientAddress.address,
          );

          // creator finalizes the challenge
          await expect(sureYouDo.finalizeChallenge(0)).to.emit(
            sureYouDo,
            "ValueLost",
          );

          const penaltyAddressBalanceAfter = await ethers.provider.getBalance(
            penaltyRecipientAddress.address,
          );

          // expect to get the penalty of both creator and p2 since they've missed all check-ins
          expect(
            penaltyAddressBalanceAfter - penaltyAddressBalanceBefore,
          ).to.equal(defaultProperties.pledgedValue * 2n);
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("When challenge is finalized", () => {
        it("Should finalize the challenge and emit ChallengeFinalized event", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr3: creator,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            tokenToLock: tstToken.target,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          await expect(sureYouDo.connect(creator).finalizeChallenge(0))
            .to.emit(sureYouDo, "ChallengeFinalized")
            .withArgs(0, creator.address);

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.finalizedAt).to.be.greaterThan(0);
        });

        it("Should finalize the challenge and emit ValueLost event", async () => {
          const {
            sureYouDo,
            sydToken,
            addr3: creator,
            addr2: p2,
            addr6: penaltyRecipientAddress,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // transfer 100 SYD to creator to make him a pro-account
          await sydToken.transfer(creator.address, ethers.parseEther("100"));

          // creator creates the challenge
          await createChallengeWith(sureYouDo.connect(creator), {
            platformCommission: 0,
            penaltyType: PenaltyType.TRANSFER_TO_ADDRESS,
            penaltyRecipientAddress: penaltyRecipientAddress.address,
            otherParticipants: [p2.address],
            tokenToLock: tstToken.target,
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const penaltyAddressBalanceBefore = await tstToken.balanceOf(
            penaltyRecipientAddress.address,
          );

          // creator finalizes the challenge
          await expect(sureYouDo.connect(creator).finalizeChallenge(0)).to.emit(
            sureYouDo,
            "ValueLost",
          );

          const penaltyAddressBalanceAfter = await tstToken.balanceOf(
            penaltyRecipientAddress.address,
          );

          // expect to get the penalty of both creator and p2 since they've missed all check-ins
          expect(
            penaltyAddressBalanceAfter - penaltyAddressBalanceBefore,
          ).to.equal(defaultProperties.pledgedValue * 2n);
        });
      });
    });
  });

  describe("verifyAndFinalizeChallenge", () => {
    describe("With Network Token", () => {
      describe("Validations", () => {
        it("Should revert when user is not eligible to verify", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr7: verifier,
            addr3: nonVerifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];

          // creator wants to verify
          await expect(
            sureYouDo
              .connect(nonVerifier)
              .verifyAndFinalizeChallenge(0, successfulParticipants, []),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "NotEligibleToVerify",
          );
        });

        it("Should revert when challenge is not started", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr3: p2,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address],
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];
          const failedParticipants = [p2.address];

          // creator wants to verify
          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(
                0,
                successfulParticipants,
                failedParticipants,
              ),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotStarted",
          );
        });

        it("Should revert when challenge is not ended", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          const successfulParticipants = [creator.address];
          // creator wants to verify
          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(0, successfulParticipants, []),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "ChallengeNotEnded",
          );
        });

        it("Should revert when not all participants listed in status arrays", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr3: p2,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address],
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];

          // creator wants to verify
          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(0, successfulParticipants, []),
          ).to.be.revertedWithCustomError(
            challengeManager,
            "InvalidParticipantsCount",
          );
        });

        it("Should revert when non-participants listed in status arrays", async () => {
          const {
            sureYouDo,
            owner: creator,
            addr3: p2,
            addr2: nonParticipant,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address],
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [
            creator.address,
            nonParticipant.address,
          ];

          // creator wants to verify
          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(0, successfulParticipants, []),
          )
            .to.be.revertedWithCustomError(
              sureYouDo,
              `NotAChallengeParticipant`,
            )
            .withArgs(nonParticipant.address);
        });
      });

      describe("When challenge is verified and finalized", () => {
        it("Should verify and finalize the challenge and emit ChallengeFinalized event", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr3: p2,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address],
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];
          const failedParticipants = [p2.address];

          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(
                0,
                successfulParticipants,
                failedParticipants,
              ),
          )
            .to.emit(sureYouDo, "ChallengeFinalized")
            .withArgs(0, verifier.address)
            .to.emit(sureYouDo, "ValueLost")
            .withArgs(
              0,
              p2.address,
              defaultProperties.pledgedValue - ethers.parseEther("1"), // expected lost value
            );

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.finalizedAt).to.be.greaterThan(0);

          // value should be finalized for both creator and p2
          expect(
            await sureYouDo.valueFinalizedAt(0, creator.address),
          ).to.be.greaterThan(0);
          expect(
            await sureYouDo.valueFinalizedAt(0, p2.address),
          ).to.be.greaterThan(0);
        });

        it("Should finalize value properly for participants", async () => {
          const {
            sureYouDo,
            challengeManager,
            owner: creator,
            addr3: p2,
            addr4: p3,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          await createChallengeWith(sureYouDo, {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address, p3.address],
            penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
          });

          // p2 joins
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // p3 joins and starts the challenge
          await sureYouDo
            .connect(p3)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address, p3.address];
          const failedParticipants = [p2.address];

          await sureYouDo
            .connect(verifier)
            .verifyAndFinalizeChallenge(
              0,
              successfulParticipants,
              failedParticipants,
            );

          // get all challenges of verifier
          const verifierChallenges =
            await challengeManager.getVerifierChallenges(verifier.address);
          expect(verifierChallenges.length).to.equal(1);

          const platformCommissionValue =
            (defaultProperties.pledgedValue *
              BigInt(defaultProperties.platformCommission)) /
            COMMISSION_PRECISION;

          const expectedUnlockAmount =
            defaultProperties.pledgedValue - platformCommissionValue;

          const expectedWinAmount = expectedUnlockAmount / 2n; // both p3 and creator get half of the lost value

          const creatorLockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );

          expect(creatorLockDetails.hasAvailableValue).to.equal(true);
          expect(creatorLockDetails.amount).to.equal(
            defaultProperties.pledgedValue,
          );
          expect(creatorLockDetails.unlockedAmount).to.equal(
            expectedUnlockAmount,
          ); // unlocked his locked value
          expect(creatorLockDetails.winAmount).to.equal(expectedWinAmount); // won the value from p2

          const p3LockDetails = await sureYouDo.getLockDetails(0, p3.address);
          expect(p3LockDetails.hasAvailableValue).to.equal(true);
          expect(p3LockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(p3LockDetails.unlockedAmount).to.equal(expectedUnlockAmount);
          expect(p3LockDetails.winAmount).to.equal(expectedWinAmount);

          const p2LockDetails = await sureYouDo.getLockDetails(0, p2.address);
          expect(p2LockDetails.hasAvailableValue).to.equal(false);
          expect(p2LockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(p2LockDetails.unlockedAmount).to.equal(0n);
          expect(p2LockDetails.winAmount).to.equal(0n);

          // expect creator and p3 to be marked as winner
          const creatorParticipation =
            await challengeManager.getChallengeParticipant(0, creator.address);
          expect(creatorParticipation.isWinner).to.equal(true);
          const p3Participation =
            await challengeManager.getChallengeParticipant(0, p3.address);
          expect(p3Participation.isWinner).to.equal(true);

          // expect p2 to NOT be marked as winner
          const p2Participation =
            await challengeManager.getChallengeParticipant(0, p2.address);
          expect(p2Participation.isWinner).to.equal(false);
        });

        it("Should mind verifier's reward", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr6: verifier,
          } = await loadFixture(deployContracts);

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];

          const verifierBalanceBefore = await sydToken.balanceOf(
            verifier.address,
          );

          expect(verifierBalanceBefore).to.equal(0);

          await sureYouDo
            .connect(verifier)
            .verifyAndFinalizeChallenge(0, successfulParticipants, []);

          const verifierBalanceAfter = await sydToken.balanceOf(
            verifier.address,
          );

          expect(
            ethers.formatEther(verifierBalanceAfter - verifierBalanceBefore),
          ).to.equal("0.3"); // ~ 0.3 SYD
        });

        it("Should mind doubled reward when verifier is a pro-account", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr6: verifier,
          } = await loadFixture(deployContracts);

          // transfer 100 SYD to verifier to make him a pro-account
          await sydToken.transfer(verifier.address, ethers.parseEther("100"));

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];

          const verifierBalanceBefore = await sydToken.balanceOf(
            verifier.address,
          );

          expect(verifierBalanceBefore).to.equal(ethers.parseEther("100"));

          await sureYouDo
            .connect(verifier)
            .verifyAndFinalizeChallenge(0, successfulParticipants, []);

          const verifierBalanceAfter = await sydToken.balanceOf(
            verifier.address,
          );

          expect(
            ethers.formatEther(verifierBalanceAfter - verifierBalanceBefore),
          ).to.equal("0.6"); // ~ 0.6 SYD
        });
      });
    });

    describe("With ERC20 Token", () => {
      describe("When challenge is verified and finalized", () => {
        it("Should verify and finalize the challenge and emit ChallengeFinalized event", async () => {
          const {
            sureYouDo,
            challengeManager,
            addr2: creator,
            addr3: p2,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address],
            tokenToLock: tstToken.target,
          });

          // p2 joins and starts the challenge
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];
          const failedParticipants = [p2.address];

          await expect(
            sureYouDo
              .connect(verifier)
              .verifyAndFinalizeChallenge(
                0,
                successfulParticipants,
                failedParticipants,
              ),
          )
            .to.emit(sureYouDo, "ChallengeFinalized")
            .withArgs(0, verifier.address)
            .to.emit(sureYouDo, "ValueLost")
            .withArgs(
              0,
              p2.address,
              defaultProperties.pledgedValue - ethers.parseEther("1"), // expected lost value
            );

          const [challenge] = await challengeManager.getChallenge(0);
          expect(challenge.finalizedAt).to.be.greaterThan(0);

          // value should be finalized for both creator and p2
          expect(
            await sureYouDo.valueFinalizedAt(0, creator.address),
          ).to.be.greaterThan(0);
          expect(
            await sureYouDo.valueFinalizedAt(0, p2.address),
          ).to.be.greaterThan(0);
        });

        it("Should finalize value properly for participants", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr3: p2,
            addr4: p3,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          // update maxParticipants to 3
          await sureYouDo.updateMaxParticipants(
            defaultMaxParticipants,
            defaultMaxParticipantsProAccount,
          );

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p2 approves token to be used
          await tstToken
            .connect(p2)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // p3 approves token to be used
          await tstToken
            .connect(p3)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          // transfer 100 SYD to creator to make him a pro-account
          await sydToken.transfer(creator.address, ethers.parseEther("100"));

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
            otherParticipants: [p2.address, p3.address],
            penaltyType: PenaltyType.DISTRIBUTE_TO_PARTICIPANTS,
            tokenToLock: tstToken.target,
          });

          // p2 joins
          await sureYouDo
            .connect(p2)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // p3 joins and starts the challenge
          await sureYouDo
            .connect(p3)
            .joinChallenge(0, defaultProperties.pledgedValue, {
              value: defaultProperties.pledgedValue,
            });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address, p3.address];
          const failedParticipants = [p2.address];

          await sureYouDo
            .connect(verifier)
            .verifyAndFinalizeChallenge(
              0,
              successfulParticipants,
              failedParticipants,
            );

          const platformCommissionValue =
            (defaultProperties.pledgedValue *
              BigInt(defaultProperties.platformCommission)) /
            COMMISSION_PRECISION;

          const expectedUnlockAmount =
            defaultProperties.pledgedValue - platformCommissionValue;

          const expectedWinAmount = expectedUnlockAmount / 2n; // both p3 and creator get half of the lost value

          const creatorLockDetails = await sureYouDo.getLockDetails(
            0,
            creator.address,
          );

          expect(creatorLockDetails.hasAvailableValue).to.equal(true);
          expect(creatorLockDetails.amount).to.equal(
            defaultProperties.pledgedValue,
          );
          expect(creatorLockDetails.unlockedAmount).to.equal(
            expectedUnlockAmount,
          ); // unlocked his locked value
          expect(creatorLockDetails.winAmount).to.equal(expectedWinAmount); // won the value from p2
          expect(creatorLockDetails.lockedToken).to.equal(tstToken.target);

          const p3LockDetails = await sureYouDo.getLockDetails(0, p3.address);
          expect(p3LockDetails.hasAvailableValue).to.equal(true);
          expect(p3LockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(p3LockDetails.unlockedAmount).to.equal(expectedUnlockAmount);
          expect(p3LockDetails.winAmount).to.equal(expectedWinAmount);
          expect(p3LockDetails.lockedToken).to.equal(tstToken.target);

          const p2LockDetails = await sureYouDo.getLockDetails(0, p2.address);
          expect(p2LockDetails.hasAvailableValue).to.equal(false);
          expect(p2LockDetails.amount).to.equal(defaultProperties.pledgedValue);
          expect(p2LockDetails.unlockedAmount).to.equal(0n);
          expect(p2LockDetails.winAmount).to.equal(0n);
          expect(p2LockDetails.lockedToken).to.equal(tstToken.target);
        });

        it("Should mind verifier's reward", async () => {
          const {
            sureYouDo,
            sydToken,
            addr2: creator,
            addr7: verifier,
          } = await loadFixture(deployContracts);

          // add tstToken to allowed-tokens list
          await sureYouDo.addAllowedToken(tstToken.target, false);

          // creator approves token to be used
          await tstToken
            .connect(creator)
            .approve(sureYouDo.target, defaultProperties.pledgedValue);

          await createChallengeWith(sureYouDo.connect(creator), {
            checkInPeriod: 0,
            verifier: verifier.address,
          });

          // increase time to pass the duration
          await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

          const successfulParticipants = [creator.address];

          const verifierBalanceBefore = await sydToken.balanceOf(
            verifier.address,
          );

          expect(verifierBalanceBefore).to.equal(0);

          await sureYouDo
            .connect(verifier)
            .verifyAndFinalizeChallenge(0, successfulParticipants, []);

          const verifierBalanceAfter = await sydToken.balanceOf(
            verifier.address,
          );

          expect(
            ethers.formatEther(verifierBalanceAfter - verifierBalanceBefore),
          ).to.equal(
            "0.3", // ~ 0.3 SYD
          );
        });
      });
    });
  });

  describe("withdraw", () => {
    describe("Validations", () => {
      it("Should revert when user challenge does not exist", async () => {
        const { sureYouDo, addr2: creator } =
          await loadFixture(deployContracts);

        await expect(sureYouDo.connect(creator).withdraw(0)).to.be.reverted;
      });

      it("Should revert when user has no locked value", async () => {
        const {
          sureYouDo,
          addr2: creator,
          addr5,
        } = await loadFixture(deployContracts);

        await createChallengeWith(sureYouDo.connect(creator));

        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // finalize the challenge
        await sureYouDo.connect(creator).finalizeChallenge(0);

        await expect(
          sureYouDo.connect(addr5).withdraw(0),
        ).to.be.revertedWithCustomError(sureYouDo, "NoLockedValue");
      });

      it("Should revert when user has no available value", async () => {
        const { sureYouDo } = await loadFixture(deployContracts);

        await createChallengeWith(sureYouDo);
        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // finalize the challenge
        await sureYouDo.finalizeChallenge(0);

        await expect(sureYouDo.withdraw(0)).to.be.revertedWithCustomError(
          sureYouDo,
          "NoAvailableValue",
        );
      });

      it("Should revert when challenge is not ended", async () => {
        const { sureYouDo, addr2: creator } =
          await loadFixture(deployContracts);

        await createChallengeWith(sureYouDo);

        // creator wants to withdraw
        await expect(
          sureYouDo.connect(creator).withdraw(0),
        ).to.be.revertedWithCustomError(sureYouDo, "ChallengeNotFinalized");
      });

      it("Should revert when challenge is ended but not finalized", async () => {
        const { sureYouDo, addr2: creator } =
          await loadFixture(deployContracts);

        await createChallengeWith(sureYouDo);

        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // creator wants to withdraw
        await expect(
          sureYouDo.connect(creator).withdraw(0),
        ).to.be.revertedWithCustomError(sureYouDo, "ChallengeNotFinalized");
      });

      it("Should revert when token is pro-account only but user is not a pro-account", async () => {
        const {
          sureYouDo,
          sydToken,
          addr2: creator,
          addr3,
        } = await loadFixture(deployContracts);

        // add tstToken to allowed-tokens list
        await sureYouDo.addAllowedToken(tstToken.target, true);

        // transfer 100 SYD to creator to make him a pro-account
        await sydToken.transfer(creator.address, ethers.parseEther("1000"));

        // creator approves token to be used
        await tstToken
          .connect(creator)
          .approve(sureYouDo.target, defaultProperties.pledgedValue);

        await createChallengeWith(sureYouDo.connect(creator), {
          tokenToLock: tstToken.target,
          pledgedValue: defaultProperties.pledgedValue,
        });

        // check-in to get some value available
        await sureYouDo.connect(creator).checkIn(0);

        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // finalize the challenge
        await sureYouDo.connect(creator).finalizeChallenge(0);

        // transfer SYD to another account to make this account a normal account
        await sydToken
          .connect(creator)
          .transfer(addr3.address, ethers.parseEther("1000"));

        // non-pro creator wants to withdraw
        await expect(
          sureYouDo.connect(creator).withdraw(0),
        ).to.be.revertedWithCustomError(sureYouDo, "NotAProAccount");
      });
    });

    it("Should withdraw the available value and emit ValueWithdrawn event", async () => {
      const { sureYouDo, addr2: creator } = await loadFixture(deployContracts);

      await createChallengeWith(sureYouDo.connect(creator));

      // first check-in
      await sureYouDo.connect(creator).checkIn(0);

      // increase time to pass the 1st day
      await ethers.provider.send("evm_increaseTime", [DAY_IN_SECONDS]);

      // second check-in
      await sureYouDo.connect(creator).checkIn(0);

      // increase time to pass the duration
      await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

      // creator wants to finalize
      await sureYouDo.connect(creator).finalizeChallenge(0);

      const platformCommissionValue =
        (defaultProperties.pledgedValue *
          BigInt(defaultProperties.platformCommission)) /
        COMMISSION_PRECISION;
      const valuePerCheckIn =
        (defaultProperties.pledgedValue - platformCommissionValue) /
        BigInt(defaultProperties.duration);
      const expectedUnlockedAmount = valuePerCheckIn * 2n; // creator had two check-ins

      const creatorBalanceBefore = await ethers.provider.getBalance(
        creator.address,
      );

      // creator wants to withdraw
      await expect(sureYouDo.connect(creator).withdraw(0))
        .to.emit(sureYouDo, "ValueWithdrawn")
        .withArgs(0, creator.address, expectedUnlockedAmount);

      const creatorBalanceAfter = await ethers.provider.getBalance(
        creator.address,
      );

      expect(creatorBalanceAfter - creatorBalanceBefore).to.be.closeTo(
        expectedUnlockedAmount,
        ethers.parseEther("0.01"), // potential gas fee since creator is the sender of the transaction
      );

      expect(await sureYouDo.totalWithdrawals(0, creator.address)).to.equal(
        expectedUnlockedAmount,
      );
    });
  });

  describe("withdrawPlatformCommission", () => {
    it("Should revert when sender is not the owner", async () => {
      const { sureYouDo, addr2: creator } = await loadFixture(deployContracts);

      await expect(
        sureYouDo
          .connect(creator)
          .withdrawPlatformCommission(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(sureYouDo, "Unauthorized");
    });

    it("Should revert when available platform commission is 0", async () => {
      const { sureYouDo, owner } = await loadFixture(deployContracts);

      await expect(
        sureYouDo.connect(owner).withdrawPlatformCommission(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        sureYouDo,
        "NoAvailablePlatformCommissionValue",
      );
    });

    it("Should withdraw the available platform commission in network token", async () => {
      const { sureYouDo, owner } = await loadFixture(deployContracts);

      const platformCommission = 50; // 50%
      await createChallengeWith(sureYouDo, {
        platformCommission: platformCommission,
      });

      // increase time to pass the duration
      await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

      // finalize the challenge
      await sureYouDo.finalizeChallenge(0);

      const platformCommissionValue =
        (defaultProperties.pledgedValue * BigInt(platformCommission)) /
        COMMISSION_PRECISION;

      expect(await sureYouDo.availablePlatformCommission()).to.equal(
        platformCommissionValue,
      );

      const ownerBalanceBefore = await ethers.provider.getBalance(
        owner.address,
      );

      // owner wants to withdraw
      expect(
        await sureYouDo
          .connect(owner)
          .withdrawPlatformCommission(ethers.ZeroAddress),
      );

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.be.closeTo(
        platformCommissionValue,
        ethers.parseEther("0.01"), // potential gas fee since the owner is the sender of the transaction
      );

      expect(await sureYouDo.availablePlatformCommission()).to.equal(0n);
    });

    it("Should withdraw the available platform commission in ERC20 token", async () => {
      const {
        sureYouDo,
        owner,
        addr2: creator,
      } = await loadFixture(deployContracts);

      // add tstToken to allowed-tokens list
      await sureYouDo.addAllowedToken(tstToken.target, false);

      // creator approves token to be used
      await tstToken
        .connect(creator)
        .approve(sureYouDo.target, defaultProperties.pledgedValue);

      const platformCommission = 50; // 50%
      await createChallengeWith(sureYouDo.connect(creator), {
        platformCommission: platformCommission,
        tokenToLock: tstToken.target,
      });

      // increase time to pass the duration
      await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

      // finalize the challenge
      await sureYouDo.connect(creator).finalizeChallenge(0);

      const platformCommissionValue =
        (defaultProperties.pledgedValue * BigInt(platformCommission)) /
        COMMISSION_PRECISION;

      expect(await sureYouDo.availablePlatformCommission()).to.equal(0n);
      expect(
        await sureYouDo.availablePlatformCommissionPerToken(tstToken.target),
      ).to.equal(platformCommissionValue);

      const ownerBalanceBefore = await tstToken.balanceOf(owner.address);

      // owner wants to withdraw
      expect(
        await sureYouDo
          .connect(owner)
          .withdrawPlatformCommission(tstToken.target),
      );

      const ownerBalanceAfter = await tstToken.balanceOf(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(
        platformCommissionValue,
      );

      expect(
        await sureYouDo.availablePlatformCommissionPerToken(tstToken.target),
      ).to.equal(0n);
    });
  });

  describe("Community Distribution", () => {
    const endDayUnix = DAY_IN_SECONDS * 10;

    describe("With network token", () => {
      let sureYouDo: SureYouDo;
      let sydToken: SydToken;
      let owner: HardhatEthersSigner;
      let creator: HardhatEthersSigner;
      let addr2: HardhatEthersSigner;
      let holder1: HardhatEthersSigner;
      let holder2: HardhatEthersSigner;

      const platformCommissionValue =
        (defaultProperties.pledgedValue *
          BigInt(defaultProperties.platformCommission)) /
        COMMISSION_PRECISION;

      const expectedAvailableCommunityValue =
        defaultProperties.pledgedValue - platformCommissionValue;

      beforeEach(async () => {
        ({
          sureYouDo,
          sydToken,
          owner,
          addr1: creator,
          addr2,
          addr3: holder1,
          addr4: holder2,
        } = await loadFixture(deployContracts));

        // add 500 SYD to holders for testing purposes
        await sydToken
          .connect(owner)
          .transfer(holder1.address, ethers.parseEther("500"));
        await sydToken
          .connect(owner)
          .transfer(holder2.address, ethers.parseEther("500"));

        // holder1 approves SYD token to be used
        await sydToken
          .connect(holder1)
          .approve(sureYouDo.target, ethers.parseEther("500"));

        // holder2 approves SYD token to be used
        await sydToken
          .connect(holder2)
          .approve(sureYouDo.target, ethers.parseEther("500"));

        // create a challenge with penalty type as ADD_TO_COMMUNITY
        await createChallengeWith(sureYouDo.connect(creator), {
          penaltyType: PenaltyType.ADD_TO_COMMUNITY,
        });

        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // finalize the challenge
        await sureYouDo.connect(creator).finalizeChallenge(0);

        const availableCommunityDistribution =
          await sureYouDo.availableCommunityDistribution();
        expect(availableCommunityDistribution).to.equal(
          expectedAvailableCommunityValue,
        );
      });

      describe("initiateCommunityDistributionEvent", () => {
        describe("Validations", () => {
          it("should revert when event duration is zero", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  0,
                  100,
                  0n,
                  ethers.ZeroAddress,
                ),
            )
              .to.be.revertedWithCustomError(
                sureYouDo,
                "MissingRequiredParameter",
              )
              .withArgs(0);
          });

          it("should revert when min-enrollments is zero", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  10,
                  0,
                  0n,
                  ethers.ZeroAddress,
                ),
            )
              .to.be.revertedWithCustomError(
                sureYouDo,
                "MissingRequiredParameter",
              )
              .withArgs(1);
          });

          it("should revert when percentage to distribute is zero", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  10,
                  100,
                  0,
                  ethers.ZeroAddress,
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidPercentageToDistribute",
            );
          });

          it("should revert when percentage to distribute is more than 100", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  10,
                  100,
                  101,
                  ethers.ZeroAddress,
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidPercentageToDistribute",
            );
          });

          it("should revert when non-owner tries to start community distribution event", async () => {
            await expect(
              sureYouDo
                .connect(addr2)
                .initiateCommunityDistributionEvent(
                  10,
                  100,
                  0n,
                  ethers.ZeroAddress,
                ),
            ).to.be.reverted;
          });
        });

        it("should let owner to start community distribution event", async () => {
          expect(await sureYouDo.availableCommunityDistribution()).to.equal(
            expectedAvailableCommunityValue,
          );

          const availablePlatformCommissionBefore =
            await sureYouDo.availablePlatformCommission();

          await expect(
            sureYouDo.connect(owner).initiateCommunityDistributionEvent(
              10,
              100,
              100,
              ethers.ZeroAddress, // network token
            ),
          ).to.emit(sureYouDo, "DistributionEventCreated");

          const createdEvent = await sureYouDo.communityDistributionEvents(0);
          expect(createdEvent.id).to.equal(0n);
          expect(createdEvent.endsAt - createdEvent.startedAt).to.equal(
            10 * 24 * 60 * 60, // 10 days
          );

          expect(await sureYouDo.availableCommunityDistribution()).to.equal(0n);

          const availablePlatformCommissionAfter =
            await sureYouDo.availablePlatformCommission();

          // expect 10% of the distributed value to be added to the platform commission
          expect(
            availablePlatformCommissionAfter -
              availablePlatformCommissionBefore,
          ).to.equal((expectedAvailableCommunityValue * 10n) / 100n);
        });
      });

      describe("registerForCommunityDistributionEvent", () => {
        describe("Validations", () => {
          it("should revert when event is ended", async () => {
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                100,
                100,
                ethers.ZeroAddress,
              );

            // increase time to 11 days
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(
              sureYouDo
                .connect(addr2)
                .registerForCommunityDistributionEvent(
                  0,
                  ethers.parseEther("1"),
                ),
            ).to.be.revertedWithCustomError(sureYouDo, "EventEnded");
          });

          it("should revert when amount is less than 1 SYD", async () => {
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                100,
                100,
                ethers.ZeroAddress,
              );

            await expect(
              sureYouDo
                .connect(addr2)
                .registerForCommunityDistributionEvent(
                  0,
                  ethers.parseEther("1") - 1n,
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidEnrollmentAmount",
            );
          });

          it("should revert when user has no SYD balance", async () => {
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                2,
                100,
                ethers.ZeroAddress,
              );

            // enroll with different user
            await expect(
              sureYouDo
                .connect(addr2)
                .registerForCommunityDistributionEvent(
                  0,
                  ethers.parseEther("1"),
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InsufficientSydBalance",
            );
          });

          it("should revert when maxSydLockPerEnrollment is reached for user", async () => {
            const minEnrollments = 1;
            // create new event
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                minEnrollments,
                10,
                ethers.ZeroAddress,
              );

            // enroll with 500 SYD that is more than maxSydLockPerEnrollment
            await expect(
              sureYouDo
                .connect(holder1)
                .registerForCommunityDistributionEvent(
                  0,
                  ethers.parseEther("500"),
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidEnrollmentAmount",
            );
          });

          it("Should revert when locked SYD count exceeds expected SYD lock limit", async () => {
            const minEnrollments = 1;
            // create new event
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                minEnrollments,
                10,
                ethers.ZeroAddress,
              );

            // holder1 with 100 SYD
            await sureYouDo
              .connect(holder1)
              .registerForCommunityDistributionEvent(
                0,
                ethers.parseEther("100"),
              );

            // holder2 with 200 SYD
            await expect(
              sureYouDo
                .connect(holder2)
                .registerForCommunityDistributionEvent(
                  0,
                  ethers.parseEther("200"),
                ),
            ).to.be.revertedWithCustomError(sureYouDo, "MaxSydLockReached");
          });
        });

        it("should let user to enroll to community distribution", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          // expect creator to have 0.2 SYD after finalizing the challenge
          expect(await sydToken.balanceOf(creator.address)).to.equal(
            ethers.parseEther("0.2"),
          );

          // expect to have 0 locked SYD
          expect(await sydToken.balanceOf(sureYouDo.target)).to.be.greaterThan(
            0,
          );

          const mainSydBalanceBefore = await sydToken.balanceOf(
            sureYouDo.target,
          );

          // holder1 enrolls with 20 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("20"));

          // expect user to lock 2 SYD
          const enrollmentAmount =
            await sureYouDo.getCommunityEventEnrollmentAmount(
              holder1.address,
              0,
            );
          expect(ethers.formatEther(enrollmentAmount)).to.equal("20.0");

          const mainSydBalanceAfter = await sydToken.balanceOf(
            sureYouDo.target,
          );
          // expect to have 20 locked SYD
          expect(mainSydBalanceAfter - mainSydBalanceBefore).to.equal(
            ethers.parseEther("20"),
          );

          const addedEvent = await sureYouDo.communityDistributionEvents(0);
          expect(addedEvent.enrollmentsCount).to.equal(1n);
        });

        it("should let user to enroll more than once", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          const mainSydBalanceBefore = await sydToken.balanceOf(
            sureYouDo.target,
          );

          // enroll with 2 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("2"));

          // enroll with 2 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("2"));

          // expect user to lock 2 SYD
          const enrollmentAmount =
            await sureYouDo.getCommunityEventEnrollmentAmount(
              holder1.address,
              0,
            );
          expect(ethers.formatEther(enrollmentAmount)).to.equal("4.0");

          const mainSydBalanceAfter = await sydToken.balanceOf(
            sureYouDo.target,
          );
          // expect to have 4 locked SYD
          expect(mainSydBalanceAfter - mainSydBalanceBefore).to.equal(
            ethers.parseEther("4"),
          );

          // expect to have only one claim even though user enrolled twice
          const addedEvent = await sureYouDo.communityDistributionEvents(0);
          expect(addedEvent.enrollmentsCount).to.equal(1n);
        });

        it("should let different holders to enroll", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          const mainSydBalanceBefore = await sydToken.balanceOf(
            sureYouDo.target,
          );

          // holder1 with 2 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("2"));

          // holder2 with 5 SYD
          await sureYouDo
            .connect(holder2)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("5"));

          const mainSydBalanceAfter = await sydToken.balanceOf(
            sureYouDo.target,
          );

          // expect to have 7 locked SYD
          expect(mainSydBalanceAfter - mainSydBalanceBefore).to.equal(
            ethers.parseEther("7"),
          );

          // expect to have only one claim even though user enrolled twice
          const addedEvent = await sureYouDo.communityDistributionEvents(0);
          expect(addedEvent.enrollmentsCount).to.equal(2n);
        });
      });

      describe("collectCommunityEventDistributionValue", () => {
        describe("Validations", () => {
          it("should revert when eventId is invalid", async () => {
            await expect(
              sureYouDo
                .connect(addr2)
                .collectCommunityEventDistributionValue(10),
            ).to.be.reverted;
          });

          it("should revert when event is not ended", async () => {
            // create new event
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                100,
                100,
                ethers.ZeroAddress,
              );

            await expect(
              sureYouDo
                .connect(addr2)
                .collectCommunityEventDistributionValue(0),
            ).to.be.reverted;
          });

          it("should revert when user has no enrollment", async () => {
            // create new event
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                100,
                100,
                ethers.ZeroAddress,
              );

            // event ends
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            await expect(
              sureYouDo
                .connect(addr2)
                .collectCommunityEventDistributionValue(0),
            ).to.be.reverted;
          });
        });

        it("should collect full community distribution value when holder enrolls with maximum capacity", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          expect(await sureYouDo.availableCommunityDistribution()).to.equal(0n);

          const { maxSydLockPerEnrollment } =
            await sureYouDo.communityDistributionEvents(0);

          // holder1 enrolls with 100 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, maxSydLockPerEnrollment);

          const participantBalanceBefore =
            await ethers.provider.getBalance(holder1);

          // 10% of the distributed value to be added to the platform commission
          const expectedCollectableValue =
            expectedAvailableCommunityValue -
            (expectedAvailableCommunityValue * 10n) / 100n;

          // creator collects community distribution value
          await expect(
            sureYouDo
              .connect(holder1)
              .collectCommunityEventDistributionValue(0),
          )
            .to.emit(sureYouDo, "DistributionValueCollected")
            .withArgs(holder1.address, 0, expectedCollectableValue);

          const participantBalanceAfter =
            await ethers.provider.getBalance(holder1);

          expect(
            participantBalanceAfter - participantBalanceBefore,
          ).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.0002"), // potential gas fee
          );
        });

        it("should let multiple holders to collect their community distribution value", async () => {
          const minEnrollments = 2;
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(
              10,
              minEnrollments,
              100,
              ethers.ZeroAddress,
            );

          expect(await sureYouDo.availableCommunityDistribution()).to.equal(0n);

          // holder1 enrolls with 50 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // holder2 enrolls with 50 SYD
          await sureYouDo
            .connect(holder2)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // expect final value to distribute to be 4.049 SYD as holders did not enroll with maximum capacity
          const event = await sureYouDo.communityDistributionEvents(0);
          expect(event.finalValueToDistribute).to.be.closeTo(
            ethers.parseEther("4.049"),
            ethers.parseEther("0.001"),
          );

          const expectedCollectableValue = ethers.parseEther("2.024"); // for each holder for 50SYD lock

          const holder1BalanceBefore =
            await ethers.provider.getBalance(holder1);
          const holder2BalanceBefore =
            await ethers.provider.getBalance(holder2);

          // holder1 collects community distribution value
          await sureYouDo
            .connect(holder1)
            .collectCommunityEventDistributionValue(0);

          const holder1BalanceAfter = await ethers.provider.getBalance(holder1);

          expect(holder1BalanceAfter - holder1BalanceBefore).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.001"), // ignore precision for the sake of readability
          );

          // holder2 collects community distribution value
          await sureYouDo
            .connect(holder2)
            .collectCommunityEventDistributionValue(0);

          const holder2BalanceAfter = await ethers.provider.getBalance(holder2);

          expect(holder2BalanceAfter - holder2BalanceBefore).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.001"), // ignore precision for the sake of readability
          );
        });
      });

      describe("finalizeCommunityDistributionEvent", () => {
        describe("Validations", () => {
          it("should revert when sender is not the owner", async () => {
            await expect(
              sureYouDo.connect(addr2).finalizeCommunityDistributionEvent(0),
            ).to.be.reverted;
          });

          it("should revert when event is not ended", async () => {
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                1,
                100,
                ethers.ZeroAddress,
              );

            await expect(
              sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0),
            ).to.be.revertedWithCustomError(sureYouDo, "EventNotEnded");
          });

          it("should revert when event is already finalized", async () => {
            await sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                1,
                100,
                ethers.ZeroAddress,
              );

            // event ends
            await ethers.provider.send("evm_increaseTime", [endDayUnix]);

            // finalize the event
            await sureYouDo
              .connect(owner)
              .finalizeCommunityDistributionEvent(0);

            await expect(
              sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0),
            ).to.be.revertedWithCustomError(sureYouDo, "EventAlreadyFinalized");
          });
        });

        it("should let owner to finalize the event and add non-distributed value back to available community value", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          // no enrollment

          // event ends
          await ethers.provider.send("evm_increaseTime", [endDayUnix]);

          const event = await sureYouDo.communityDistributionEvents(0);
          expect(event.finalValueToDistribute).to.equal(0n);
          expect(event.totalSydLocked).to.equal(0n);
          expect(event.totalValueToDistribute).to.equal(
            ethers.parseEther("8.1"),
          );

          const communityValueBefore =
            await sureYouDo.availableCommunityDistribution();

          // finalize the event
          await sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0);

          const finalizedEvent = await sureYouDo.communityDistributionEvents(0);
          expect(finalizedEvent.finalizedAt).to.be.greaterThan(0n);

          const communityValueAfter =
            await sureYouDo.availableCommunityDistribution();
          expect(communityValueAfter).to.equal(
            communityValueBefore + event.totalValueToDistribute,
          );
        });

        it("should let owner to finalize the event and burn locked SYDs", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, ethers.ZeroAddress);

          // holder1 enrolls with 50 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // event ends
          await ethers.provider.send("evm_increaseTime", [endDayUnix]);

          const totalSydSupplyBefore = await sydToken.totalSupply();

          // finalize the event
          await sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0);

          const { totalSydLocked } =
            await sureYouDo.communityDistributionEvents(0);

          const totalSydSupplyAfter = await sydToken.totalSupply();

          expect(totalSydSupplyBefore - totalSydSupplyAfter).to.equal(
            totalSydLocked,
          );
        });
      });
    });

    describe("With ERC20 token", () => {
      let sureYouDo: SureYouDo;
      let sydToken: SydToken;
      let owner: HardhatEthersSigner;
      let creator: HardhatEthersSigner;
      let addr2: HardhatEthersSigner;
      let holder1: HardhatEthersSigner;
      let holder2: HardhatEthersSigner;

      const platformCommissionValue =
        (defaultProperties.pledgedValue *
          BigInt(defaultProperties.platformCommission)) /
        COMMISSION_PRECISION;

      const expectedAvailableCommunityValue =
        defaultProperties.pledgedValue - platformCommissionValue;

      beforeEach(async () => {
        ({
          sureYouDo,
          sydToken,
          owner,
          addr1: creator,
          addr2,
          addr3: holder1,
          addr4: holder2,
        } = await loadFixture(deployContracts));

        // add 500 SYD to holders for testing purposes
        await sydToken
          .connect(owner)
          .transfer(holder1.address, ethers.parseEther("500"));
        await sydToken
          .connect(owner)
          .transfer(holder2.address, ethers.parseEther("500"));

        // holder1 approves SYD token to be used
        await sydToken
          .connect(holder1)
          .approve(sureYouDo.target, ethers.parseEther("500"));

        // holder2 approves SYD token to be used
        await sydToken
          .connect(holder2)
          .approve(sureYouDo.target, ethers.parseEther("500"));

        // add tstToken to allowed-tokens list
        await sureYouDo.addAllowedToken(tstToken.target, false);

        // creator approves token to be used
        await tstToken
          .connect(creator)
          .approve(sureYouDo.target, defaultProperties.pledgedValue);

        // create a challenge with penalty type as ADD_TO_COMMUNITY
        await createChallengeWith(sureYouDo.connect(creator), {
          penaltyType: PenaltyType.ADD_TO_COMMUNITY,
          tokenToLock: tstToken.target,
        });

        // increase time to pass the duration
        await ethers.provider.send("evm_increaseTime", [endedDayUnix]);

        // finalize the challenge
        await sureYouDo.connect(creator).finalizeChallenge(0);

        const availableCommunityDistribution =
          await sureYouDo.availableCommunityDistributionPerToken(
            tstToken.target,
          );
        expect(availableCommunityDistribution).to.equal(
          expectedAvailableCommunityValue,
        );
      });

      describe("initiateCommunityDistributionEvent", () => {
        describe("Validations", () => {
          it("should revert when value percentage to distribute is zero", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  10,
                  100,
                  0n,
                  tstToken.target,
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidPercentageToDistribute",
            );
          });

          it("should revert when value percentage to distribute is bigger than 100", async () => {
            await expect(
              sureYouDo
                .connect(owner)
                .initiateCommunityDistributionEvent(
                  10,
                  100,
                  101n,
                  tstToken.target,
                ),
            ).to.be.revertedWithCustomError(
              sureYouDo,
              "InvalidPercentageToDistribute",
            );
          });

          it("should revert when available community distribution per token is zero", async () => {
            await expect(
              sureYouDo.connect(owner).initiateCommunityDistributionEvent(
                10,
                100,
                100,
                addr2.address, // different token
              ),
            ).to.be.revertedWithCustomError(sureYouDo, "NoAvailableValue");
          });
        });

        it("should let owner to start community distribution event", async () => {
          expect(
            await sureYouDo.availableCommunityDistributionPerToken(tstToken),
          ).to.equal(expectedAvailableCommunityValue);

          const availablePlatformCommissionBefore =
            await sureYouDo.availablePlatformCommissionPerToken(tstToken);

          await expect(
            sureYouDo
              .connect(owner)
              .initiateCommunityDistributionEvent(
                10,
                100,
                100,
                tstToken.target,
              ),
          ).to.emit(sureYouDo, "DistributionEventCreated");

          const createdEvent = await sureYouDo.communityDistributionEvents(0);
          expect(createdEvent.id).to.equal(0n);
          expect(createdEvent.endsAt - createdEvent.startedAt).to.equal(
            10 * 24 * 60 * 60, // 10 days
          );

          expect(
            await sureYouDo.availableCommunityDistributionPerToken(tstToken),
          ).to.equal(0n);

          const availablePlatformCommissionAfter =
            await sureYouDo.availablePlatformCommissionPerToken(tstToken);

          // expect 10% of the distributed value to be added to the platform commission
          expect(
            availablePlatformCommissionAfter -
              availablePlatformCommissionBefore,
          ).to.equal((expectedAvailableCommunityValue * 10n) / 100n);
        });
      });

      // same as network token
      // describe("registerForCommunityDistributionEvent", () => {});

      describe("collectCommunityEventDistributionValue", () => {
        it("should collect full community distribution value when holder enrolls with maximum capacity", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, tstToken.target);

          expect(
            await sureYouDo.availableCommunityDistributionPerToken(
              tstToken.target,
            ),
          ).to.equal(0n);

          const { maxSydLockPerEnrollment } =
            await sureYouDo.communityDistributionEvents(0);

          // holder1 enrolls with 100 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, maxSydLockPerEnrollment);

          const participantBalanceBefore = await tstToken.balanceOf(
            holder1.address,
          );

          // 10% of the distributed value to be added to the platform commission
          const expectedCollectableValue =
            expectedAvailableCommunityValue -
            (expectedAvailableCommunityValue * 10n) / 100n;

          // creator collects community distribution value
          await expect(
            sureYouDo
              .connect(holder1)
              .collectCommunityEventDistributionValue(0),
          )
            .to.emit(sureYouDo, "DistributionValueCollected")
            .withArgs(holder1.address, 0, expectedCollectableValue);

          const participantBalanceAfter = await tstToken.balanceOf(
            holder1.address,
          );

          expect(
            participantBalanceAfter - participantBalanceBefore,
          ).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.00001"), // potential gas fee
          );
        });

        it("should let multiple holders to collect their community distribution value", async () => {
          const minEnrollments = 2;
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(
              10,
              minEnrollments,
              100,
              tstToken.target,
            );

          expect(
            await sureYouDo.availableCommunityDistributionPerToken(
              tstToken.target,
            ),
          ).to.equal(0n);

          // holder1 enrolls with 50 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // holder2 enrolls with 50 SYD
          await sureYouDo
            .connect(holder2)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // expect final value to distribute to be 4.049 SYD as holders did not enroll with maximum capacity
          const event = await sureYouDo.communityDistributionEvents(0);
          expect(event.finalValueToDistribute).to.be.closeTo(
            ethers.parseEther("4.049"),
            ethers.parseEther("0.001"),
          );

          const expectedCollectableValue = ethers.parseEther("2.024"); // for each holder for 50SYD lock

          const holder1BalanceBefore = await tstToken.balanceOf(holder1);
          const holder2BalanceBefore = await tstToken.balanceOf(holder2);

          // holder1 collects community distribution value
          await sureYouDo
            .connect(holder1)
            .collectCommunityEventDistributionValue(0);

          const holder1BalanceAfter = await tstToken.balanceOf(holder1);

          expect(holder1BalanceAfter - holder1BalanceBefore).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.001"), // ignore precision for the sake of readability
          );

          // holder2 collects community distribution value
          await sureYouDo
            .connect(holder2)
            .collectCommunityEventDistributionValue(0);

          const holder2BalanceAfter = await tstToken.balanceOf(holder2);

          expect(holder2BalanceAfter - holder2BalanceBefore).to.be.closeTo(
            expectedCollectableValue,
            ethers.parseEther("0.001"), // ignore precision for the sake of readability
          );
        });
      });

      describe("finalizeCommunityDistributionEvent", () => {
        it("should let owner to finalize the event and add non-distributed value back to available community value", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, tstToken.target);

          // no enrollment

          // event ends
          await ethers.provider.send("evm_increaseTime", [endDayUnix]);

          const event = await sureYouDo.communityDistributionEvents(0);
          expect(event.finalValueToDistribute).to.equal(0n);
          expect(event.totalSydLocked).to.equal(0n);
          expect(event.totalValueToDistribute).to.equal(
            ethers.parseEther("8.1"),
          );

          const communityValueBefore =
            await sureYouDo.availableCommunityDistributionPerToken(
              tstToken.target,
            );

          // finalize the event
          await sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0);

          const finalizedEvent = await sureYouDo.communityDistributionEvents(0);
          expect(finalizedEvent.finalizedAt).to.be.greaterThan(0n);

          const communityValueAfter =
            await sureYouDo.availableCommunityDistributionPerToken(
              tstToken.target,
            );
          expect(communityValueAfter).to.equal(
            communityValueBefore + event.totalValueToDistribute,
          );
        });

        it("should let owner to finalize the event and burn locked SYDs", async () => {
          // create new event
          await sureYouDo
            .connect(owner)
            .initiateCommunityDistributionEvent(10, 1, 100, tstToken.target);

          // holder1 enrolls with 50 SYD
          await sureYouDo
            .connect(holder1)
            .registerForCommunityDistributionEvent(0, ethers.parseEther("50"));

          // event ends
          await ethers.provider.send("evm_increaseTime", [endDayUnix]);

          const totalSydSupplyBefore = await sydToken.totalSupply();

          // finalize the event
          await sureYouDo.connect(owner).finalizeCommunityDistributionEvent(0);

          const { totalSydLocked } =
            await sureYouDo.communityDistributionEvents(0);

          const totalSydSupplyAfter = await sydToken.totalSupply();

          expect(totalSydSupplyBefore - totalSydSupplyAfter).to.equal(
            totalSydLocked,
          );
        });
      });
    });
  });
});
