import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import logger from "../utils/logger";
import reportFactory, {
  AddCharityReport,
  DeployReport,
} from "../utils/reports";

const addCharity = async (
  {
    address,
    name,
  }: {
    address: string;
    name: string;
  },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;

    logger.info(`Adding charity on "${targetNetwork.name}" network`);
    const [owner] = await ethers.getSigners();
    const reports = reportFactory(targetNetwork.name);

    // Get the deployed contract address from reports
    const deployReport = reports.readReport<DeployReport>("deploy");
    if (!deployReport) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const charityManagerAddress =
      deployReport.deployedAt.SydCharityManager || "";

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const SydCharityManager__factory = await import("../../typechain-types");

    // deploy the charity contract
    const charityManager = SydCharityManager__factory.connect(
      charityManagerAddress,
      owner,
    );

    const addCharityTx = await charityManager.addCharity(address, name);
    await addCharityTx.wait();
    logger.info(`Charity "${name}" added successfully!`);

    // Update reports
    const updatedReports = [
      ...(reports.readReport<AddCharityReport[]>("addCharity") || []),
      {
        executedAt: new Date().toISOString(),
        address,
        name,
      },
    ];
    reports.writeReport("addCharity", updatedReports);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:add-charity",
  "Add charity to the SydCharityManager contract",
  addCharity,
)
  .addParam("address", "The address of the charity owner")
  .addParam("name", "The name of the charity");
