/**
 * Pyth Benchmarks Client — Fetch historical prices at any timestamp.
 *
 * The Pyth Benchmarks API provides historical price data for any Pyth feed
 * at any past timestamp. Useful for settlement, backtesting, auditing, and charts.
 *
 * Base URL: https://benchmarks.pyth.network
 * Docs: https://docs.pyth.network/benchmarks
 *
 * No API key required. No dependencies — uses native fetch.
 */

// ─── Configuration ──────────────────────────────────────

const BENCHMARKS_URL = process.env.BENCHMARKS_URL || "https://benchmarks.pyth.network";

// ─── Types ──────────────────────────────────────────────

export interface BenchmarkPrice {
  /** Feed ID */
  id: string;
  /** Price at the queried timestamp */
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  /** EMA price at the queried timestamp */
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

export interface ParsedBenchmarkPrice {
  feedId: string;
  price: number;
  confidence: number;
  expo: number;
  publishTime: Date;
  emaPrice: number;
  emaConfidence: number;
}

// ─── Core Functions ─────────────────────────────────────

/**
 * Get the price of a feed at a specific historical timestamp.
 *
 * @param feedId - The Pyth feed ID (with or without 0x prefix)
 * @param timestamp - Unix timestamp (seconds) to query
 * @returns The price update data at that timestamp
 *
 * @example
 * const price = await getHistoricalPrice(
 *   "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
 *   Math.floor(new Date("2024-01-15T12:00:00Z").getTime() / 1000)
 * );
 */
export async function getHistoricalPrice(
  feedId: string,
  timestamp: number
): Promise<BenchmarkPrice> {
  const cleanId = feedId.replace("0x", "");
  const url = `${BENCHMARKS_URL}/v1/shims/tradingview/history?symbol=${cleanId}&from=${timestamp}&to=${timestamp}&resolution=1`;

  // The benchmarks API also supports direct queries
  const directUrl = `${BENCHMARKS_URL}/v1/updates/price/${timestamp}?ids[]=${cleanId}&parsed=true`;
  const response = await fetch(directUrl);

  if (!response.ok) {
    throw new Error(`Benchmarks API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = data.parsed?.[0];
  if (!parsed) {
    throw new Error(`No price data found for feed ${feedId} at timestamp ${timestamp}`);
  }

  return parsed;
}

/**
 * Get historical prices for multiple feeds at the same timestamp.
 */
export async function getHistoricalPrices(
  feedIds: string[],
  timestamp: number
): Promise<BenchmarkPrice[]> {
  const params = feedIds
    .map((id) => `ids[]=${id.replace("0x", "")}`)
    .join("&");

  const url = `${BENCHMARKS_URL}/v1/updates/price/${timestamp}?${params}&parsed=true`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Benchmarks API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.parsed || [];
}

/**
 * Get the update data (binary) for a historical timestamp.
 * Useful for submitting historical prices on-chain (e.g., for settlement).
 */
export async function getHistoricalUpdateData(
  feedIds: string[],
  timestamp: number
): Promise<string[]> {
  const params = feedIds
    .map((id) => `ids[]=${id.replace("0x", "")}`)
    .join("&");

  const url = `${BENCHMARKS_URL}/v1/updates/price/${timestamp}?${params}&encoding=hex`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Benchmarks API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return (data.binary?.data || []).map((d: string) => "0x" + d);
}

// ─── Convenience: Parse to Human-Readable ───────────────

/**
 * Parse a BenchmarkPrice into a human-readable format.
 */
export function parseBenchmarkPrice(raw: BenchmarkPrice): ParsedBenchmarkPrice {
  const expo = raw.price.expo;
  const multiplier = 10 ** expo;

  return {
    feedId: "0x" + raw.id,
    price: Number(raw.price.price) * multiplier,
    confidence: Number(raw.price.conf) * multiplier,
    expo,
    publishTime: new Date(raw.price.publish_time * 1000),
    emaPrice: Number(raw.ema_price.price) * multiplier,
    emaConfidence: Number(raw.ema_price.conf) * multiplier,
  };
}

// ─── Time Series: Price History ─────────────────────────

/**
 * Fetch a price time series over a date range.
 * Samples at the given interval (in seconds).
 *
 * @example
 * const history = await getPriceTimeSeries(
 *   "0xff61491a...",
 *   Math.floor(Date.now()/1000) - 86400, // 24h ago
 *   Math.floor(Date.now()/1000),          // now
 *   3600                                   // 1 hour intervals
 * );
 */
export async function getPriceTimeSeries(
  feedId: string,
  fromTimestamp: number,
  toTimestamp: number,
  intervalSeconds: number = 3600
): Promise<ParsedBenchmarkPrice[]> {
  const results: ParsedBenchmarkPrice[] = [];

  for (let ts = fromTimestamp; ts <= toTimestamp; ts += intervalSeconds) {
    try {
      const raw = await getHistoricalPrice(feedId, ts);
      results.push(parseBenchmarkPrice(raw));
    } catch {
      // Skip timestamps with no data (e.g., market closed)
    }

    // Rate limit: small delay between requests
    await new Promise((r) => setTimeout(r, 100));
  }

  return results;
}

// ─── Settlement Helper ──────────────────────────────────

/**
 * Get the settlement price at a specific timestamp and return
 * both the parsed price and the binary update data for on-chain submission.
 *
 * @example
 * const settlement = await getSettlementData(
 *   "0xff61491a...",
 *   Math.floor(new Date("2024-06-30T16:00:00Z").getTime() / 1000)
 * );
 * // Submit settlement.updateData to your contract's settle() function
 */
export async function getSettlementData(
  feedId: string,
  settlementTimestamp: number
): Promise<{
  price: ParsedBenchmarkPrice;
  updateData: string[];
}> {
  const [rawPrice, updateData] = await Promise.all([
    getHistoricalPrice(feedId, settlementTimestamp),
    getHistoricalUpdateData([feedId], settlementTimestamp),
  ]);

  return {
    price: parseBenchmarkPrice(rawPrice),
    updateData,
  };
}

// ─── Usage Examples ─────────────────────────────────────

async function main() {
  const ETH_FEED = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

  // 1. Get price at a specific timestamp
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const historical = await getHistoricalPrice(ETH_FEED, oneHourAgo);
  const parsed = parseBenchmarkPrice(historical);
  console.log(`ETH/USD 1h ago: $${parsed.price.toFixed(2)}`);

  // 2. Get binary data for on-chain settlement
  const updateData = await getHistoricalUpdateData([ETH_FEED], oneHourAgo);
  console.log(`Update data for on-chain: ${updateData.length} items`);

  // 3. Settlement flow
  const settlement = await getSettlementData(ETH_FEED, oneHourAgo);
  console.log(`Settlement price: $${settlement.price.price.toFixed(2)}`);
  console.log(`Settlement data ready for on-chain submission`);
}

// Uncomment to run:
// main().catch(console.error);
