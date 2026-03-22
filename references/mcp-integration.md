# Pyth MCP Server Integration

## Overview

The **Pyth MCP (Model Context Protocol) server** gives AI assistants direct, structured access to Pyth market data. It provides tools for discovering feeds, fetching real-time and historical prices, and generating candlestick data — all within a conversation.

**MCP Endpoint:** `https://mcp.pyth.network/mcp`
**Transport:** Streamable HTTP
**Auth:** No key required at the endpoint level (except `get_latest_price` which needs a Pyth Pro token)

**Docs:** https://docs.pyth.network/price-feeds/pro/mcp

## When to Use the Pyth MCP

The skill should **check if the user has the Pyth MCP server configured** and leverage it when available:

### Detect MCP Availability

1. **Windsurf** — Check if an MCP server named `pyth` is configured in the workspace
2. **Claude Code** — Check `claude mcp list` or `claude_desktop_config.json` for `pyth` entry
3. **Cursor** — Check Settings → Tools & MCP for a `pyth` server
4. **Any client** — Check if MCP tools `get_symbols`, `get_latest_price` are available

### If MCP IS Available

Use the Pyth MCP tools for **data queries** during development:
- `get_symbols` — Discover feeds by name/type (replaces manual feed ID lookup)
- `get_latest_price` — Fetch real-time prices (requires Pyth Pro token)
- `get_historical_price` — Get prices at a specific timestamp
- `get_candlestick_data` — Fetch OHLC chart data

**Recommended MCP workflow:**
```
get_symbols → find the feed → get_latest_price → verify data → write code
```

### If MCP IS NOT Available

Fall back to the standard approach:
- Use `references/feed-ids.md` for hardcoded feed IDs
- Use `assets/typescript/feed-discovery.ts` for dynamic feed discovery via Hermes API
- Use `assets/typescript/hermes-client.ts` for fetching prices

### Always Needed Regardless of MCP

The MCP server is for **AI-assisted data exploration**. The actual on-chain integration code is always needed:
- Solidity contracts still need `IPyth`, `updatePriceFeeds`, `getPriceNoOlderThan`
- Frontend still needs Hermes client for fetching update data
- Feed IDs still need to be embedded in contracts or passed as parameters

## Setup Instructions

### Claude Desktop

Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pyth": {
      "url": "https://mcp.pyth.network/mcp"
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add pyth --transport http https://mcp.pyth.network/mcp
```

Verify: `claude mcp list`

### Cursor

Settings → Tools & MCP → Add Custom MCP:

```json
{
  "mcpServers": {
    "pyth": {
      "url": "https://mcp.pyth.network/mcp"
    }
  }
}
```

### Windsurf

Add to `.windsurf/mcp_config.json` or workspace MCP settings:

```json
{
  "mcpServers": {
    "pyth": {
      "serverUrl": "https://mcp.pyth.network/mcp"
    }
  }
}
```

### Any MCP-Compatible Client

Any client that supports Streamable HTTP transport can connect to:
`https://mcp.pyth.network/mcp`

## MCP Tool Reference

### get_symbols

Search and list available Pyth feeds. **No token required.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Text search (e.g., "BTC", "AAPL") |
| `asset_type` | string | Filter: `crypto`, `fx`, `equity`, `metal`, `rates`, `commodity`, `funding-rate` |
| `limit` | number | Max results (default 50, max 200) |
| `offset` | number | Pagination offset (default 0) |

**Example usage in conversation:**
> "Find all Pyth crypto feeds for BTC"
> → AI calls `get_symbols(query="BTC", asset_type="crypto")`

### get_latest_price

Fetch latest prices. **Requires Pyth Pro `access_token`.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `access_token` | string | Pyth Pro token ([get one here](https://docs.pyth.network/price-feeds/pro/acquire-access-token)) |
| `symbols` | string[] | e.g., `["Crypto.BTC/USD"]` (must include asset-type prefix) |
| `price_feed_ids` | string[] | Alternative: use raw feed IDs |
| `channel` | string | `real_time` or `fixed_rate@{N}ms` |
| `properties` | string[] | Which fields to return |

- Max 100 feeds per request
- If both `symbols` and `price_feed_ids` provided, IDs take precedence
- Symbols must use prefix format: `Crypto.BTC/USD`, `Equity.AAPL/USD`, `FX.EUR/USD`

### get_historical_price

Get prices at a specific historical timestamp. **No token required.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbols` | string[] | Feed symbols with prefix |
| `price_feed_ids` | string[] | Alternative: raw feed IDs |
| `timestamp` | number | Unix timestamp |
| `channel` | string | `real_time` or `fixed_rate@{N}ms` |

- Max 50 feeds per request
- Historical data available from April 2025 onward

### get_candlestick_data

Fetch OHLC candlestick data. **No token required.**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Single symbol (e.g., `Crypto.BTC/USD`) |
| `resolution` | string | `1`, `5`, `15`, `30`, `60`, `120`, `240`, `360`, `720`, `D`, `W`, `M` |
| `from` | number | Start timestamp |
| `to` | number | End timestamp |
| `channel` | string | `real_time` or `fixed_rate@{N}ms` |

- Max 500 candles returned
- Response includes `truncated: true` if data was clipped

## MCP Skills (Pre-Built Workflows)

The Pyth MCP also offers 9 pre-built prompt templates called **MCP Skills**:

- **Portfolio tracking** — Value, allocation, and P&L
- **Volatility analysis** — Annualized vol, ATR, risk comparison
- **FX conversion** — Cross-rate conversions through Pyth feeds
- **Data export** — OHLC, snapshots, or feed catalogs as CSV/JSON
- **Price alerts** — Monitor price thresholds
- **Funding rates** — Track perpetual funding rates
- **Cross-asset comparisons** — Compare prices across asset classes
- **Integration guidance** — Help with Pyth integration

Browse all skills: https://docs.pyth.network/price-feeds/pro/mcp-skills

## Combining MCP + This Skill

The Pyth MCP and this Price Feeds skill are **complementary**:

| Capability | Pyth MCP | This Skill |
|-----------|----------|------------|
| Discover feeds | `get_symbols` tool | `feed-discovery.ts`, `references/feed-ids.md` |
| Fetch live prices | `get_latest_price` (needs Pro token) | Hermes REST/SSE (free) |
| Historical prices | `get_historical_price` | Benchmarks API |
| Candlestick data | `get_candlestick_data` | TradingView shim API |
| On-chain contracts | ❌ Not covered | ✅ Full Solidity templates |
| Off-chain clients | ❌ Not covered | ✅ ethers/viem/Python/Solana |
| Deploy scripts | ❌ Not covered | ✅ Foundry + Hardhat |
| Testing | ❌ Not covered | ✅ MockPyth patterns |
| Security guidance | ❌ Not covered | ✅ Full security reference |
| IDE rule configs | ❌ Not covered | ✅ All 5 IDEs |

**Best practice:** Use MCP for discovery and data exploration, this skill for implementation.
