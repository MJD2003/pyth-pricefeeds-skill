---
name: Pyth Price Feeds Integration
description: >
  This skill should be used when the user asks to "integrate Pyth price feeds",
  "add oracle prices", "get on-chain prices", "use Pyth oracle", "fetch real-time prices",
  "add price feed to contract", "read crypto prices on-chain", "integrate price oracle",
  "use Pyth for lending", "build oracle swap", "get ETH price on-chain",
  "stream live prices", "use Hermes API", "fetch price from Pyth",
  "add confidence intervals", "derive cross-rate", "schedule price updates",
  "push price feed", "pull price feed", "list all Pyth feeds", "discover feed IDs",
  "fetch all price feeds", "Pyth MCP", "use Pyth MCP server", "get_symbols",
  "dynamic feed discovery", or mentions Pyth Price Feeds, IPyth,
  PythStructs, Hermes, HermesClient, getPriceNoOlderThan, updatePriceFeeds,
  Pyth MCP, mcp.pyth.network, or price oracle for EVM/Solana/multi-chain smart
  contracts and off-chain apps.
version: 0.4.1
---

# Pyth Price Feeds Integration

Pyth Price Feeds deliver real-time financial market data from 120+ first-party providers (exchanges, trading firms, market makers) to 100+ blockchains. No registration or API key required — permissionless, on-chain, with sub-second latency.

This skill provides everything needed to integrate Pyth Price Feeds into any project: EVM, Solana, off-chain apps, or multi-chain.

## Step 1: Detect Project Stack (CRITICAL — Always Do First)

Before generating any code, scan the user's codebase to determine:

1. **Smart contract framework** — Look for:
   - `foundry.toml` → Foundry (use `forge` commands, `remappings.txt`)
   - `hardhat.config.ts` or `hardhat.config.js` → Hardhat (use `npx hardhat` commands)
   - `truffle-config.js` → Truffle
   - `Anchor.toml` or `Cargo.toml` with `anchor-lang` → Solana/Anchor
   - None → Ask user preference

2. **Target ecosystem** — Determine from deploy configs, `.env`, or ask user:
   - EVM chains (Ethereum, Arbitrum, Base, Optimism, Polygon, etc.)
   - Solana / SVM
   - Other (Aptos, Sui, CosmWasm, Starknet, NEAR)

3. **Off-chain language/library** — Look for:
   - `package.json` with `ethers` → Use ethers.js patterns (read `assets/typescript/price-feed-ethers.ts`)
   - `package.json` with `viem` → Use viem patterns (read `assets/typescript/price-feed-viem.ts`)
   - `package.json` with `@solana/web3.js` → Use Solana patterns (read `assets/solana/solana-client.ts`)
   - `requirements.txt` with `web3` or `httpx` → Python (read `assets/python/pyth_price_client.py`)
   - None → Match project's primary language, default to ethers.js v6

4. **Existing code style** — Match naming conventions, directory layout, import patterns.

5. **Integration mode** — Determine which approach:
   - **Pull** (default) — App fetches price updates from Hermes, submits on-chain, then reads
   - **Push** — App reads on-chain prices directly (push feeds must already be updated)
   - **Off-chain only** — App just needs prices for display/calculation, no on-chain interaction

6. **Pyth MCP Server** — Check if the official Pyth MCP is available:
   - Look for `pyth` in the IDE's MCP server configuration
   - Claude Code: `claude mcp list` or check `claude_desktop_config.json`
   - Cursor: Settings → Tools & MCP
   - Windsurf: `.windsurf/mcp_config.json` or MCP settings
   - If available: use `get_symbols` for feed discovery, `get_latest_price` for verification
   - If NOT available: use Hermes REST API (`/v2/price_feeds`) or hardcoded feed IDs
   - **The MCP is optional** — the skill works fully without it

## Step 1.5: Discover Feed IDs (Dynamic — No Hardcoding Needed)

Before writing any contract or client code, resolve the user's desired price feeds to their Pyth feed IDs. **Prefer dynamic discovery over hardcoded IDs.**

### Option A: Pyth MCP (if available in IDE)

If the Pyth MCP server is connected, use its `get_symbols` tool:
```
get_symbols(query="ETH", asset_type="crypto")     → finds ETH/USD feed
get_symbols(query="AAPL", asset_type="equity")     → finds AAPL/USD feed
get_symbols(query="EUR", asset_type="fx")           → finds EUR/USD feed
```

### Option B: Hermes API (always available, no setup needed)

```javascript
// Fetch ALL available feeds (1000+)
const response = await fetch("https://hermes.pyth.network/v2/price_feeds");
const feeds = await response.json();

// Each feed: { id: "ff61...", attributes: { symbol: "Crypto.ETH/USD", asset_type: "crypto", ... } }
feeds.forEach(feed => console.log("0x" + feed.id, feed.attributes.symbol));

// Filter by asset type
const crypto = await fetch("https://hermes.pyth.network/v2/price_feeds?asset_type=crypto");
const equities = await fetch("https://hermes.pyth.network/v2/price_feeds?asset_type=equity");

// Search by name
const btc = await fetch("https://hermes.pyth.network/v2/price_feeds?query=btc");
```

### Option C: Hardcoded (for known, fixed feeds)

Use the tables in `references/feed-ids.md` for common feeds like BTC/USD, ETH/USD, SOL/USD.

### When to Use Which

| Approach | Best For |
|----------|----------|
| **Pyth MCP** | Interactive AI-assisted development — let the AI discover feeds for you |
| **Hermes API** | Runtime discovery, user-selectable assets, dashboards, search UIs |
| **Hardcoded** | Contracts with fixed feed pairs, known asset sets |
| **Build-time cache** | Fetch once at build, embed in config (see `assets/typescript/feed-discovery.ts`) |

> For the full feed discovery module with caching, batch resolution, and registry building, read `assets/typescript/feed-discovery.ts`.

## Step 2: Install the SDK

Adapt installation to detected framework and ecosystem:

**EVM (Solidity):**
- **Foundry**: `npm init -y && npm install @pythnetwork/pyth-sdk-solidity`, add to `remappings.txt`: `@pythnetwork/pyth-sdk-solidity/=node_modules/@pythnetwork/pyth-sdk-solidity`
- **Hardhat/Truffle**: `npm install @pythnetwork/pyth-sdk-solidity`

**Solana (Rust/Anchor):**
- Add to `Cargo.toml`: `pyth-solana-receiver-sdk = "0.4.0"`
- Frontend: `npm install @pythnetwork/hermes-client @pythnetwork/pyth-solana-receiver`

**Off-chain (TypeScript/Python):**
- TypeScript: `npm install @pythnetwork/hermes-client`
- Python: `pip install httpx` (for Hermes REST) or `pip install pythclient`

## Step 3: Choose the Right Pattern

Select the appropriate use case and read the corresponding template from `assets/`:

| Use Case | Template | Description |
|----------|----------|-------------|
| Pull integration (EVM) | `PullConsumer.sol` | Fetch from Hermes → update on-chain → read price |
| Push integration (EVM) | `PushConsumer.sol` | Read on-chain prices directly (no update needed) |
| Oracle swap / AMM | `OracleSwap.sol` | Swap tokens at Pyth oracle price |
| Lending protocol | `LendingOracle.sol` | Collateral valuation with confidence intervals |
| Cross-rate derivation | `CrossRate.sol` | Derive ETH/EUR from ETH/USD + EUR/USD |
| Solana program | `anchor-consumer.rs` | Anchor program reading PriceUpdateV2 |
| Off-chain / frontend | `hermes-client.ts` | Fetch + stream prices from Hermes |
| React dApp | `use-pyth-price.ts` | React/wagmi hook for real-time prices |

For the base contract pattern, always read `assets/solidity/PythPriceFeedBase.sol` first.

**Adapt** the template to the user's project — do not copy verbatim. Match their contract structure, naming, and existing patterns.

## Step 4: Implement the Contract (EVM Pull Integration)

Every Pyth Price Feed consumer contract must:

1. **Import** `IPyth` and `PythStructs` from `@pythnetwork/pyth-sdk-solidity`
2. **Store** the `IPyth pyth` reference (set in constructor with the Pyth contract address)
3. **Accept** `bytes[] calldata priceUpdate` as a parameter on functions that need prices
4. **Calculate fee**: `uint fee = pyth.getUpdateFee(priceUpdate)`
5. **Update prices**: `pyth.updatePriceFeeds{value: fee}(priceUpdate)`
6. **Read price**: `PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, maxAge)`

**For push integration**, skip steps 3-5 and just call `getPriceNoOlderThan(feedId, maxAge)` directly.

### Price Struct

```solidity
struct Price {
    int64 price;        // price in fixed-point
    uint64 conf;        // confidence interval
    int32 expo;         // exponent (typically negative, e.g., -8)
    uint publishTime;   // timestamp of the price update
}
// Real price = price × 10^expo
// Example: price=12276250, expo=-5 → $122.76250
```

### Fixed-Point Conversion (Critical)

```solidity
// Convert Pyth price to uint256 with target decimals
function pythPriceToUint(PythStructs.Price memory price, uint8 targetDecimals) pure returns (uint256) {
    uint64 pricePositive = uint64(price.price);
    if (price.expo >= 0) {
        return uint256(pricePositive) * 10**uint32(price.expo) * 10**targetDecimals;
    } else {
        uint32 absExpo = uint32(-price.expo);
        if (absExpo > targetDecimals) {
            return uint256(pricePositive) / 10**(absExpo - targetDecimals);
        } else {
            return uint256(pricePositive) * 10**(targetDecimals - absExpo);
        }
    }
}
```

## Step 5: Fetch Price Updates from Hermes

Price updates must be fetched off-chain and submitted on-chain. Hermes provides 3 methods:

### REST API
```
GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>
```

### SSE Streaming
```
GET https://hermes.pyth.network/v2/updates/price/stream?ids[]=<feedId>
```

### TypeScript SDK (HermesClient)
```typescript
import { HermesClient } from "@pythnetwork/hermes-client";
const client = new HermesClient("https://hermes.pyth.network");
const updates = await client.getLatestPriceUpdates(["0xff61..."]);
```

Read the appropriate off-chain template from `assets/` based on detected stack:
- **ethers.js v6** → `assets/typescript/price-feed-ethers.ts`
- **viem** → `assets/typescript/price-feed-viem.ts`
- **React/wagmi dApp** → `assets/typescript/use-pyth-price.ts`
- **Solana frontend** → `assets/solana/solana-client.ts`
- **Python** → `assets/python/pyth_price_client.py`

## Step 6: Select Price Feed IDs

Every price feed is identified by a unique 32-byte ID. Find the feed ID for your asset:

- **Full list**: https://docs.pyth.network/price-feeds/price-feeds
- **Common feeds** — see `references/feed-ids.md` for the top 50+ feeds by category

**Popular Feed IDs:**
| Asset | Feed ID |
|-------|---------|
| BTC/USD | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| ETH/USD | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| SOL/USD | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| USDC/USD | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |

## Step 7: Handle Confidence Intervals and Staleness

### Staleness Check
Always use `getPriceNoOlderThan(feedId, maxAge)` — never `getPrice()` without staleness protection.

Recommended `maxAge` values:
| Use Case | maxAge (seconds) |
|----------|-----------------|
| DeFi (lending, perps) | 10–30 |
| DEX / swap | 30–60 |
| Display / UI | 60–300 |
| Low-frequency check | 300–3600 |

### Confidence Intervals
For risk-sensitive applications (lending, derivatives):
- **Collateral valuation** → Use `price - conf` (conservative lower bound)
- **Debt valuation** → Use `price + conf` (conservative upper bound)
- **High confidence check** → Require `conf / price < threshold` (e.g., 1%)

## Step 8: Testing

Read `assets/solidity/test/PythPriceFeedTest.sol` for the testing pattern, then adapt:

- **`MockPyth`** — Use `@pythnetwork/pyth-sdk-solidity/MockPyth.sol` from the SDK
- Create price updates with `createPriceFeedUpdateData(feedId, price, conf, expo, publishTime)`
- Test staleness, price reads, fee calculation, and edge cases

Adapt the mock and test base to the detected framework:
- **Foundry** → Use with `forge test`
- **Hardhat** → Convert to TypeScript tests using `ethers` + `chai`

## Step 9: Deployment

Read the deploy script matching the detected framework:
- **Foundry** → `assets/foundry/Deploy.s.sol`
- **Hardhat** → `assets/hardhat/deploy-pricefeeds.ts`

Copy `assets/env.example` to the user's project as `.env.example` and help them configure:
- `RPC_URL` — Target chain endpoint
- `PRIVATE_KEY` — Deployer wallet
- `PYTH_ADDRESS` — From `references/chainlist.md`
- `HERMES_URL` — `https://hermes.pyth.network` (default)

**Contract addresses** — Consult `references/chainlist.md` for the correct Pyth contract address per chain. Common addresses:
- **Ethereum**: `0x4305FB66699C3B2702D4d05CF36551390A4c69C6`
- **Arbitrum**: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- **Base**: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`
- **Optimism**: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- **Polygon**: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- **Solana**: `pythWSnswVUd12oZpeFP8e9CVaEqJg25g1Vtc2biRsT` (mainnet receiver)

## Step 10: Common Patterns

### Cross-Rate Derivation
Derive a price not directly available:
```
ETH/EUR = ETH/USD ÷ EUR/USD
```
See `assets/solidity/CrossRate.sol` and `references/best-practices.md`.

### Oracle Swap (AMM at Oracle Price)
Allow users to swap tokens at the Pyth-provided exchange rate. See `assets/solidity/OracleSwap.sol`.

### Perpetuals / Derivatives Oracle
For perpetual futures DEXs: funding rate calculation, mark price, and liquidation triggers. See `assets/solidity/PerpsOracle.sol`.

### Circuit Breaker / Price Guard
Protect against flash crashes and oracle manipulation with deviation checks and cooldown periods. See `assets/solidity/PriceGuard.sol`.

### Batch Price Reading
Gas-optimized reading of multiple feeds in one transaction using `parsePriceFeedUpdates`. See `assets/solidity/BatchPriceConsumer.sol`.

### Upgradeable Proxy
UUPS upgradeable proxy pattern with Pyth integration for production DeFi. See `assets/solidity/PythProxy.sol`.

### Automated Price Keeper
Background service that pushes price updates on-chain when deviation thresholds are met. See `assets/typescript/price-keeper.ts`.

### Historical Prices
Fetch historical prices at any timestamp via the Pyth Benchmarks API. See `assets/typescript/benchmarks-client.ts`.

### Liquidation Bot
Monitor positions and trigger liquidations using Pyth prices with Hermes SSE streaming. See `assets/typescript/liquidation-bot.ts`.

### Scheduled Price Updates (Price Pusher)
For apps that need always-fresh on-chain prices without user-initiated updates, use the Pyth [Price Pusher](https://docs.pyth.network/price-feeds/core/schedule-price-updates/using-price-pusher).

For comprehensive pattern documentation including TWAP, confidence gating, market hours awareness, and Gelato automation, see `references/patterns.md`.

## Common Pitfalls

- **StalePrice error (0x19abf40e)** → Must call `updatePriceFeeds` before reading. Pull model requires updates!
- **Wrong fee** → Always use `getUpdateFee(priceUpdate)`, never hardcode.
- **Ignoring exponent** → Price is fixed-point. Real price = `price × 10^expo`. Always convert!
- **Ignoring confidence** → For DeFi, use `price ± conf` for safe valuations.
- **Wrong feed ID** → Feed IDs are 32-byte hex. Verify from the official list.
- **Not handling price unavailability** → Markets have hours. Wrap reads in try/catch.
- **Push without checking availability** → Push feeds must be actively updated by a pusher.

## Additional Resources

### Reference Files
- **`references/chainlist.md`** — Contract addresses for EVM (100+ chains), Solana, Aptos, Sui, CosmWasm, etc.
- **`references/api-reference.md`** — Full IPyth interface, PythStructs, Hermes REST/SSE/SDK, error codes
- **`references/feed-ids.md`** — Top 50+ feed IDs organized by category (crypto, equities, FX, metals, commodities)
- **`references/best-practices.md`** — Fixed-point math, staleness, confidence, gas benchmarks, L2 cost comparison
- **`references/debugging.md`** — StalePrice errors, fee issues, common errors, troubleshooting
- **`references/security.md`** — Oracle manipulation, confidence-based risk, push vs pull security, price availability
- **`references/patterns.md`** — TWAP, multi-feed aggregation, fallback chains, circuit breakers, keepers, Gelato automation
- **`references/migration-from-chainlink.md`** — Step-by-step Chainlink → Pyth migration with code comparisons
- **`references/express-relay.md`** — MEV protection for price updates via Pyth Express Relay
- **`references/mcp-integration.md`** — Pyth MCP server setup, tools, IDE configs

### Asset Templates — Solidity
- **`assets/solidity/PythPriceFeedBase.sol`** — Abstract base: IPyth setup, update+read helpers, fixed-point conversion
- **`assets/solidity/PullConsumer.sol`** — Pull integration pattern (fetch+update+read)
- **`assets/solidity/PushConsumer.sol`** — Push integration pattern (read-only)
- **`assets/solidity/OracleSwap.sol`** — AMM that swaps at Pyth oracle price
- **`assets/solidity/LendingOracle.sol`** — Lending protocol oracle with confidence intervals
- **`assets/solidity/CrossRate.sol`** — Derive cross-rates from two Pyth feeds
- **`assets/solidity/PerpsOracle.sol`** — Perpetuals DEX oracle: mark price, funding rate, liquidation
- **`assets/solidity/PriceGuard.sol`** — Circuit breaker with deviation thresholds and cooldown
- **`assets/solidity/BatchPriceConsumer.sol`** — Gas-optimized multi-feed reading with parsePriceFeedUpdates
- **`assets/solidity/PythProxy.sol`** — UUPS upgradeable proxy with Pyth integration
- **`assets/solidity/interfaces/`** — IPyth.sol + PythStructs.sol offline reference copies
- **`assets/solidity/test/PythPriceFeedTest.sol`** — MockPyth + test patterns (cross-rate, confidence, batch, EMA)

### Asset Templates — Off-Chain
- **`assets/typescript/hermes-client.ts`** — HermesClient: fetch latest, stream SSE, batch requests
- **`assets/typescript/price-feed-ethers.ts`** — ethers.js v6: update+read on-chain prices
- **`assets/typescript/price-feed-viem.ts`** — viem: update+read on-chain prices
- **`assets/typescript/use-pyth-price.ts`** — React/wagmi hook for real-time Pyth prices
- **`assets/typescript/price-utils.ts`** — Fixed-point conversion, confidence, formatting utilities
- **`assets/typescript/feed-discovery.ts`** — Dynamic feed catalog with caching, batch resolution, registry
- **`assets/typescript/price-keeper.ts`** — Automated on-chain price updater with gas management
- **`assets/typescript/benchmarks-client.ts`** — Historical prices via Pyth Benchmarks API
- **`assets/typescript/e2e-example.ts`** — End-to-end flow: discover → fetch → submit → read → display
- **`assets/typescript/liquidation-bot.ts`** — Position monitor + liquidation trigger with Hermes SSE
- **`assets/solana/solana-client.ts`** — Solana frontend: fetch from Hermes + post to Solana
- **`assets/solana/anchor-consumer.rs`** — Anchor program reading PriceUpdateV2
- **`assets/python/pyth_price_client.py`** — Python: Hermes REST + optional web3 on-chain

### Asset Templates — Deploy & Config
- **`assets/foundry/Deploy.s.sol`** — Foundry deploy script
- **`assets/foundry/foundry.toml`** — Template Foundry config with Pyth remappings
- **`assets/foundry/remappings.txt`** — Ready-to-use remappings file
- **`assets/hardhat/deploy-pricefeeds.ts`** — Hardhat deploy script
- **`assets/hardhat/hardhat.config.ts`** — Template Hardhat config with all major chains + Pyth addresses
- **`assets/env.example`** — Environment variable template with chain addresses + Hermes URL
- **`assets/abi/IPyth.json`** — Standalone ABI (no npm install needed for off-chain usage)

### Scripts & Tools
- **`scripts/check-pyth-setup.sh`** — Setup verification (macOS/Linux)
- **`scripts/check-pyth-setup.ps1`** — Setup verification (Windows PowerShell)
- **`scripts/fetch-feed-ids.js`** — CLI tool: search and resolve Pyth feed IDs

### CI/CD
- **`assets/ci/pyth-ci.yml`** — GitHub Actions workflow template for Pyth projects

### External Links
- [Pyth Price Feeds Docs](https://docs.pyth.network/price-feeds)
- [Price Feed IDs](https://docs.pyth.network/price-feeds/price-feeds)
- [Contract Addresses](https://docs.pyth.network/price-feeds/contract-addresses)
- [Hermes API Docs](https://hermes.pyth.network/docs/)
- [Best Practices](https://docs.pyth.network/price-feeds/best-practices)
- [Example Applications](https://github.com/pyth-network/pyth-examples/tree/main/price_feeds)
