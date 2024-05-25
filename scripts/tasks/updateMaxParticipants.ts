import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SureYouDo__factory } from "../../typechain-types";
import logger from "../utils/logger";
import reportFactory, {
  DeployReport,
  UpdateMaxParticipantsReport,
} from "../utils/reports";

const updateMaxParticipants = async (
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

    logger.info(`Updating max participants on "${targetNetwork.name}" network`);
    const [owner] = await ethers.getSigners();

    if (
      parseInt(regular) < 1 ||
      parseInt(pro) < 1 ||
      parseInt(pro) < parseInt(regular)
    ) {
      logger.error(`Invalid max participants value`);
      return;
    }

    // Get the deployed SYD contract address from reports
    const deployReport = reports.readReport<DeployReport>("deploy");
    if (!deployReport) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const sydAddress = deployReport.deployedAt.SureYouDo || "";

    // init the SYD contract
    const syd = SureYouDo__factory.connect(sydAddress, owner);

    // update the max participants in the main contract
    const tnx = await syd.updateMaxParticipants(regular, pro);
    await tnx.wait();
    logger.info(`Max participants updated successfully!`);

    // Update reports
    const updatedReport = [
      ...(reports.readReport<UpdateMaxParticipantsReport[]>(
        "updateMaxParticipants",
      ) || []),
      {
        timestamp: Date.now(),
        regular,
        pro,
      },
    ];

    reports.writeReport("updateMaxParticipants", updatedReport);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:update-max-participants",
  "Set the SYD token address",
  updateMaxParticipants,
)
  .addParam("regular", "The new max participants value")
  .addParam("pro", "The new max participants value for Pro accounts");
