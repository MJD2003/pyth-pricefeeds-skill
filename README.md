# Pyth Price Feeds Skill

Teaches your AI coding assistant how to integrate [Pyth Price Feeds](https://docs.pyth.network/price-feeds) into any project. One install, works forever across all your projects.

You say *"add Pyth price feed to my contract"* and it figures out the rest — your framework, your chain, your language, your style.

**Compatible with the [Pyth MCP Server](https://docs.pyth.network/price-feeds/pro/mcp)** — if you have it configured, the skill leverages it for feed discovery. If not, it works fully standalone.

## Install

```
npx pyth-pricefeeds-skill install
```

That's it. It asks which IDEs you use, copies the skill files to the right global directories, and you're done. Works on Windows, macOS, Linux.

You can also target a specific IDE:

```bash
npx pyth-pricefeeds-skill install all       # Windsurf + Cursor + Claude Code
npx pyth-pricefeeds-skill install windsurf  # just Windsurf
npx pyth-pricefeeds-skill install cursor    # just Cursor
npx pyth-pricefeeds-skill install claude    # just Claude Code
```

Check what's installed:
```
npx pyth-pricefeeds-skill status
```

Remove everything:
```
npx pyth-pricefeeds-skill uninstall
```

## Where does it go?

Each IDE has a global directory for persistent skills/rules. The installer puts the right files in the right place so the skill is **always available** — you never have to set it up per project.

| IDE | What gets installed | Where | How it activates |
|-----|-------------------|-------|-----------------|
| **Windsurf** | Full skill (SKILL.md + references + assets) | `~/.codeium/windsurf/skills/pyth-pricefeeds/` | Auto-discovered from SKILL.md. Always available in every project. |
| **Cursor** | Global rule file | `~/.cursor/rules/pyth-pricefeeds.md` | Activates when you work on `.sol`, `.ts`, `.rs`, `.py` files or mention price feeds. |
| **Claude Code** | Skill files + `/pricefeeds` command | `~/.claude/skills/pyth-pricefeeds/` + `~/.claude/commands/` | Say "add price feed" or type `/pricefeeds` in any project. |

For IDEs without global skill support, it's per-project:

| IDE | Command | What happens |
|-----|---------|-------------|
| **GitHub Copilot** | `npx pyth-pricefeeds-skill install copilot` | Copies `.github/copilot-instructions.md` into current project |
| **Cline / Roo** | `npx pyth-pricefeeds-skill install cline` | Copies `.clinerules` into current project |

## How to use it

After installing, open any project and talk to your AI normally:

- *"Add Pyth price feed to my lending contract"* — full pull integration flow
- *"I need ETH/USD price in my Solidity contract"* — generates PullConsumer pattern
- *"Build an oracle swap AMM"* — OracleSwap pattern with Pyth prices
- *"Stream live BTC price in my React app"* — HermesClient SSE + React hook
- *"Read SOL/USD price in my Anchor program"* — Solana PriceUpdateV2 integration
- *"Deploy my Pyth contract to Base"* — deploy script with the right chain config
- *"Derive ETH/EUR cross-rate from Pyth"* — CrossRate pattern
- *"List all crypto price feeds from Pyth"* — dynamic feed discovery via Hermes API
- *"Find the feed ID for AAPL/USD"* — automatic symbol-to-ID resolution
- *"Add a circuit breaker to my Pyth oracle"* — PriceGuard with deviation thresholds
- *"Build a perpetuals oracle with funding rates"* — PerpsOracle pattern
- *"Migrate my Chainlink oracle to Pyth"* — step-by-step migration guide
- *"Make my Pyth contract upgradeable"* — UUPS proxy pattern

The skill scans your codebase first and adapts everything:

- Foundry project? Forge commands, remappings, Foundry test patterns.
- Hardhat? npx hardhat commands, Hardhat deploy scripts.
- Anchor/Solana? Rust SDK, Solana frontend patterns.
- Using viem? Off-chain code uses viem. Using ethers? Uses ethers. Python? httpx/web3.py.
- React dApp with wagmi? Gives you a `usePythPrice` hook.

You don't configure anything. It reads your project and matches.

## What's in the box

```
pyth-pricefeeds-skill/
│
├── SKILL.md                              Core instructions — 10-step workflow
├── CHANGELOG.md                          Version history
├── LICENSE                               Apache 2.0
│
├── references/
│   ├── chainlist.md                      Contract addresses for 100+ chains
│   ├── api-reference.md                  IPyth interface, PythStructs, Hermes API
│   ├── feed-ids.md                       50+ feed IDs + dynamic discovery guide
│   ├── mcp-integration.md                Pyth MCP server setup & tools
│   ├── best-practices.md                 Fixed-point math, staleness, confidence, gas benchmarks
│   ├── patterns.md                       TWAP, multi-feed, fallbacks, circuit breakers, keepers
│   ├── migration-from-chainlink.md       Step-by-step Chainlink → Pyth migration
│   ├── express-relay.md                  MEV protection for price updates
│   ├── debugging.md                      StalePrice errors, common issues
│   └── security.md                       Oracle risks, confidence-based safety
│
├── assets/
│   ├── solidity/                         12 contract patterns + interfaces + test
│   │   ├── PythPriceFeedBase.sol          Abstract base with IPyth + helpers
│   │   ├── PullConsumer.sol               Pull integration (fetch+update+read)
│   │   ├── PushConsumer.sol               Push integration (read-only)
│   │   ├── OracleSwap.sol                 AMM at Pyth oracle price
│   │   ├── LendingOracle.sol              Lending with confidence intervals
│   │   ├── CrossRate.sol                  Derive cross-rates (ETH/EUR)
│   │   ├── PerpsOracle.sol                Perpetuals: mark price, funding, liquidation
│   │   ├── PriceGuard.sol                 Circuit breaker + deviation guard
│   │   ├── BatchPriceConsumer.sol          Gas-optimized multi-feed reading
│   │   ├── PythProxy.sol                  UUPS upgradeable proxy with Pyth
│   │   ├── interfaces/                    IPyth.sol + PythStructs.sol (offline ref)
│   │   └── test/PythPriceFeedTest.sol      MockPyth + comprehensive test suite
│   │
│   ├── typescript/                       13 client templates + dashboard
│   │   ├── hermes-client.ts               Hermes REST + SSE + batch
│   │   ├── price-feed-ethers.ts           ethers.js v6 on-chain client
│   │   ├── price-feed-viem.ts             viem on-chain client
│   │   ├── use-pyth-price.ts              React/wagmi hook
│   │   ├── price-utils.ts                 Fixed-point conversion utilities
│   │   ├── feed-discovery.ts              Dynamic feed catalog + caching
│   │   ├── price-keeper.ts                Automated on-chain price updater
│   │   ├── benchmarks-client.ts           Historical prices API client
│   │   ├── e2e-example.ts                 End-to-end integration flow
│   │   ├── liquidation-bot.ts             Position monitor + liquidator
│   │   └── price-dashboard.html           Live SSE price dashboard (standalone)
│   │
│   ├── solana/                           Anchor program + frontend client
│   ├── python/                           Hermes REST + web3 client
│   ├── foundry/                          Deploy script + foundry.toml + remappings
│   ├── hardhat/                          Deploy script + hardhat.config.ts
│   ├── ci/                               GitHub Actions CI workflow template
│   ├── abi/                              Standalone IPyth ABI
│   └── env.example                       .env template with chain addresses
│
├── scripts/
│   ├── check-pyth-setup.sh               Setup verification (macOS/Linux)
│   ├── check-pyth-setup.ps1              Setup verification (Windows)
│   └── fetch-feed-ids.js                 CLI feed ID lookup tool
│
├── bin/cli.js                            npx installer (install/status/uninstall/update/verify)
├── .cursorrules                          Cursor integration
├── .cursor/rules/pyth-pricefeeds.md      Cursor rules (glob-based activation)
├── .windsurfrules                        Windsurf integration
├── .claude/                              Claude Code integration + /pricefeeds command
├── .github/copilot-instructions.md       GitHub Copilot integration
└── .clinerules                           Cline/Roo integration
```

## Supported patterns

| Pattern | Use case | Template |
|---------|----------|----------|
| Pull integration | Fetch + update + read prices (default) | `PullConsumer.sol` |
| Push integration | Read-only on-chain prices | `PushConsumer.sol` |
| Oracle swap | AMM at Pyth oracle price | `OracleSwap.sol` |
| Lending oracle | Collateral valuation with confidence | `LendingOracle.sol` |
| Cross-rate | Derive ETH/EUR from ETH/USD + EUR/USD | `CrossRate.sol` |
| Perpetuals oracle | Mark price, funding rate, liquidation checks | `PerpsOracle.sol` |
| Circuit breaker | Price deviation guard + cooldown | `PriceGuard.sol` |
| Batch price reading | Gas-optimized multi-feed in one tx | `BatchPriceConsumer.sol` |
| Upgradeable proxy | UUPS proxy with Pyth for production DeFi | `PythProxy.sol` |
| Off-chain streaming | Real-time prices via Hermes SSE | `hermes-client.ts` |
| Dynamic feed discovery | Fetch all 1000+ feeds at runtime | `feed-discovery.ts` |
| Price keeper | Automated on-chain price updater service | `price-keeper.ts` |
| Liquidation bot | Monitor positions + trigger liquidations | `liquidation-bot.ts` |
| Historical prices | Fetch prices at any past timestamp | `benchmarks-client.ts` |
| Live dashboard | Standalone HTML page with SSE streaming | `price-dashboard.html` |
| React hook | Real-time prices in React/wagmi dApp | `use-pyth-price.ts` |
| Solana program | Anchor program reading Pyth prices | `anchor-consumer.rs` |

All patterns support 100+ blockchains and 1000+ price feeds (crypto, equities, FX, metals, commodities).

## Dynamic Feed Discovery

**You don't need to hardcode feed IDs.** Fetch all available feeds programmatically:

```javascript
// Fetch ALL feeds (1000+)
const feeds = await fetch("https://hermes.pyth.network/v2/price_feeds").then(r => r.json());

// Filter by asset type
const crypto = await fetch("https://hermes.pyth.network/v2/price_feeds?asset_type=crypto").then(r => r.json());

// Search by name
const btc = await fetch("https://hermes.pyth.network/v2/price_feeds?query=btc").then(r => r.json());

// Each feed: { id: "ff61...", attributes: { symbol: "Crypto.ETH/USD", asset_type: "crypto" } }
```

See `assets/typescript/feed-discovery.ts` for a full module with caching, batch resolution, and registry building.

## Pyth MCP Server (Optional)

This skill works great alongside the [Pyth MCP Server](https://docs.pyth.network/price-feeds/pro/mcp). If you have it configured in your IDE, the skill will leverage MCP tools (`get_symbols`, `get_latest_price`, etc.) for feed discovery and data verification.

**Setup** (one line per IDE):

```bash
# Claude Code
claude mcp add pyth --transport http https://mcp.pyth.network/mcp

# Cursor: Settings → Tools & MCP → Add:
# { "mcpServers": { "pyth": { "url": "https://mcp.pyth.network/mcp" } } }

# Windsurf: .windsurf/mcp_config.json:
# { "mcpServers": { "pyth": { "serverUrl": "https://mcp.pyth.network/mcp" } } }
```

**MCP is optional** — the skill works fully without it using Hermes REST API for feed discovery.

## Links

- [Pyth Price Feeds docs](https://docs.pyth.network/price-feeds)
- [Price Feed IDs](https://docs.pyth.network/price-feeds/price-feeds) — find any asset
- [Contract Addresses](https://docs.pyth.network/price-feeds/contract-addresses) — all chains
- [Hermes API](https://hermes.pyth.network/docs/) — REST + SSE endpoints
- [Hermes Feed Catalog](https://hermes.pyth.network/v2/price_feeds) — all feeds, live
- [Pyth MCP Server](https://docs.pyth.network/price-feeds/pro/mcp) — AI-assisted data access
- [Example apps](https://github.com/pyth-network/pyth-examples/tree/main/price_feeds)

## License

Apache 2.0
