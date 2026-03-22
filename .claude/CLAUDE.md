# Pyth Price Feeds Skill

You have the Pyth Price Feeds skill for integrating real-time oracle prices into smart contracts and off-chain apps.

## Activation Triggers
Activate when the user mentions: "Pyth price feeds", "oracle prices", "on-chain prices", "get ETH price", "price oracle", "IPyth", "Hermes API", "getPriceNoOlderThan", "updatePriceFeeds", "pull oracle", "push oracle", "confidence interval", "cross-rate", "oracle swap", "lending oracle", "stream prices", "HermesClient", "Pyth MCP", "list all feeds", "discover feed IDs", "fetch all price feeds", "get_symbols", "mcp.pyth.network", "circuit breaker", "price guard", "perps oracle", "perpetuals", "funding rate", "liquidation bot", "price keeper", "migrate from Chainlink", "upgradeable proxy", "Express Relay", "batch prices", "historical prices", "benchmarks".

## Quick Reference

### EVM Pull Integration (Default)
1. `npm install @pythnetwork/pyth-sdk-solidity`
2. Import `IPyth` + `PythStructs`
3. Store `IPyth pyth` in constructor
4. Accept `bytes[] calldata priceUpdate`
5. `pyth.getUpdateFee(priceUpdate)` → `pyth.updatePriceFeeds{value: fee}(priceUpdate)` → `pyth.getPriceNoOlderThan(feedId, maxAge)`

### Price Struct
`{int64 price, uint64 conf, int32 expo, uint publishTime}` — real_price = price × 10^expo

### Critical Rules
- ALWAYS `getPriceNoOlderThan` with staleness check
- ALWAYS dynamic `getUpdateFee` — never hardcode fees
- ALWAYS convert fixed-point: price × 10^expo
- Lending: collateral = price - conf, debt = price + conf

### Key Addresses
- Ethereum: `0x4305FB66699C3B2702D4d05CF36551390A4c69C6`
- Arbitrum/Optimism/Polygon: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`
- Base: `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a`

### Feed ID Discovery (Prefer Dynamic Over Hardcoded)
- **Pyth MCP** (if configured): `get_symbols(query="ETH", asset_type="crypto")`
- **Hermes API** (always available): `GET https://hermes.pyth.network/v2/price_feeds?query=btc`
- **Hardcoded** (common):
  - ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
  - BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
  - SOL/USD: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`

### Pyth MCP Server (Optional — Complementary)
If `pyth` MCP is configured (`https://mcp.pyth.network/mcp`):
- `get_symbols` — discover feeds interactively
- `get_latest_price` — verify prices (needs Pro token)
- `get_candlestick_data` — historical chart data
- MCP handles data exploration; this skill handles implementation code.

## Advanced Patterns
- **Circuit breaker**: `PriceGuard.sol` | **Perps oracle**: `PerpsOracle.sol`
- **Batch reading**: `BatchPriceConsumer.sol` | **UUPS proxy**: `PythProxy.sol`
- **Liquidation bot**: `liquidation-bot.ts` | **Price keeper**: `price-keeper.ts`
- **Historical prices**: `benchmarks-client.ts` | **Dashboard**: `price-dashboard.html`
- **Chainlink migration**: `references/migration-from-chainlink.md`
- **MEV protection**: `references/express-relay.md`
- **Common patterns**: `references/patterns.md` (TWAP, multi-feed, fallbacks, Gelato)

## Full Skill
Read `~/.claude/skills/pyth-pricefeeds/SKILL.md` for the complete workflow.
Use `/pricefeeds` command to trigger the full integration flow.
See `~/.claude/skills/pyth-pricefeeds/references/mcp-integration.md` for Pyth MCP setup.
