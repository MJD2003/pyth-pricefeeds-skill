/**
 * Pyth Price Feeds — Hardhat Configuration Template
 *
 * Copy to your project root and adapt as needed.
 * Install: npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
 *          npm install @pythnetwork/pyth-sdk-solidity
 */

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // ─── Testnets ───────────────────────────────────
    sepolia: {
      url: process.env.RPC_URL || "https://rpc.sepolia.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0xDd24F84d36BF92C65F92307595335bdFab5Bbd21
    },
    arbitrumSepolia: {
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF
    },
    baseSepolia: {
      url: "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
    },
    optimismSepolia: {
      url: "https://sepolia.optimism.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x0708325268dF9F66270F1401206434524814508b
    },

    // ─── Mainnets ───────────────────────────────────
    ethereum: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x4305FB66699C3B2702D4d05CF36551390A4c69C6
    },
    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C
    },
    base: {
      url: "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
    },
    optimism: {
      url: "https://mainnet.optimism.io",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C
    },
    polygon: {
      url: "https://polygon-rpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x4305FB66699C3B2702D4d05CF36551390A4c69C6
    },
    bsc: {
      url: "https://bsc-dataseed.binance.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // Pyth: 0x4D7E825f80bDf85e913E0DD2A2D54927e9dE1594
    },
  },

  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },

  // Pyth SDK resolves via node_modules automatically in Hardhat
  // No remappings needed (unlike Foundry)
};

export default config;
