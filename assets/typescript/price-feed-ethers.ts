/**
 * Pyth Price Feeds — ethers.js v6 on-chain client.
 *
 * Install: npm install ethers @pythnetwork/hermes-client
 *
 * This template shows how to:
 *   1. Fetch price updates from Hermes
 *   2. Submit them on-chain via your consumer contract
 *   3. Read the updated price
 *
 * Adapt to your project's patterns.
 */

import { ethers, Contract, JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://sepolia.optimism.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";
const PYTH_ADDRESS = process.env.PYTH_ADDRESS || ""; // From references/chainlist.md
const CONSUMER_ADDRESS = process.env.CONSUMER_ADDRESS || "";

// Minimal ABI for Pyth contract
const PYTH_ABI = [
  "function getUpdateFee(bytes[] calldata updateData) view returns (uint256)",
  "function updatePriceFeeds(bytes[] calldata updateData) payable",
  "function getPriceNoOlderThan(bytes32 id, uint256 age) view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
  "function getPriceUnsafe(bytes32 id) view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
  "function getEmaPriceNoOlderThan(bytes32 id, uint256 age) view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
];

// Your consumer contract ABI (adapt to your contract)
const CONSUMER_ABI = [
  "function updateAndGetPrice(bytes[] calldata priceUpdate) payable returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
  "function getLatestPrice() view returns (tuple(int64 price, uint64 conf, int32 expo, uint publishTime))",
  "function getUpdateFee(bytes[] calldata priceUpdate) view returns (uint256)",
];

// ─── Types ──────────────────────────────────────────────

interface PythPrice {
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: bigint;
}

// ─── Core Functions ─────────────────────────────────────

/**
 * Fetch the latest price update data from Hermes for on-chain submission.
 */
export async function fetchPriceUpdateData(feedIds: string[]): Promise<string[]> {
  const hermes = new HermesClient(HERMES_URL);
  const updates = await hermes.getLatestPriceUpdates(feedIds);
  return updates.binary.data.map((d: string) => "0x" + d);
}

/**
 * Update prices on the Pyth contract and return the tx receipt.
 */
export async function updatePricesOnChain(
  feedIds: string[],
  signer: ethers.Signer
): Promise<ethers.TransactionReceipt> {
  const pyth = new Contract(PYTH_ADDRESS, PYTH_ABI, signer);

  // Fetch update data from Hermes
  const updateData = await fetchPriceUpdateData(feedIds);

  // Get the required fee
  const fee = await pyth.getUpdateFee(updateData);

  // Submit the update
  const tx = await pyth.updatePriceFeeds(updateData, { value: fee });
  return tx.wait();
}

/**
 * Read the current on-chain price for a feed.
 */
export async function readPrice(
  feedId: string,
  maxAge: number,
  provider: ethers.Provider
): Promise<{ value: number; confidence: number; publishTime: number }> {
  const pyth = new Contract(PYTH_ADDRESS, PYTH_ABI, provider);
  const price: PythPrice = await pyth.getPriceNoOlderThan(feedId, maxAge);

  return {
    value: Number(price.price) * 10 ** price.expo,
    confidence: Number(price.conf) * 10 ** price.expo,
    publishTime: Number(price.publishTime),
  };
}

/**
 * Full flow: fetch from Hermes → update on-chain → read price.
 * Use this with your consumer contract's updateAndGetPrice function.
 */
export async function updateAndReadPrice(
  feedIds: string[],
  consumerAddress: string,
  signer: ethers.Signer
): Promise<PythPrice> {
  const consumer = new Contract(consumerAddress, CONSUMER_ABI, signer);

  // Fetch update data
  const updateData = await fetchPriceUpdateData(feedIds);

  // Get fee
  const fee = await consumer.getUpdateFee(updateData);

  // Update and read in one tx
  const tx = await consumer.updateAndGetPrice(updateData, { value: fee });
  const receipt = await tx.wait();

  // Read the price after update
  return consumer.getLatestPrice();
}

/**
 * Convert a Pyth price to a human-readable number.
 */
export function formatPythPrice(price: PythPrice): string {
  const value = Number(price.price) * 10 ** price.expo;
  const conf = Number(price.conf) * 10 ** price.expo;
  return `$${value.toFixed(2)} ±$${conf.toFixed(4)}`;
}

// ─── Usage Example ──────────────────────────────────────

async function main() {
  const provider = new JsonRpcProvider(RPC_URL);
  const signer = new Wallet(PRIVATE_KEY, provider);

  const ETH_USD = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  // Option A: Direct Pyth contract interaction
  console.log("Updating ETH/USD price on-chain...");
  await updatePricesOnChain([ETH_USD], signer);

  const price = await readPrice(ETH_USD, 60, provider);
  console.log(`ETH/USD: $${price.value.toFixed(2)} ±$${price.confidence.toFixed(4)}`);

  // Option B: Via your consumer contract
  if (CONSUMER_ADDRESS) {
    const consumerPrice = await updateAndReadPrice([ETH_USD], CONSUMER_ADDRESS, signer);
    console.log(`Consumer price: ${formatPythPrice(consumerPrice)}`);
  }
}

// Uncomment to run:
// main().catch(console.error);
