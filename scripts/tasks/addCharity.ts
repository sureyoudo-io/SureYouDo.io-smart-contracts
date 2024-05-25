import fs from "fs";
import path from "path";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SydCharityManager__factory } from "../../typechain-types";
import logger from "../utils/logger";

const reportsDir = path.join(__dirname, "../..", "reports");
const addCharityReportDir = path.join(__dirname, "../..", "reports/addCharity");

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

    // Get the deployed contract address from reports
    const deployReport = path.join(
      reportsDir,
      `deploy/${targetNetwork.name}.json`,
    );
    if (!fs.existsSync(deployReport)) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const deployReportData = JSON.parse(fs.readFileSync(deployReport, "utf8"));
    const charityManagerAddress =
      deployReportData.deployedAt.SydCharityManager || "";

    // deploy the charity contract
    const charityManager = SydCharityManager__factory.connect(
      charityManagerAddress,
      owner,
    );

    const addCharityTx = await charityManager.addCharity(address, name);
    await addCharityTx.wait();

    logger.info(`Charity "${name}" added successfully!`);

    // Write added charity to the report, each network can have multiple charities
    const addCharityReport = path.join(
      addCharityReportDir,
      `${targetNetwork.name}.json`,
    );
    let addCharityReportData = [];
    if (fs.existsSync(addCharityReport)) {
      addCharityReportData = JSON.parse(
        fs.readFileSync(addCharityReport, "utf8"),
      );
    } else {
      fs.mkdirSync(addCharityReportDir, { recursive: true });
    }
    addCharityReportData = [
      ...addCharityReportData,
      {
        timestamp: Date.now(),
        address,
        name,
      },
    ];
    fs.writeFileSync(
      addCharityReport,
      JSON.stringify(addCharityReportData, null, 2),
    );
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
