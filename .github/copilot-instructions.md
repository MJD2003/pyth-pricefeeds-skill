# Pyth Price Feeds Integration

When the user asks about price feeds, oracle prices, Pyth, or on-chain prices, follow this workflow:

## EVM Pull Integration (Default Pattern)
1. Install: `npm install @pythnetwork/pyth-sdk-solidity`
2. Import `IPyth` and `PythStructs` from the SDK
3. Store `IPyth pyth` in constructor with Pyth contract address
4. Accept `bytes[] calldata priceUpdate` in functions needing prices
5. Calculate fee: `uint fee = pyth.getUpdateFee(priceUpdate)`
6. Update: `pyth.updatePriceFeeds{value: fee}(priceUpdate)`
7. Read: `PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, maxAge)`
8. Convert: `real_price = p.price * 10^p.expo`

## Critical Rules
- ALWAYS use `getPriceNoOlderThan` — never `getPriceUnsafe` in production
- ALWAYS use dynamic `getUpdateFee(priceUpdate)` — never hardcode fees
- ALWAYS convert fixed-point: `price × 10^expo`
- For lending: use `price - conf` for collateral, `price + conf` for debt

## Key Contract Addresses
- Ethereum: `0x4305FB66699C3B2702D4d05CF36551390A4c69C6`
- Arbitrum/Optimism/Polygon: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- Base: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`

## Feed ID Discovery (Prefer Dynamic Over Hardcoded)
- **Hermes API** (always available, no setup): `GET https://hermes.pyth.network/v2/price_feeds?query=btc&asset_type=crypto`
- **Pyth MCP** (if configured in IDE): `get_symbols(query="ETH", asset_type="crypto")`
- **Hardcoded** (common feeds):
  - ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
  - BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
  - SOL/USD: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`

## Off-Chain (Hermes)
- REST: `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedId>`
- SSE: `GET https://hermes.pyth.network/v2/updates/price/stream?ids[]=<feedId>`
- Feed catalog: `GET https://hermes.pyth.network/v2/price_feeds`
- SDK: `npm install @pythnetwork/hermes-client` → `new HermesClient("https://hermes.pyth.network")`

## Pyth MCP Server (Optional)
- Endpoint: `https://mcp.pyth.network/mcp` (Streamable HTTP, no auth)
- Tools: `get_symbols`, `get_latest_price` (Pro token), `get_historical_price`, `get_candlestick_data`
- Complementary to this skill — MCP for data exploration, skill for code implementation

## Advanced Patterns
- **Circuit breaker**: `PriceGuard.sol` — deviation guard + cooldown
- **Perps oracle**: `PerpsOracle.sol` — mark price, funding rate, liquidation
- **Batch reading**: `BatchPriceConsumer.sol` — gas-optimized multi-feed
- **UUPS proxy**: `PythProxy.sol` — upgradeable proxy for production DeFi
- **Liquidation bot**: `liquidation-bot.ts` — position monitor + liquidator
- **Price keeper**: `price-keeper.ts` — automated on-chain price updater
- **Historical prices**: `benchmarks-client.ts` — Pyth Benchmarks API
- **Chainlink migration**: See `references/migration-from-chainlink.md`
- **MEV protection**: See `references/express-relay.md`
- **Common patterns**: See `references/patterns.md` (TWAP, multi-feed, fallbacks, Gelato)
