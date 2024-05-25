import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { SureYouDo__factory } from "../../typechain-types";
import logger from "../utils/logger";
import reportFactory, {
  type DeployReport,
  type SetSydTokenAddressReport,
} from "../utils/reports";

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
    const reports = reportFactory(targetNetwork.name);

    logger.info(`Setting SYD token address on "${targetNetwork.name}" network`);
    const [owner] = await ethers.getSigners();

    // Get the deployed SYD contract address from reports
    const deployReportData = reports.readReport<DeployReport>("deploy");
    const sydAddress = deployReportData?.deployedAt.SureYouDo || "";

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

    // Update reports
    const updatedSetSydTokenReport = [
      ...(reports.readReport<SetSydTokenAddressReport[]>(
        "setSydTokenAddress",
      ) || []),
      {
        timestamp: Date.now(),
        address,
      },
    ];

    reports.writeReport("setSydTokenAddress", updatedSetSydTokenReport);
  } catch (error) {
    logger.error(error);
  }
};

task(
  "syd:set-syd-token-address",
  "Set the SYD token address",
  setSydTokenAddress,
).addParam("address", "The address of the SYD token");
