import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";

dotenv.config();

if (
  !process.env.POLYGON_AMOY_RPC_URL ||
  !process.env.POLYGON_AMOY_PRIVATE_KEY
) {
  throw new Error("Please set your environment variables");
}

const config: HardhatUserConfig = {
  defaultNetwork: "localhost",
  networks: {
    amoy: {
      url: process.env.POLYGON_AMOY_RPC_URL,
      accounts: [process.env.POLYGON_AMOY_PRIVATE_KEY],
    },
  },
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
      },
    },
  },
  gasReporter: {
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    gasPriceApi:
      "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
    token: "ETH",
    currency: "USD",
    gasPrice: 70,
  },
};

export default config;
