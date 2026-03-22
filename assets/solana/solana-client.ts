/**
 * Pyth Price Feeds — Solana frontend client.
 *
 * Install:
 *   npm install @pythnetwork/hermes-client @pythnetwork/pyth-solana-receiver @solana/web3.js
 *
 * This template shows how to:
 *   1. Fetch price updates from Hermes (base64 encoding for Solana)
 *   2. Create Solana instructions to post price updates
 *   3. Combine with your program's instructions in a single transaction
 *
 * Adapt to your project's patterns.
 */

import { HermesClient } from "@pythnetwork/hermes-client";
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";

// ─── Configuration ──────────────────────────────────────

const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

// Pyth Pull Oracle program on Solana mainnet
const PYTH_RECEIVER_PROGRAM = new PublicKey("pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT");

// ─── Types ──────────────────────────────────────────────

export interface SolanaPriceUpdate {
  feedId: string;
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
  updateData: string[]; // base64-encoded for Solana
}

// ─── Core Functions ─────────────────────────────────────

/**
 * Fetch the latest price updates from Hermes in base64 encoding (for Solana).
 */
export async function fetchPriceUpdatesForSolana(
  feedIds: string[]
): Promise<{ updateData: string[]; parsed: any[] }> {
  const hermes = new HermesClient(HERMES_URL);
  const updates = await hermes.getLatestPriceUpdates(feedIds, {
    encoding: "base64",
  });

  return {
    updateData: updates.binary.data,
    parsed: updates.parsed || [],
  };
}

/**
 * Fetch price updates and return parsed price data.
 */
export async function fetchParsedPrices(
  feedIds: string[]
): Promise<SolanaPriceUpdate[]> {
  const hermes = new HermesClient(HERMES_URL);
  const updates = await hermes.getLatestPriceUpdates(feedIds, {
    encoding: "base64",
  });

  return (updates.parsed || []).map((p: any) => ({
    feedId: p.id,
    price: Number(p.price.price) * 10 ** p.price.expo,
    confidence: Number(p.price.conf) * 10 ** p.price.expo,
    expo: p.price.expo,
    publishTime: p.price.publish_time,
    updateData: updates.binary.data,
  }));
}

/**
 * Create price update instructions for Solana using @pythnetwork/pyth-solana-receiver.
 *
 * Note: This requires the @pythnetwork/pyth-solana-receiver package.
 * If not available, you can post updates manually using the Pyth receiver program.
 */
export async function createPriceUpdateInstructions(
  connection: Connection,
  payer: PublicKey,
  feedIds: string[]
): Promise<{ instructions: any[]; priceUpdateAccount: PublicKey }> {
  // Fetch update data in base64 for Solana
  const { updateData } = await fetchPriceUpdatesForSolana(feedIds);

  // The @pythnetwork/pyth-solana-receiver package provides helper functions
  // to create the instructions. Import and use it in your actual code:
  //
  // import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
  // const pythReceiver = new PythSolanaReceiver({ connection, wallet });
  // const { instructions, priceUpdateAccount } = await pythReceiver.postPriceUpdateInstructions(updateData);

  // For now, return a placeholder — adapt to your actual integration
  console.log(`Fetched ${updateData.length} price updates for ${feedIds.length} feeds`);

  return {
    instructions: [], // Replace with actual instructions from pyth-solana-receiver
    priceUpdateAccount: PublicKey.default,
  };
}

/**
 * Stream real-time Solana prices via Hermes SSE.
 */
export function streamSolanaPrices(
  feedIds: string[],
  onPrice: (prices: SolanaPriceUpdate[]) => void
): { stop: () => void } {
  const cleanIds = feedIds.map((id) => id.replace("0x", ""));
  const params = cleanIds.map((id) => `ids[]=${id}`).join("&");
  const url = `${HERMES_URL}/v2/updates/price/stream?${params}&encoding=base64&parsed=true`;

  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const prices: SolanaPriceUpdate[] = (data.parsed || []).map((p: any) => ({
        feedId: p.id,
        price: Number(p.price.price) * 10 ** p.price.expo,
        confidence: Number(p.price.conf) * 10 ** p.price.expo,
        expo: p.price.expo,
        publishTime: p.price.publish_time,
        updateData: data.binary?.data || [],
      }));
      onPrice(prices);
    } catch {
      // Ignore parse errors
    }
  };

  return {
    stop: () => es.close(),
  };
}

// ─── Price Feed Account Integration ─────────────────────

/**
 * For apps that always want the most recent price, use price feed accounts
 * instead of price update accounts. These have fixed addresses maintained
 * by the Pyth Data Association.
 *
 * Find price feed account addresses at:
 * https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/solana
 */

// Common Solana price feed accounts (mainnet)
export const SOLANA_PRICE_FEED_ACCOUNTS = {
  "SOL/USD": new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"),
  "BTC/USD": new PublicKey("4cSM2e6rvbGQUFiJbqytoVMi5GgghSMr8LwVrT9VPSPo"),
  "ETH/USD": new PublicKey("42amVS4KgzR9rA28tkVYqVXjq9Qa8dcZQMbH5EYFX6XC"),
} as const;

// ─── Usage Example ──────────────────────────────────────

async function main() {
  const SOL_USD = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
  const ETH_USD = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  // Fetch parsed prices
  const prices = await fetchParsedPrices([SOL_USD, ETH_USD]);
  for (const p of prices) {
    console.log(`${p.feedId.slice(0, 10)}...: $${p.price.toFixed(2)} ±$${p.confidence.toFixed(4)}`);
  }

  // Stream real-time
  const stream = streamSolanaPrices([SOL_USD], (updates) => {
    for (const u of updates) {
      console.log(`[STREAM] SOL/USD: $${u.price.toFixed(2)}`);
    }
  });

  setTimeout(() => stream.stop(), 10000);
}

// Uncomment to run:
// main().catch(console.error);
