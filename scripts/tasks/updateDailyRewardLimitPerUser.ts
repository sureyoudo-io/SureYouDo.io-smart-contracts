import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SureYouDo__factory } from "../../typechain-types";
import logger from "../utils/logger";
import reportFactory, {
  type DeployReport,
  type UpdateDailyRewardLimitPerUserReport,
} from "../utils/reports";

const updateDailyRewardLimitPerUser = async (
  {
    limit,
  }: {
    limit: string;
  },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;
    const reports = reportFactory(targetNetwork.name);

    logger.info(
      `Updating daily reward limit per user to ${limit} on "${targetNetwork.name}" network`,
    );
    const [owner] = await ethers.getSigners();

    // Get the deployed SYD contract address from reports
    const deployReport = reports.readReport<DeployReport>("deploy");
    if (!deployReport) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const sydAddress = deployReport.deployedAt.SureYouDo || "";

    // init the SYD contract
    const syd = SureYouDo__factory.connect(sydAddress, owner);

    // update the min platform commission in the main contract
    const tnx = await syd.updateDailyRewardLimitPerUser(limit);
    await tnx.wait();
    logger.info("Daily reward limit per user updated successfully");

    // Update reports
    const updatedReport = [
      ...(reports.readReport<UpdateDailyRewardLimitPerUserReport[]>(
        "updateDailyRewardLimitPerUser",
      ) || []),
      {
        executedAt: new Date().toISOString(),
        limit,
      },
    ];

    reports.writeReport("updateDailyRewardLimitPerUser", updatedReport);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:update-daily-reward-limit-per-user",
  "Update the daily reward limit per user",
  updateDailyRewardLimitPerUser,
).addParam("limit", "The daily reward limit per user");
