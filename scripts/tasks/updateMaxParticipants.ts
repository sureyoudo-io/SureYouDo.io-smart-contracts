import fs from "fs";
import path from "path";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SureYouDo__factory } from "../../typechain-types";
import logger from "../utils/logger";

const reportsDir = path.join(__dirname, "../..", "reports");
const updateMaxParticipantsReportDir = path.join(
  __dirname,
  "../..",
  "reports/updateMaxParticipants",
);

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
    const deployReport = path.join(
      reportsDir,
      `deploy/${targetNetwork.name}.json`,
    );
    if (!fs.existsSync(deployReport)) {
      logger.error(`No deployment found for "${targetNetwork.name}" network`);
      return;
    }
    const deployReportData = JSON.parse(fs.readFileSync(deployReport, "utf8"));
    const sydAddress = deployReportData.deployedAt.SureYouDo || "";

    // init the SYD contract
    const syd = SureYouDo__factory.connect(sydAddress, owner);

    // update the max participants in the main contract
    const tnx = await syd.updateMaxParticipants(regular, pro);
    await tnx.wait();
    logger.info(`Max participants updated successfully!`);

    // Write added charity to the report, each network can have multiple charities
    const updateMaxParticipantsReport = path.join(
      updateMaxParticipantsReportDir,
      `${targetNetwork.name}.json`,
    );
    let updateMaxParticipantsReportData = [];
    if (fs.existsSync(updateMaxParticipantsReport)) {
      updateMaxParticipantsReportData = JSON.parse(
        fs.readFileSync(updateMaxParticipantsReport, "utf8"),
      );
    } else {
      fs.mkdirSync(updateMaxParticipantsReportDir, { recursive: true });
    }
    updateMaxParticipantsReportData = [
      ...updateMaxParticipantsReportData,
      {
        timestamp: Date.now(),
        regular,
        pro,
      },
    ];
    fs.writeFileSync(
      updateMaxParticipantsReport,
      JSON.stringify(updateMaxParticipantsReportData, null, 2),
    );
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
