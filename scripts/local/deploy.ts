import { ethers } from "hardhat";

const SYD_OFT_ADDRESS = "0x038EAd554859Da5BB60Dfdd8375476cb35F53b95"; // oft address on amoy

const transferTestToken = async (
  testTokenAddress: string,
  toAddress: string,
  amount: number,
) => {
  const [owner] = await ethers.getSigners();
  const testToken = await ethers.getContractAt(
    "TestERC20",
    testTokenAddress,
    owner,
  );

  await testToken.transfer(toAddress, ethers.parseEther(amount.toString()));
};

async function main() {
  const [owner, addr1, addr2, addr3, charity1, charity2] =
    await ethers.getSigners();
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

  // add charity to the charity manager
  await charityManager.addCharity(charity1.address, "Cancer Research Charity");
  await charityManager.addCharity(charity2.address, "World Hunger Charity");

  // set the syd token address in the main contract
  await syd.setSydTokenAddress(SYD_OFT_ADDRESS);

  // deploy test erc20 token
  const testToken = await ethers.deployContract("TestERC20");
  await testToken.waitForDeployment();

  // add test token to allowed tokens
  await syd.addAllowedToken(testToken.target, true);

  // update max participants
  await syd.updateMaxParticipants(2, 6);

  // update the min platform commission
  await syd.updateMinPlatformCommission(50, 1); // 0.5% and 0.01%

  // send some tokens to other accounts
  transferTestToken(testToken.target as string, addr1.address, 300);
  transferTestToken(testToken.target as string, addr2.address, 300);
  transferTestToken(testToken.target as string, addr3.address, 300);

  // log as env file key maps
  console.log(`#-------------------------------------------------`);
  console.log(`SYD_ADDRESS=${syd.target}`);
  console.log(`CHALLENGE_MANAGER_ADDRESS=${challengeManager.target}`);
  console.log(`CHARITY_MANAGER_ADDRESS=${charityManager.target}`);
  console.log(`SYD_TOKEN_ADDRESS=${SYD_OFT_ADDRESS}`);
  console.log(`#-------------------------------------------------`);
  console.log(`TEST_ERC20_ADDRESS=${testToken.target}`);
  console.log(`#-------------------------------------------------`);
  console.log(`CHARITY_1=${charity1.address}`);
  console.log(`CHARITY_2=${charity2.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
