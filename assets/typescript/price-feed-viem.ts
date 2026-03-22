/**
 * Pyth Price Feeds — viem on-chain client.
 *
 * Install: npm install viem @pythnetwork/hermes-client
 *
 * This template shows how to:
 *   1. Fetch price updates from Hermes
 *   2. Submit them on-chain via viem
 *   3. Read the updated price
 *
 * Adapt to your project's patterns.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { optimismSepolia } from "viem/chains";
import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://sepolia.optimism.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex || "0x";
const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";
const PYTH_ADDRESS = process.env.PYTH_ADDRESS as Address || "0x";

// ─── ABI ────────────────────────────────────────────────

const pythAbi = parseAbi([
  "function getUpdateFee(bytes[] calldata updateData) view returns (uint256)",
  "function updatePriceFeeds(bytes[] calldata updateData) payable",
  "function getPriceNoOlderThan(bytes32 id, uint256 age) view returns ((int64 price, uint64 conf, int32 expo, uint256 publishTime))",
  "function getPriceUnsafe(bytes32 id) view returns ((int64 price, uint64 conf, int32 expo, uint256 publishTime))",
  "function getEmaPriceNoOlderThan(bytes32 id, uint256 age) view returns ((int64 price, uint64 conf, int32 expo, uint256 publishTime))",
]);

// ─── Types ──────────────────────────────────────────────

interface PythPrice {
  price: bigint;
  conf: bigint;
  expo: number;
  publishTime: bigint;
}

// ─── Core Functions ─────────────────────────────────────

/**
 * Fetch the latest price update data from Hermes.
 */
export async function fetchPriceUpdateData(feedIds: string[]): Promise<Hex[]> {
  const hermes = new HermesClient(HERMES_URL);
  const updates = await hermes.getLatestPriceUpdates(feedIds);
  return updates.binary.data.map((d: string) => `0x${d}` as Hex);
}

/**
 * Update prices on-chain via the Pyth contract.
 */
export async function updatePricesOnChain(
  feedIds: string[],
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<Hex> {
  const updateData = await fetchPriceUpdateData(feedIds);

  // Get the required fee
  const fee = await publicClient.readContract({
    address: PYTH_ADDRESS,
    abi: pythAbi,
    functionName: "getUpdateFee",
    args: [updateData],
  });

  // Submit the update
  const hash = await walletClient.writeContract({
    address: PYTH_ADDRESS,
    abi: pythAbi,
    functionName: "updatePriceFeeds",
    args: [updateData],
    value: fee as bigint,
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Read the current on-chain price for a feed.
 */
export async function readPrice(
  feedId: Hex,
  maxAge: bigint,
  publicClient: PublicClient
): Promise<PythPrice> {
  const result = await publicClient.readContract({
    address: PYTH_ADDRESS,
    abi: pythAbi,
    functionName: "getPriceNoOlderThan",
    args: [feedId, maxAge],
  });

  return result as unknown as PythPrice;
}

/**
 * Read the unsafe (potentially stale) on-chain price.
 */
export async function readPriceUnsafe(
  feedId: Hex,
  publicClient: PublicClient
): Promise<PythPrice> {
  const result = await publicClient.readContract({
    address: PYTH_ADDRESS,
    abi: pythAbi,
    functionName: "getPriceUnsafe",
    args: [feedId],
  });

  return result as unknown as PythPrice;
}

/**
 * Convert a Pyth price to a human-readable number.
 */
export function formatPrice(price: PythPrice): { value: number; confidence: number } {
  return {
    value: Number(price.price) * 10 ** price.expo,
    confidence: Number(price.conf) * 10 ** price.expo,
  };
}

// ─── Usage Example ──────────────────────────────────────

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: optimismSepolia,
    transport: http(RPC_URL),
  });

  const ETH_USD: Hex = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  // Update price on-chain
  console.log("Updating ETH/USD price on-chain...");
  const txHash = await updatePricesOnChain([ETH_USD], publicClient, walletClient);
  console.log(`Update tx: ${txHash}`);

  // Read the price
  const price = await readPrice(ETH_USD, 60n, publicClient);
  const formatted = formatPrice(price);
  console.log(`ETH/USD: $${formatted.value.toFixed(2)} ±$${formatted.confidence.toFixed(4)}`);
}

// Uncomment to run:
// main().catch(console.error);
