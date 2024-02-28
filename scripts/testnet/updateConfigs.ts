import { ethers } from "hardhat";
import { SureYouDo__factory } from "../../typechain-types";

const SYD_ADDRESS = "0x2b8bc41c7a5210d4abee9e47A52562C08A48D580";

async function main() {
  if (
    !process.env.POLYGON_AMOY_RPC_URL ||
    !process.env.POLYGON_AMOY_PRIVATE_KEY
  ) {
    throw new Error("Please set your environment variables");
  }

  const provider = new ethers.JsonRpcProvider(process.env.POLYGON_AMOY_RPC_URL);

  // Access the private key from environment variables
  const privateKey = process.env.POLYGON_AMOY_PRIVATE_KEY;

  // Create a new wallet instance
  const wallet = new ethers.Wallet(privateKey);

  // Connect the wallet to the provider
  const signer = wallet.connect(provider);

  try {
    const syd = SureYouDo__factory.connect(SYD_ADDRESS, provider).connect(
      signer,
    );

    const pledgeValue = ethers.parseEther("0.01");
    const tnx = await syd.createChallenge(
      "Add using Alchemy RPC",
      pledgeValue,
      1n,
      1n,
      ethers.ZeroAddress,
      1n,
      ethers.ZeroAddress,
      [],
      100n,
      ethers.ZeroAddress,
      {
        value: pledgeValue,
      },
    );
    await tnx.wait();
    console.log(`Res: ${await syd.maxParticipants()}`);
  } catch (err) {
    console.error(err);
  }
}

main()
  .then(() => {
    console.log("Done");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
