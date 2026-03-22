# Changelog

## [0.4.0] — 2026-03-22

### Added — Advanced Patterns & Production Features
- **assets/solidity/PerpsOracle.sol** — Perpetuals/derivatives oracle: mark price, index price, funding rate calculation, liquidation threshold checks, multi-market support
- **assets/solidity/PythProxy.sol** — UUPS upgradeable proxy with Pyth: initializer pattern, feed registry, emergency pause, 2-step ownership transfer, storage gaps
- **assets/typescript/liquidation-bot.ts** — Position monitor + liquidation trigger: Hermes SSE streaming, gas-aware execution, retry logic, health monitoring, profit threshold
- **assets/typescript/price-dashboard.html** — Standalone live price dashboard: Hermes SSE streaming, dynamic feed search, price flash animations, no build step required
- **assets/ci/pyth-ci.yml** — GitHub Actions CI template: Foundry tests, Hardhat tests, Solidity lint, TypeScript check, Pyth setup verification
- **references/express-relay.md** — Pyth Express Relay MEV protection: private mempool routing, liquidation sniping prevention, auction revenue for protocols
- **LICENSE** — Apache 2.0 license file

### Changed
- All 7 IDE configs updated with v0.4.0 triggers: circuit breaker, perps oracle, funding rate, liquidation bot, price keeper, Chainlink migration, upgradeable proxy, Express Relay, batch prices, historical prices
- SKILL.md Step 10 expanded with 9 new pattern sections (perps, circuit breaker, batch, proxy, keeper, historical, liquidation, Express Relay)
- SKILL.md Additional Resources now lists all 65+ files across all categories
- README file tree expanded to show all 65+ files with descriptions
- README supported patterns table: 9 → 17 patterns
- README "How to use it" section: 4 new example prompts
- CLI: added `update` command (re-install to refresh files) and `verify` command (validate package integrity + version consistency)
- package.json: added `prepublishOnly` script for npm publish validation, added README/CHANGELOG/LICENSE to files array

## [0.3.0] — 2026-03-22

### Added — Gap Closure Release
- **references/patterns.md** — Common integration patterns: TWAP, multi-feed aggregation, fallback chains, circuit breakers, keeper scheduling, confidence gating, market hours awareness, gas optimization
- **references/migration-from-chainlink.md** — Step-by-step migration guide from Chainlink to Pyth with code comparisons, feed ID mapping, and multi-oracle pattern
- **assets/solidity/PriceGuard.sol** — Circuit breaker / price deviation guard with configurable thresholds, cooldown periods, and confidence gating
- **assets/solidity/BatchPriceConsumer.sol** — Gas-optimized batch price reading with `parsePriceFeedUpdates`, asset registry, and WAD conversion helpers
- **assets/solidity/interfaces/** — Offline reference copies of `IPyth.sol` and `PythStructs.sol` for IDE autocompletion
- **assets/typescript/price-keeper.ts** — Production-ready automated on-chain price updater with gas management, deviation thresholds, retry logic, and health monitoring
- **assets/typescript/benchmarks-client.ts** — Pyth Benchmarks API client for historical prices, time series, and on-chain settlement data
- **assets/typescript/e2e-example.ts** — Complete end-to-end flow: discover → fetch → submit → read → display
- **assets/foundry/foundry.toml** — Template Foundry configuration with Pyth remappings
- **assets/foundry/remappings.txt** — Ready-to-use Foundry remappings file
- **assets/hardhat/hardhat.config.ts** — Template Hardhat config with all major chains and Pyth addresses
- **scripts/check-pyth-setup.ps1** — PowerShell version of setup verification script (Windows)
- **scripts/fetch-feed-ids.js** — Standalone CLI tool for searching and resolving Pyth feed IDs
- Gas cost benchmarks added to `references/best-practices.md`

## [0.2.0] — 2026-03-22

### Added — Pyth MCP + Dynamic Feed Discovery
- **references/mcp-integration.md** — Pyth MCP server setup, tool reference, IDE configs
- **assets/typescript/feed-discovery.ts** — Dynamic feed catalog with caching, batch resolution, registry building
- All IDE configs updated with MCP triggers and feed discovery guidance
- SKILL.md: new Step 1.5 (Discover Feed IDs) with 3 options (MCP → Hermes API → Hardcoded)
- README.md: MCP section, dynamic feed discovery section, updated links

### Changed
- `hermes-client.ts` — Added `discoverAllFeeds()` + `resolveFeedId()`
- `pyth_price_client.py` — Added `fetch_all_feeds()`, `resolve_feed_id()`, `resolve_feed_ids()`, `build_feed_registry()`
- `feed-ids.md` — Expanded with comprehensive dynamic discovery section

## [0.1.0] — 2026-03-22

### Initial Release
- Core SKILL.md with 10-step integration workflow
- 7 reference files: chainlist, api-reference, feed-ids, best-practices, debugging, security
- 6 Solidity contract templates + test (PythPriceFeedBase, PullConsumer, PushConsumer, OracleSwap, LendingOracle, CrossRate)
- 5 TypeScript client templates (hermes-client, price-feed-ethers, price-feed-viem, use-pyth-price, price-utils)
- Solana: Anchor program + frontend client
- Python: Hermes REST + web3 client
- Deploy scripts: Foundry + Hardhat
- IPyth ABI, env.example, setup verification script
- IDE configs: Windsurf, Cursor, Claude Code, GitHub Copilot, Cline/Roo
- CLI installer (bin/cli.js) + shell installers (install.sh, install.ps1)
