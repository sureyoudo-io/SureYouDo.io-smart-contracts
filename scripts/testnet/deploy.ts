import { ethers } from "hardhat";

const TOTAL_SUPPLY = 1_000_000;
const OWNER_SUPPLY = TOTAL_SUPPLY * 0.9;
const SYD_REWARD_SUPPLY = TOTAL_SUPPLY * 0.1;
const MAX_PARTICIPANTS = 2;
const MIN_PLATFORM_COMMISSION = 50; // 0.5%
const MIN_PLATFORM_COMMISSION_PRO_ACCOUNT = 1; // 0.01%

const testCharityAddress = "0x24bbfc043cecC7C60ABDa9eb2a858CCb3Bd04Fa4";

async function main() {
  const [owner] = await ethers.getSigners();
  const syd = await ethers.deployContract("SureYouDo");
  await syd.waitForDeployment();

  // deploy the charity contract
  const CharityManager = await ethers.getContractFactory("SydCharityManager");
  const charityManager = await CharityManager.deploy(owner.address, syd.target);

  // deploy the challenge contract
  const ChallengeManager = await ethers.getContractFactory(
    "SydChallengeManager",
  );
  const challengeManager = await ChallengeManager.deploy(
    owner.address,
    syd.target,
  );

  // init syd contract
  await syd.initialize(charityManager.target, challengeManager.target);

  // add charities to the charity manager
  await charityManager.addCharity(testCharityAddress, "Test Charity");

  // deploy SYD token
  // 90% to owner and 10% to syd contract for rewards
  const SYDToken = await ethers.getContractFactory("SydToken");
  const sydToken = await SYDToken.deploy(
    "SureYouDo",
    "SYD",
    [owner.address, syd.target],
    [
      ethers.parseEther(OWNER_SUPPLY.toString()),
      ethers.parseEther(SYD_REWARD_SUPPLY.toString()),
    ],
  );

  // set the syd token address in the main contract
  await syd.setSydTokenAddress(sydToken.target);

  // add SYD token to allowed tokens to lock value
  await syd.addAllowedToken(syd.target, true);

  // update max participants
  await syd.updateMaxParticipants(MAX_PARTICIPANTS);

  // update the min platform commission
  await syd.updateMinPlatformCommission(
    MIN_PLATFORM_COMMISSION,
    MIN_PLATFORM_COMMISSION_PRO_ACCOUNT,
  );

  // log as env file key maps
  console.log(`#-------------------------------------------------`);
  console.log(`SYD_ADDRESS=${syd.target}`);
  console.log(`CHALLENGE_MANAGER_ADDRESS=${challengeManager.target}`);
  console.log(`CHARITY_MANAGER_ADDRESS=${charityManager.target}`);
  console.log(`SYD_TOKEN_ADDRESS=${sydToken.target}`);
  console.log(`OWNER_ADDRESS=${owner.address}`);
  console.log(`#-------------------------------------------------`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
