import "dotenv/config";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import { HttpNetworkAccountsUserConfig } from "hardhat/types";

// Import tasks
import "./scripts/tasks";

// Set the OWNER_PRIVATE_KEY environment variable in the .env file
const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;

let networks = {};
let accounts: HttpNetworkAccountsUserConfig | undefined;

// We don't want to set up networks if we are running in Github Actions
const isRunningInGithubActions = !!process.env.GITHUB_ACTIONS;
if (!isRunningInGithubActions) {
  // init accounts
  accounts = OWNER_PRIVATE_KEY ? [OWNER_PRIVATE_KEY] : undefined;
  if (!accounts) {
    throw new Error("No private key found");
  }

  // init networks
  networks = {
    ...networks,
    // testnets
    POLYGON_AMOY_TESTNET: {
      url: process.env.POLYGON_AMOY_TESTNET_RPC_URL || "",
      accounts,
    },
    ARBITRUM_SEPPOLIA_TESTNET: {
      url: process.env.ARBITRUM_SEPPOLIA_TESTNET_RPC_URL || "",
      accounts,
    },

    // mainnets
    BSC_MAINNET: {
      url: process.env.BSC_MAINNET_RPC_URL || "",
      accounts,
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
