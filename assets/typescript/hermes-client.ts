/**
 * Pyth Hermes Client — Fetch and stream price updates from the Hermes API.
 *
 * Install: npm install @pythnetwork/hermes-client
 *
 * This template shows three methods:
 *   1. REST — fetch latest prices on demand
 *   2. SSE  — stream real-time price updates
 *   3. SDK  — use the official HermesClient class
 *
 * Adapt to your project's patterns and error handling.
 */

import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";

// Common feed IDs (find more at https://docs.pyth.network/price-feeds/price-feeds)
export const FEED_IDS = {
  "BTC/USD": "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USD": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "SOL/USD": "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "USDC/USD": "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
} as const;

// ─── Types ──────────────────────────────────────────────

export interface PythPrice {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
  ema_price: { price: string; conf: string; expo: number; publish_time: number };
}

export interface PriceUpdateResponse {
  binary: { encoding: string; data: string[] };
  parsed: PythPrice[];
}

// ─── Method 1: REST API (fetch) ─────────────────────────

/**
 * Fetch the latest price updates for one or more feed IDs.
 * Returns both the binary data (for on-chain submission) and parsed prices.
 */
export async function fetchLatestPrices(feedIds: string[]): Promise<PriceUpdateResponse> {
  const params = new URLSearchParams();
  feedIds.forEach((id) => params.append("ids[]", id.replace("0x", "")));
  params.set("encoding", "hex");
  params.set("parsed", "true");

  const response = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params}`);
  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get the binary update data ready for on-chain submission.
 * Returns an array of hex-encoded strings with 0x prefix.
 */
export async function getUpdateData(feedIds: string[]): Promise<string[]> {
  const result = await fetchLatestPrices(feedIds);
  return result.binary.data.map((d) => "0x" + d);
}

/**
 * Fetch and parse a single price as a human-readable number.
 */
export async function getPrice(feedId: string): Promise<{ value: number; confidence: number; timestamp: number }> {
  const result = await fetchLatestPrices([feedId]);
  if (result.parsed.length === 0) throw new Error("No price data returned");

  const p = result.parsed[0].price;
  const value = Number(p.price) * 10 ** p.expo;
  const confidence = Number(p.conf) * 10 ** p.expo;

  return { value, confidence, timestamp: p.publish_time };
}

// ─── Method 2: SSE Streaming ────────────────────────────

/**
 * Stream real-time price updates via Server-Sent Events.
 * Connection auto-closes after 24 hours — implement reconnection logic.
 */
export function streamPrices(
  feedIds: string[],
  onPrice: (prices: PythPrice[]) => void,
  onError?: (error: Event) => void
): EventSource {
  const params = new URLSearchParams();
  feedIds.forEach((id) => params.append("ids[]", id.replace("0x", "")));
  params.set("encoding", "hex");
  params.set("parsed", "true");

  const eventSource = new EventSource(`${HERMES_URL}/v2/updates/price/stream?${params}`);

  eventSource.onmessage = (event) => {
    try {
      const data: PriceUpdateResponse = JSON.parse(event.data);
      onPrice(data.parsed);
    } catch (err) {
      console.error("Failed to parse SSE data:", err);
    }
  };

  eventSource.onerror = (error) => {
    if (onError) onError(error);
    else console.error("SSE connection error:", error);
  };

  return eventSource;
}

/**
 * Stream prices with automatic reconnection.
 */
export function streamPricesWithReconnect(
  feedIds: string[],
  onPrice: (prices: PythPrice[]) => void,
  reconnectDelayMs = 3000
): { stop: () => void } {
  let eventSource: EventSource | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;

    eventSource = streamPrices(feedIds, onPrice, () => {
      if (!stopped) {
        console.log(`SSE disconnected. Reconnecting in ${reconnectDelayMs}ms...`);
        setTimeout(connect, reconnectDelayMs);
      }
    });
  }

  connect();

  return {
    stop: () => {
      stopped = true;
      eventSource?.close();
    },
  };
}

// ─── Method 3: HermesClient SDK ─────────────────────────

/**
 * Use the official Pyth HermesClient SDK for a more structured API.
 */
export async function fetchWithSdk(feedIds: string[]) {
  const client = new HermesClient(HERMES_URL);

  // Fetch latest price updates
  const updates = await client.getLatestPriceUpdates(feedIds);

  // Binary data for on-chain submission
  const updateData = updates.binary.data.map((d: string) => "0x" + d);

  // Parsed prices for display
  const parsed = updates.parsed;

  return { updateData, parsed };
}

/**
 * Search for price feeds by name.
 */
export async function searchFeeds(query: string, assetType?: string) {
  const client = new HermesClient(HERMES_URL);
  const feeds = await client.getPriceFeeds(query, assetType);
  return feeds;
}

/**
 * Stream prices using the SDK's SSE support.
 */
export async function streamWithSdk(
  feedIds: string[],
  onPrice: (data: any) => void
): Promise<EventSource> {
  const client = new HermesClient(HERMES_URL);
  const eventSource = await client.getStreamingPriceUpdates(feedIds);

  eventSource.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data);
    onPrice(data);
  };

  return eventSource;
}

// ─── Method 4: Dynamic Feed Discovery ───────────────────

/**
 * Fetch ALL available Pyth price feeds and their metadata from Hermes.
 * No hardcoding needed — discover feed IDs at runtime.
 *
 * Endpoint: https://hermes.pyth.network/v2/price_feeds
 */
export async function discoverAllFeeds(assetType?: string): Promise<Array<{ id: string; symbol: string; assetType: string }>> {
  const params = new URLSearchParams();
  if (assetType) params.set("asset_type", assetType);

  const url = `${HERMES_URL}/v2/price_feeds${params.toString() ? "?" + params : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hermes API error: ${response.status}`);

  const feeds = await response.json();
  return feeds.map((f: any) => ({
    id: "0x" + f.id,
    symbol: f.attributes?.symbol || f.id,
    assetType: f.attributes?.asset_type || "unknown",
  }));
}

/**
 * Resolve a human-readable symbol (e.g., "ETH/USD") to its Pyth feed ID dynamically.
 */
export async function resolveFeedId(symbol: string): Promise<string | null> {
  const query = symbol.replace("/", "");
  const params = new URLSearchParams({ query });
  const response = await fetch(`${HERMES_URL}/v2/price_feeds?${params}`);
  if (!response.ok) return null;

  const feeds = await response.json();
  const normalized = symbol.toUpperCase();
  const match = feeds.find((f: any) => {
    const s = (f.attributes?.symbol || "").toUpperCase();
    return s === normalized || s.endsWith(`.${normalized}`);
  });

  return match ? "0x" + match.id : null;
}

// ─── Usage Examples ─────────────────────────────────────

async function main() {
  // 1. Fetch single price
  const ethPrice = await getPrice(FEED_IDS["ETH/USD"]);
  console.log(`ETH/USD: $${ethPrice.value.toFixed(2)} ±$${ethPrice.confidence.toFixed(2)}`);

  // 2. Fetch multiple prices for on-chain submission
  const updateData = await getUpdateData([FEED_IDS["BTC/USD"], FEED_IDS["ETH/USD"]]);
  console.log(`Update data (${updateData.length} items) ready for on-chain submission`);

  // 3. Stream real-time prices
  const stream = streamPricesWithReconnect(
    [FEED_IDS["ETH/USD"]],
    (prices) => {
      for (const p of prices) {
        const value = Number(p.price.price) * 10 ** p.price.expo;
        console.log(`[STREAM] ETH/USD: $${value.toFixed(2)}`);
      }
    }
  );

  // Stop after 30 seconds
  setTimeout(() => {
    stream.stop();
    console.log("Stream stopped");
  }, 30000);
}

// Uncomment to run:
// main().catch(console.error);
