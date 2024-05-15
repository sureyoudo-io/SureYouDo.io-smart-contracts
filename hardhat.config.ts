import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";

dotenv.config();

let networks = {};

// If not running in GitHub Actions, add the Amoy network
if (
  !process.env.GITHUB_ACTIONS &&
  process.env.POLYGON_AMOY_RPC_URL &&
  process.env.POLYGON_AMOY_PRIVATE_KEY
) {
  networks = {
    ...networks,
    amoy: {
      url: process.env.POLYGON_AMOY_RPC_URL,
      accounts: [process.env.POLYGON_AMOY_PRIVATE_KEY],
    },
  };
}

if (
  !process.env.GITHUB_ACTIONS &&
  process.env.ARBITRUM_SEPOLIA_RPC_URL &&
  process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY
) {
  networks = {
    ...networks,
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL,
      accounts: [process.env.ARBITRUM_SEPOLIA_PRIVATE_KEY],
    },
  };
}

const config: HardhatUserConfig = {
  defaultNetwork: "localhost",
  networks,
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
