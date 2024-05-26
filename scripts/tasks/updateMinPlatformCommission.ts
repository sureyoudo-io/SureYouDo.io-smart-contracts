import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import logger from "../utils/logger";
import reportFactory, {
  type DeployReport,
  type UpdateMinPlatformCommissionReport,
} from "../utils/reports";

const updateMinPlatformCommission = async (
  {
    regular,
    pro,
  }: {
    regular: string;
    pro: string;
  },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;
    const reports = reportFactory(targetNetwork.name);

    logger.info(
      `Updating min platform commission on "${targetNetwork.name}" network`,
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
    const tnx = await syd.updateMinPlatformCommission(regular, pro);
    await tnx.wait();
    logger.info("Min platform commission updated successfully!");

    // Update reports
    const updatedReport = [
      ...(reports.readReport<UpdateMinPlatformCommissionReport[]>(
        "updateMinPlatformCommission",
      ) || []),
      {
        executedAt: new Date().toISOString(),
        regular,
        pro,
      },
    ];

    reports.writeReport("updateMinPlatformCommission", updatedReport);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:update-min-platform-commission",
  "Update the min platform commission",
  updateMinPlatformCommission,
)
  .addParam("regular", "The new max participants value for regular accounts")
  .addParam("pro", "The new max participants value for Pro accounts");
