#!/usr/bin/env node

/**
 * Pyth Feed ID Lookup — Standalone CLI tool
 *
 * Usage:
 *   node fetch-feed-ids.js                    # List summary of all feeds
 *   node fetch-feed-ids.js --type crypto      # List all crypto feeds
 *   node fetch-feed-ids.js --search ETH       # Search for ETH feeds
 *   node fetch-feed-ids.js --search AAPL --type equity  # Search equities
 *   node fetch-feed-ids.js --resolve ETH/USD  # Resolve symbol to feed ID
 *   node fetch-feed-ids.js --json             # Output as JSON
 */

const HERMES_URL = process.env.HERMES_URL || "https://hermes.pyth.network";

async function fetchFeeds(assetType, query) {
  const params = new URLSearchParams();
  if (assetType) params.set("asset_type", assetType);
  if (query) params.set("query", query);

  const url = `${HERMES_URL}/v2/price_feeds${params.toString() ? "?" + params : ""}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function formatFeed(feed) {
  const symbol = feed.attributes?.symbol || "Unknown";
  const type = feed.attributes?.asset_type || "unknown";
  const base = feed.attributes?.base || "";
  const quote = feed.attributes?.quote_currency || "";

  return {
    id: "0x" + feed.id,
    symbol,
    type,
    base,
    quote,
  };
}

async function main() {
  const args = process.argv.slice(2);

  let assetType = null;
  let query = null;
  let resolveSymbol = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) assetType = args[++i];
    else if (args[i] === "--search" && args[i + 1]) query = args[++i];
    else if (args[i] === "--resolve" && args[i + 1]) resolveSymbol = args[++i];
    else if (args[i] === "--json") jsonOutput = true;
    else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
  Pyth Feed ID Lookup

  Usage:
    node fetch-feed-ids.js                      List feed summary
    node fetch-feed-ids.js --type crypto        List crypto feeds
    node fetch-feed-ids.js --search ETH         Search by name
    node fetch-feed-ids.js --resolve ETH/USD    Get exact feed ID
    node fetch-feed-ids.js --json               Output as JSON

  Asset types: crypto, equity, fx, metal, commodities, rates
`);
      process.exit(0);
    }
  }

  // Resolve mode
  if (resolveSymbol) {
    const q = resolveSymbol.replace("/", "");
    const feeds = await fetchFeeds(assetType, q);
    const normalized = resolveSymbol.toUpperCase();

    const match = feeds.find((f) => {
      const s = (f.attributes?.symbol || "").toUpperCase();
      return s === normalized || s.endsWith(`.${normalized}`);
    });

    if (match) {
      if (jsonOutput) {
        console.log(JSON.stringify(formatFeed(match), null, 2));
      } else {
        console.log(`\n  ${resolveSymbol} → 0x${match.id}`);
        console.log(`  Symbol: ${match.attributes?.symbol}`);
        console.log(`  Type: ${match.attributes?.asset_type}\n`);
      }
    } else {
      console.error(`  Feed not found for: ${resolveSymbol}`);
      process.exit(1);
    }
    return;
  }

  // List/search mode
  const feeds = await fetchFeeds(assetType, query);

  if (jsonOutput) {
    console.log(JSON.stringify(feeds.map(formatFeed), null, 2));
    return;
  }

  // Summary mode (no query)
  if (!query && !assetType) {
    const types = {};
    for (const f of feeds) {
      const t = f.attributes?.asset_type || "other";
      types[t] = (types[t] || 0) + 1;
    }

    console.log(`\n  Pyth Price Feeds — ${feeds.length} total\n`);
    for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(15)} ${count} feeds`);
    }
    console.log(`\n  Use --type <type> or --search <query> to filter.\n`);
    return;
  }

  // Filtered listing
  console.log(`\n  Found ${feeds.length} feeds${assetType ? ` (type: ${assetType})` : ""}${query ? ` matching "${query}"` : ""}\n`);

  const maxDisplay = 50;
  const display = feeds.slice(0, maxDisplay);

  for (const feed of display) {
    const f = formatFeed(feed);
    console.log(`  ${f.symbol.padEnd(30)} ${f.id.slice(0, 20)}...  [${f.type}]`);
  }

  if (feeds.length > maxDisplay) {
    console.log(`\n  ... and ${feeds.length - maxDisplay} more. Use --json for full list.`);
  }

  console.log("");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
