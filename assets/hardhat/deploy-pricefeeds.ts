/**
 * Pyth Price Feed Consumer — Hardhat Deploy Script
 *
 * Usage:
 *   npx hardhat run scripts/deploy-pricefeeds.ts --network <network>
 *
 * Environment variables:
 *   PYTH_ADDRESS  — Pyth contract on target chain (see references/chainlist.md)
 *
 * Adapt the contract name and constructor args to match YOUR consumer contract.
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // ─── Configuration ────────────────────────────────
  const pythAddress = process.env.PYTH_ADDRESS;
  if (!pythAddress) {
    throw new Error("PYTH_ADDRESS environment variable not set. See references/chainlist.md");
  }

  console.log("Pyth contract:", pythAddress);

  // ─── Deploy YOUR contract ─────────────────────────
  // Uncomment and adapt the section matching your contract:

  // --- Pull Consumer (most common) ---
  const feedId = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"; // ETH/USD
  const PullConsumer = await ethers.getContractFactory("PullConsumer");
  const pullConsumer = await PullConsumer.deploy(pythAddress, feedId);
  await pullConsumer.waitForDeployment();
  console.log("PullConsumer deployed to:", await pullConsumer.getAddress());

  // --- Push Consumer ---
  // const PushConsumer = await ethers.getContractFactory("PushConsumer");
  // const pushConsumer = await PushConsumer.deploy(pythAddress, feedId);
  // await pushConsumer.waitForDeployment();
  // console.log("PushConsumer deployed to:", await pushConsumer.getAddress());

  // --- Oracle Swap ---
  // const tokenBase = process.env.TOKEN_BASE!;
  // const tokenQuote = process.env.TOKEN_QUOTE!;
  // const baseFeedId = process.env.BASE_FEED_ID!;
  // const quoteFeedId = process.env.QUOTE_FEED_ID!;
  // const OracleSwap = await ethers.getContractFactory("OracleSwap");
  // const swap = await OracleSwap.deploy(pythAddress, tokenBase, tokenQuote, baseFeedId, quoteFeedId);
  // await swap.waitForDeployment();
  // console.log("OracleSwap deployed to:", await swap.getAddress());

  // --- Lending Oracle ---
  // const LendingOracle = await ethers.getContractFactory("LendingOracle");
  // const oracle = await LendingOracle.deploy(pythAddress);
  // await oracle.waitForDeployment();
  // console.log("LendingOracle deployed to:", await oracle.getAddress());

  // ─── Verification ─────────────────────────────────
  console.log("\nDeployment complete!");
  console.log("To verify on Etherscan:");
  console.log(`  npx hardhat verify --network <network> ${await pullConsumer.getAddress()} ${pythAddress} ${feedId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
