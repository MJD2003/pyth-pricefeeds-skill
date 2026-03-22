/**
 * Pyth Price Feeds — End-to-End Integration Example
 *
 * Complete flow demonstrating:
 *   1. Discover feed IDs dynamically
 *   2. Fetch prices from Hermes
 *   3. Submit price updates on-chain
 *   4. Read prices from your contract
 *   5. Display formatted prices
 *
 * Install: npm install ethers @pythnetwork/hermes-client
 */

import { ethers } from "ethers";
import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://sepolia.optimism.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const PYTH_ADDRESS = process.env.PYTH_ADDRESS || "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C";
const CONSUMER_ADDRESS = process.env.CONSUMER_ADDRESS || ""; // Your deployed contract
const HERMES_URL = "https://hermes.pyth.network";

// ─── Minimal ABIs ───────────────────────────────────────

const PYTH_ABI = [
  "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function updatePriceFeeds(bytes[] calldata updateData) external payable",
  "function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))",
];

// Example consumer ABI — adapt to YOUR contract
const CONSUMER_ABI = [
  "function updateAndGetPrice(bytes[] calldata priceUpdate) external payable returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))",
];

// ─── Step 1: Discover Feed IDs ──────────────────────────

async function discoverFeedId(symbol: string): Promise<string> {
  console.log(`[1/5] Discovering feed ID for ${symbol}...`);

  const query = symbol.replace("/", "");
  const response = await fetch(
    `${HERMES_URL}/v2/price_feeds?query=${encodeURIComponent(query)}`
  );
  const feeds = await response.json();

  const normalized = symbol.toUpperCase();
  const match = feeds.find((f: any) => {
    const s = (f.attributes?.symbol || "").toUpperCase();
    return s === normalized || s.endsWith(`.${normalized}`);
  });

  if (!match) throw new Error(`Feed not found for ${symbol}`);

  const feedId = "0x" + match.id;
  console.log(`  Found: ${match.attributes.symbol} → ${feedId.slice(0, 20)}...`);
  return feedId;
}

// ─── Step 2: Fetch Prices from Hermes ───────────────────

async function fetchPriceUpdate(feedIds: string[]) {
  console.log(`[2/5] Fetching price updates from Hermes...`);

  const hermes = new HermesClient(HERMES_URL);
  const updates = await hermes.getLatestPriceUpdates(feedIds);

  // Binary data for on-chain submission
  const updateData = updates.binary.data.map((d: string) => "0x" + d);

  // Parsed prices for display
  const parsed = updates.parsed || [];
  for (const p of parsed) {
    const value = Number(p.price.price) * 10 ** p.price.expo;
    const conf = Number(p.price.conf) * 10 ** p.price.expo;
    console.log(`  ${p.id.slice(0, 16)}... → $${value.toFixed(2)} ±$${conf.toFixed(2)}`);
  }

  return { updateData, parsed };
}

// ─── Step 3: Submit Price Update On-Chain ────────────────

async function submitPriceUpdate(
  wallet: ethers.Wallet,
  updateData: string[]
) {
  console.log(`[3/5] Submitting price update on-chain...`);

  const pythContract = new ethers.Contract(PYTH_ADDRESS, PYTH_ABI, wallet);

  // Calculate fee (NEVER hardcode!)
  const fee = await pythContract.getUpdateFee(updateData);
  console.log(`  Update fee: ${ethers.formatEther(fee)} ETH`);

  // Submit the update
  const tx = await pythContract.updatePriceFeeds(updateData, { value: fee });
  const receipt = await tx.wait();
  console.log(`  Tx confirmed: ${tx.hash} (gas: ${receipt?.gasUsed})`);

  return tx.hash;
}

// ─── Step 4: Read Price from Contract ───────────────────

async function readPriceOnChain(
  provider: ethers.Provider,
  feedId: string,
  maxAge: number = 60
) {
  console.log(`[4/5] Reading price on-chain...`);

  const pythContract = new ethers.Contract(PYTH_ADDRESS, PYTH_ABI, provider);
  const price = await pythContract.getPriceNoOlderThan(feedId, maxAge);

  const value = Number(price.price) * 10 ** Number(price.expo);
  const conf = Number(price.conf) * 10 ** Number(price.expo);
  const publishTime = new Date(Number(price.publishTime) * 1000);

  console.log(`  On-chain price: $${value.toFixed(2)} ±$${conf.toFixed(2)}`);
  console.log(`  Published: ${publishTime.toISOString()}`);

  return { value, conf, publishTime };
}

// ─── Step 5: Display Formatted ──────────────────────────

function displayPrice(symbol: string, price: { value: number; conf: number; publishTime: Date }) {
  console.log(`\n[5/5] Final Result:`);
  console.log(`  ┌─────────────────────────────┐`);
  console.log(`  │ ${symbol.padEnd(27)} │`);
  console.log(`  │ Price: $${price.value.toFixed(2).padStart(18)} │`);
  console.log(`  │ Conf:  ±$${price.conf.toFixed(2).padStart(17)} │`);
  console.log(`  │ Time:  ${price.publishTime.toISOString().slice(11, 19).padStart(18)} │`);
  console.log(`  └─────────────────────────────┘`);
}

// ─── Main: Full E2E Flow ────────────────────────────────

async function main() {
  const SYMBOL = "ETH/USD";

  console.log("\n═══ Pyth Price Feeds — End-to-End Example ═══\n");

  // Step 1: Discover feed ID
  const feedId = await discoverFeedId(SYMBOL);

  // Step 2: Fetch from Hermes
  const { updateData } = await fetchPriceUpdate([feedId]);

  // Step 3: Submit on-chain (requires wallet)
  if (PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const balance = await provider.getBalance(wallet.address);
    console.log(`  Wallet: ${wallet.address} (${ethers.formatEther(balance)} ETH)`);

    await submitPriceUpdate(wallet, updateData);

    // Step 4: Read back from chain
    const price = await readPriceOnChain(provider, feedId);

    // Step 5: Display
    displayPrice(SYMBOL, price);
  } else {
    console.log("\n[3-5] Skipping on-chain steps (no PRIVATE_KEY set)");
    console.log("  Set PRIVATE_KEY to run the full E2E flow.");
    console.log("  The off-chain steps (1-2) work without a wallet.");
  }

  console.log("\n═══ Done ═══\n");
}

main().catch(console.error);
