import fs from "fs";
import path from "path";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SureYouDo__factory } from "../../typechain-types";
import logger from "../utils/logger";

const reportsDir = path.join(__dirname, "../..", "reports");
const setSydTokenReportDir = path.join(
  __dirname,
  "../..",
  "reports/setSydTokenAddress",
);

const setSydTokenAddress = async (
  {
    address,
  }: {
    address: string;
  },
  hre: HardhatRuntimeEnvironment,
): Promise<void> => {
  try {
    const targetNetwork = hre.network;

    const { ethers } = hre;

    logger.info(`Setting SYD token address on "${targetNetwork.name}" network`);
    const [owner] = await ethers.getSigners();

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

    // set the syd token address in the main contract
    const setSydTokenTx = await syd.setSydTokenAddress(address);
    await setSydTokenTx.wait();
    logger.info(`SYD token address set successfully!`);

    // add SYD token to allowed tokens to lock value
    const addAllowedTokenTx = await syd.addAllowedToken(address, false);
    await addAllowedTokenTx.wait();
    logger.info(
      `SYD token added to allowed tokens to lock value successfully!`,
    );

    // Write added charity to the report, each network can have multiple charities
    const setSydTokenReport = path.join(
      setSydTokenReportDir,
      `${targetNetwork.name}.json`,
    );
    let setSydTokenReportData = [];
    if (fs.existsSync(setSydTokenReport)) {
      setSydTokenReportData = JSON.parse(
        fs.readFileSync(setSydTokenReport, "utf8"),
      );
    } else {
      fs.mkdirSync(setSydTokenReportDir, { recursive: true });
    }
    setSydTokenReportData = [
      ...setSydTokenReportData,
      {
        timestamp: Date.now(),
        address,
      },
    ];
    fs.writeFileSync(
      setSydTokenReport,
      JSON.stringify(setSydTokenReportData, null, 2),
    );
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:set-syd-token-address",
  "Set the SYD token address",
  setSydTokenAddress,
).addParam("address", "The address of the SYD token");
