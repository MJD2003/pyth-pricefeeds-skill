---
description: Pyth Price Feeds integration — oracle prices for EVM, Solana, and off-chain apps
globs: ["**/*.sol", "**/*.ts", "**/*.tsx", "**/*.rs", "**/*.py"]
---

# Pyth Price Feeds Skill

Activate when working on Solidity, TypeScript, Rust, or Python files that involve price oracles, Pyth, DeFi pricing, Pyth MCP, feed discovery, mcp.pyth.network, circuit breaker, perps oracle, perpetuals, funding rate, liquidation bot, price keeper, migrate from Chainlink, upgradeable proxy, Express Relay, batch prices, or historical prices.

## EVM Pull Integration
```solidity
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
// 1. Store IPyth pyth in constructor
// 2. Accept bytes[] calldata priceUpdate
// 3. uint fee = pyth.getUpdateFee(priceUpdate);
// 4. pyth.updatePriceFeeds{value: fee}(priceUpdate);
// 5. PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, maxAge);
// 6. real_price = p.price * 10^p.expo
```

## Rules
- ALWAYS `getPriceNoOlderThan` — never `getPriceUnsafe`
- ALWAYS dynamic `getUpdateFee` — never hardcode
- Convert: `price × 10^expo`
- Lending: collateral = price - conf, debt = price + conf

## Feed Discovery (Prefer Dynamic)
- **Pyth MCP** (if configured): `get_symbols(query="ETH", asset_type="crypto")`
- **Hermes API**: `GET https://hermes.pyth.network/v2/price_feeds?query=btc`
- **Hardcoded**: ETH/USD `0xff61491a...fd0ace` | BTC/USD `0xe62df6c8...415b43`

## Addresses
- Ethereum: `0x4305FB66699C3B2702D4d05CF36551390A4c69C6`
- Arbitrum/Optimism/Polygon: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- Base: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`

## Hermes
- `https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>`
- `https://hermes.pyth.network/v2/price_feeds` (feed catalog)
- `new HermesClient("https://hermes.pyth.network")`

## Pyth MCP (Optional)
- Endpoint: `https://mcp.pyth.network/mcp`
- Tools: `get_symbols`, `get_latest_price`, `get_historical_price`, `get_candlestick_data`

## Advanced Patterns
- **Circuit breaker**: `PriceGuard.sol` | **Perps**: `PerpsOracle.sol` | **Batch**: `BatchPriceConsumer.sol`
- **UUPS proxy**: `PythProxy.sol` | **Keeper**: `price-keeper.ts` | **Liquidation**: `liquidation-bot.ts`
- **Historical**: `benchmarks-client.ts` | **Dashboard**: `price-dashboard.html`
- **Chainlink migration**: `references/migration-from-chainlink.md`
- **MEV protection**: `references/express-relay.md`
- **All patterns**: `references/patterns.md` (TWAP, multi-feed, fallbacks, Gelato)
