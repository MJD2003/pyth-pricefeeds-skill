Help me integrate Pyth Price Feeds into my project.

First, scan my codebase to determine:
1. Smart contract framework (Foundry, Hardhat, Anchor, or none)
2. Target ecosystem (EVM, Solana, other)
3. Off-chain language (TypeScript with ethers/viem, Python, etc.)
4. Integration mode needed (pull, push, or off-chain only)

Then follow the full workflow from the Pyth Price Feeds skill at ~/.claude/skills/pyth-pricefeeds/SKILL.md

Key steps:
- Install the appropriate SDK
- Choose the right pattern (PullConsumer, PushConsumer, OracleSwap, LendingOracle, CrossRate, or off-chain)
- Implement the contract/code
- Set up off-chain price fetching from Hermes
- Configure the correct Pyth contract address for my chain
- Add proper fixed-point conversion, staleness checks, and confidence handling
- Set up testing with MockPyth
- Prepare deployment

Reference files are in ~/.claude/skills/pyth-pricefeeds/references/ and templates in ~/.claude/skills/pyth-pricefeeds/assets/.
