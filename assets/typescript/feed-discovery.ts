/**
 * Pyth Price Feed Discovery — Dynamically fetch all available feeds from Hermes.
 *
 * No hardcoded feed IDs needed! This module fetches all available price feeds
 * and their metadata directly from the Hermes API at runtime.
 *
 * Endpoint: https://hermes.pyth.network/v2/price_feeds
 * Docs: https://hermes.pyth.network/docs/#/rest/price_feeds_metadata
 *
 * Install: No extra deps needed — uses native fetch.
 * Optional: npm install @pythnetwork/hermes-client (for SDK method)
 */

// ─── Configuration ──────────────────────────────────────

const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";

// ─── Types ──────────────────────────────────────────────

export interface PythFeedInfo {
  /** The 32-byte hex feed ID (without 0x prefix from API, normalize as needed) */
  id: string;
  attributes: {
    /** Human-readable symbol, e.g. "Crypto.BTC/USD" */
    symbol: string;
    /** Asset type: crypto, equity, fx, metal, commodities, rates */
    asset_type: string;
    /** Base asset, e.g. "BTC" */
    base?: string;
    /** Quote asset, e.g. "USD" */
    quote_currency?: string;
    /** Description */
    description?: string;
    /** Pricing tier: "stable" or "beta" */
    weekly_schedule?: string;
    /** Country of origin (equities) */
    country?: string;
    /** CQS symbol (equities) */
    cqs_symbol?: string;
    /** NASDAQ symbol (equities) */
    nasdaq_symbol?: string;
    /** Generic symbol */
    generic_symbol?: string;
    [key: string]: string | undefined;
  };
}

export type AssetType = "crypto" | "equity" | "fx" | "metal" | "commodities" | "rates";

export interface FeedSearchOptions {
  /** Filter by asset type */
  assetType?: AssetType;
  /** Text query to filter by symbol/name */
  query?: string;
}

// ─── Core: Fetch All Feeds ──────────────────────────────

/**
 * Fetch ALL available Pyth price feeds from Hermes.
 * Returns the complete catalog (1000+ feeds) with metadata.
 *
 * @example
 * const allFeeds = await fetchAllFeeds();
 * console.log(`Total feeds: ${allFeeds.length}`);
 */
export async function fetchAllFeeds(): Promise<PythFeedInfo[]> {
  const response = await fetch(`${HERMES_URL}/v2/price_feeds`);
  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch feeds filtered by asset type.
 *
 * @example
 * const cryptoFeeds = await fetchFeedsByType("crypto");
 * const equityFeeds = await fetchFeedsByType("equity");
 * const fxFeeds = await fetchFeedsByType("fx");
 */
export async function fetchFeedsByType(assetType: AssetType): Promise<PythFeedInfo[]> {
  const response = await fetch(`${HERMES_URL}/v2/price_feeds?asset_type=${assetType}`);
  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Search feeds by query string (matches symbol, base, description).
 *
 * @example
 * const btcFeeds = await searchFeeds("BTC");
 * const appleFeeds = await searchFeeds("AAPL");
 */
export async function searchFeeds(query: string): Promise<PythFeedInfo[]> {
  const response = await fetch(
    `${HERMES_URL}/v2/price_feeds?query=${encodeURIComponent(query)}`
  );
  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Search feeds with combined filters.
 */
export async function findFeeds(options: FeedSearchOptions): Promise<PythFeedInfo[]> {
  const params = new URLSearchParams();
  if (options.assetType) params.set("asset_type", options.assetType);
  if (options.query) params.set("query", options.query);

  const response = await fetch(`${HERMES_URL}/v2/price_feeds?${params}`);
  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// ─── Convenience: Lookup by Symbol ──────────────────────

/**
 * Find the feed ID for a given symbol (e.g., "BTC/USD", "ETH/USD", "AAPL/USD").
 * Searches across all asset types.
 *
 * @returns The feed ID with 0x prefix, or null if not found
 *
 * @example
 * const ethFeedId = await getFeedIdBySymbol("ETH/USD");
 * // "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
 */
export async function getFeedIdBySymbol(symbol: string): Promise<string | null> {
  const query = symbol.replace("/", "");
  const feeds = await searchFeeds(query);

  // Try exact match first (case-insensitive)
  const normalizedSymbol = symbol.toUpperCase();
  const exactMatch = feeds.find((f) => {
    const feedSymbol = f.attributes.symbol?.toUpperCase() || "";
    // Match "Crypto.BTC/USD" or just "BTC/USD"
    return feedSymbol === normalizedSymbol || feedSymbol.endsWith(`.${normalizedSymbol}`);
  });

  if (exactMatch) return "0x" + exactMatch.id;

  // Fallback: partial match
  const partialMatch = feeds.find((f) => {
    const feedSymbol = f.attributes.symbol?.toUpperCase() || "";
    return feedSymbol.includes(normalizedSymbol);
  });

  return partialMatch ? "0x" + partialMatch.id : null;
}

/**
 * Resolve multiple symbols to feed IDs in a single batch.
 *
 * @example
 * const ids = await resolveFeedIds(["BTC/USD", "ETH/USD", "SOL/USD"]);
 * // { "BTC/USD": "0xe62d...", "ETH/USD": "0xff61...", "SOL/USD": "0xef0d..." }
 */
export async function resolveFeedIds(
  symbols: string[]
): Promise<Record<string, string | null>> {
  // Fetch all feeds once to avoid multiple API calls
  const allFeeds = await fetchAllFeeds();

  const result: Record<string, string | null> = {};

  for (const symbol of symbols) {
    const normalizedSymbol = symbol.toUpperCase();
    const match = allFeeds.find((f) => {
      const feedSymbol = f.attributes.symbol?.toUpperCase() || "";
      return feedSymbol === normalizedSymbol || feedSymbol.endsWith(`.${normalizedSymbol}`);
    });

    result[symbol] = match ? "0x" + match.id : null;
  }

  return result;
}

// ─── Catalog: Build Feed Registry ───────────────────────

/**
 * Build a complete feed registry organized by asset type.
 * Useful for populating dropdowns, search UIs, or config files.
 *
 * @example
 * const registry = await buildFeedRegistry();
 * console.log(registry.crypto.length); // ~500+ crypto feeds
 * console.log(registry.equity.length); // ~100+ equity feeds
 */
export async function buildFeedRegistry(): Promise<
  Record<AssetType | "other", Array<{ id: string; symbol: string; base?: string; quote?: string }>>
> {
  const allFeeds = await fetchAllFeeds();

  const registry: Record<string, Array<{ id: string; symbol: string; base?: string; quote?: string }>> = {
    crypto: [],
    equity: [],
    fx: [],
    metal: [],
    commodities: [],
    rates: [],
    other: [],
  };

  for (const feed of allFeeds) {
    const type = feed.attributes.asset_type || "other";
    const bucket = registry[type] || registry.other;

    bucket.push({
      id: "0x" + feed.id,
      symbol: feed.attributes.symbol || feed.id,
      base: feed.attributes.base,
      quote: feed.attributes.quote_currency,
    });
  }

  return registry as any;
}

/**
 * Export the feed registry as a JSON file (for build-time caching).
 */
export async function exportFeedRegistryJson(): Promise<string> {
  const registry = await buildFeedRegistry();
  return JSON.stringify(registry, null, 2);
}

// ─── Cache Layer ────────────────────────────────────────

let cachedFeeds: PythFeedInfo[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all feeds with a simple in-memory cache.
 * Avoids hitting the API on every call.
 */
export async function fetchAllFeedsCached(): Promise<PythFeedInfo[]> {
  const now = Date.now();
  if (cachedFeeds && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFeeds;
  }

  cachedFeeds = await fetchAllFeeds();
  cacheTimestamp = now;
  return cachedFeeds;
}

/**
 * Resolve a symbol using the cached feed list.
 */
export async function getFeedIdCached(symbol: string): Promise<string | null> {
  const feeds = await fetchAllFeedsCached();
  const normalizedSymbol = symbol.toUpperCase();

  const match = feeds.find((f) => {
    const feedSymbol = f.attributes.symbol?.toUpperCase() || "";
    return feedSymbol === normalizedSymbol || feedSymbol.endsWith(`.${normalizedSymbol}`);
  });

  return match ? "0x" + match.id : null;
}

// ─── Usage Examples ─────────────────────────────────────

async function main() {
  // 1. Fetch ALL feeds
  console.log("Fetching all Pyth price feeds...");
  const allFeeds = await fetchAllFeeds();
  console.log(`Total feeds available: ${allFeeds.length}`);

  // 2. Filter by asset type
  const cryptoFeeds = await fetchFeedsByType("crypto");
  console.log(`Crypto feeds: ${cryptoFeeds.length}`);

  const equityFeeds = await fetchFeedsByType("equity");
  console.log(`Equity feeds: ${equityFeeds.length}`);

  const fxFeeds = await fetchFeedsByType("fx");
  console.log(`FX feeds: ${fxFeeds.length}`);

  // 3. Search for specific feeds
  const btcFeeds = await searchFeeds("BTC");
  console.log(`\nBTC-related feeds: ${btcFeeds.length}`);
  btcFeeds.slice(0, 5).forEach((f) => {
    console.log(`  ${f.attributes.symbol} → 0x${f.id.slice(0, 16)}...`);
  });

  // 4. Resolve symbol to feed ID
  const ethFeedId = await getFeedIdBySymbol("ETH/USD");
  console.log(`\nETH/USD feed ID: ${ethFeedId}`);

  // 5. Batch resolve
  const feedIds = await resolveFeedIds(["BTC/USD", "ETH/USD", "SOL/USD", "AAPL/USD"]);
  console.log("\nResolved feed IDs:");
  for (const [symbol, id] of Object.entries(feedIds)) {
    console.log(`  ${symbol}: ${id ? id.slice(0, 20) + "..." : "NOT FOUND"}`);
  }

  // 6. Build complete registry
  const registry = await buildFeedRegistry();
  for (const [type, feeds] of Object.entries(registry)) {
    if (feeds.length > 0) {
      console.log(`  ${type}: ${feeds.length} feeds`);
    }
  }
}

// Uncomment to run:
// main().catch(console.error);
