import fs from "fs";
import path from "path";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import logger from "../utils/logger";

const rootDir = path.join(__dirname, "../..");
const reportDir = path.join(__dirname, "../..", "reports/deploy");

const deploy = async (
  { force }: { force: boolean },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;

    // Check if there are any deployed contracts for this network
    const reportFile = path.join(reportDir, `${targetNetwork.name}.json`);
    if (fs.existsSync(reportFile)) {
      const reportData = JSON.parse(fs.readFileSync(reportFile, "utf8"));
      if (reportData && reportData.deployedAt) {
        if (!force) {
          logger.warn(
            `Contracts already deployed on "${targetNetwork.name}" network on ${new Date(reportData.timestamp).toLocaleString()}`,
          );
          logger.info(`SureYouDo: ${reportData.deployedAt.SureYouDo}`);
          logger.info(
            `SydChallengeManager: ${reportData.deployedAt.SydChallengeManager}`,
          );
          logger.info(
            `SydCharityManager: ${reportData.deployedAt.SydCharityManager}`,
          );
          return;
        } else {
          logger.warn(
            `Force deployment requested; re-deploying contracts on "${targetNetwork.name}" network`,
          );
        }
      }
    }

    logger.info(`Initiating deployment on ${targetNetwork.name} network`);
    const [owner] = await ethers.getSigners();

    const syd = await ethers.deployContract("SureYouDo");
    await syd.waitForDeployment();
    logger.info(`SureYouDo deployed; [${syd.target}]`);

    // deploy the challenge contract
    const ChallengeManager = await ethers.getContractFactory(
      "SydChallengeManager",
    );
    const challengeManager = await ChallengeManager.deploy(
      owner.address,
      syd.target,
    );
    logger.info(`SydChallengeManager deployed; [${challengeManager.target}]`);

    // deploy the charity contract
    const CharityManager = await ethers.getContractFactory("SydCharityManager");
    const charityManager = await CharityManager.deploy(
      owner.address,
      syd.target,
    );
    logger.info(`SydCharityManager deployed; [${charityManager.target}]`);

    // init syd contract
    await syd.initialize(charityManager.target, challengeManager.target);
    logger.info("SureYouDo contract initialization completed");

    // Write contract addresses to a file in the ./reports directory
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir);
    }
    const reportData = {
      timestamp: Date.now(),
      deployedAt: {
        SureYouDo: syd.target,
        SydChallengeManager: challengeManager.target,
        SydCharityManager: charityManager.target,
      },
    };
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    logger.info(
      `Deployment completed successfully! Reports in ${path.relative(rootDir, reportFile)};`,
    );
  } catch (err) {
    logger.error(err);
  }
};

task("syd:deploy", "Deploys the SureYouDo contracts", deploy).addParam(
  "force",
  "Force deployment even if the contract is already deployed",
  undefined,
  undefined,
  true,
);
