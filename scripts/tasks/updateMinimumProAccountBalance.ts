import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import logger from "../utils/logger";
import reportFactory, {
  type DeployReport,
  type UpdateMinimumProAccountBalanceReport,
} from "../utils/reports";

const updateMinimumProAccountBalance = async (
  {
    minBalance,
  }: {
    minBalance: string;
  },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;
    const reports = reportFactory(targetNetwork.name);

    logger.info(
      `Updating the minimum Pro account SYD balance to ${minBalance} on "${targetNetwork.name}" network`,
    );
    const [owner] = await ethers.getSigners();

    // Get the deployed SYD contract address from reports
    const deployReport = reports.readReport<DeployReport>("deploy");
    if (!deployReport) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const sydAddress = deployReport.deployedAt.SureYouDo || "";

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { SureYouDo__factory } = await import("../../typechain-types");

    // init the SYD contract
    const syd = SureYouDo__factory.connect(sydAddress, owner);

    // update the min platform commission in the main contract
    const tnx = await syd.updateMinimumProAccountBalance(minBalance);
    await tnx.wait();
    logger.info("Minimum Pro account SYD balance updated successfully");

    // Update reports
    const updatedReport = [
      ...(reports.readReport<UpdateMinimumProAccountBalanceReport[]>(
        "updateMinimumProAccountBalance",
      ) || []),
      {
        executedAt: new Date().toISOString(),
        minBalance,
      },
    ];

    reports.writeReport("updateMinimumProAccountBalance", updatedReport);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:update-minimum-pro-account-balance",
  "Update the minimum Pro account SYD balance",
  updateMinimumProAccountBalance,
).addParam("minBalance", "The minimum SYD amount per user");
