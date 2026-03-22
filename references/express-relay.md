# Pyth Express Relay — MEV Protection for Price Updates

## Overview

Pyth Express Relay is a service that protects price update transactions from MEV (Maximal Extractable Value) attacks like front-running and sandwich attacks. It routes transactions through a private mempool, ensuring that price updates and the DeFi operations that depend on them execute fairly.

## Why MEV Protection Matters

When a user submits a Pyth price update + swap/liquidation in a single transaction:

1. **Without protection**: Searchers see the pending tx in the public mempool, extract the price update data, and front-run the operation
2. **With Express Relay**: Transactions are routed privately, eliminating front-running

### Common MEV Attack Vectors on Oracle Users

| Attack | Description | Impact |
|--------|-------------|--------|
| **Front-running** | Searcher sees your price update, submits same update + their own trade first | You get worse execution |
| **Sandwich** | Searcher wraps your trade with buy-before and sell-after | Direct value extraction |
| **Liquidation sniping** | Searcher uses your price update to liquidate before you can | Stolen liquidation bonus |
| **Oracle extraction** | Searcher extracts fresh price data from your pending tx | Free price updates at your gas cost |

## How Express Relay Works

```
User → Express Relay API → Private Mempool → Block Builder → On-chain
         (auction)          (no public visibility)
```

1. **Searcher submits opportunity** via Express Relay API
2. **Auction runs** among searchers for the right to execute
3. **Winner's transaction** is bundled privately with the price update
4. **Protocol receives** a portion of the auction proceeds as a reward

## Integration

### For DeFi Protocols (Solidity)

Express Relay integration requires your protocol to accept permissioned liquidations:

```solidity
import "@pythnetwork/express-relay-sdk-solidity/IExpressRelayFeeReceiver.sol";

contract MyLendingProtocol is IExpressRelayFeeReceiver {
    address public expressRelay;

    modifier onlyExpressRelay() {
        require(msg.sender == expressRelay, "Only Express Relay");
        _;
    }

    /// @notice Liquidation function that can only be called via Express Relay
    function liquidateViaRelay(
        address user,
        bytes[] calldata priceUpdate
    ) external payable onlyExpressRelay {
        // Update Pyth prices
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        // Execute liquidation
        _liquidate(user);
    }

    /// @notice Receive Express Relay auction proceeds
    function receiveAuctionProceedings() external payable override {
        // Protocol receives MEV auction revenue
    }
}
```

### For Searchers (TypeScript)

```typescript
import { Client as ExpressRelayClient } from "@pythnetwork/express-relay-js";

const client = new ExpressRelayClient({
  baseUrl: "https://per-stable.dourolabs.app",
  // Or for testnet: "https://per-staging.dourolabs.app"
});

// Subscribe to liquidation opportunities
client.subscribeLiquidationOpportunities(async (opportunity) => {
  console.log("Opportunity:", opportunity);

  // Evaluate if profitable
  if (isProfitable(opportunity)) {
    // Submit bid
    await client.submitBid({
      opportunityId: opportunity.opportunityId,
      amount: calculateBid(opportunity),
      deadline: Math.floor(Date.now() / 1000) + 60,
      executor: walletAddress,
    });
  }
});
```

## Express Relay Endpoints

| Environment | URL |
|-------------|-----|
| **Mainnet** | `https://per-stable.dourolabs.app` |
| **Testnet** | `https://per-staging.dourolabs.app` |

## Supported Chains

Express Relay is available on major EVM chains. Check the [Express Relay docs](https://docs.pyth.network/express-relay) for the latest supported chains.

## When to Use Express Relay

| Use Case | Recommendation |
|----------|---------------|
| **Lending liquidations** | Strongly recommended — prevents liquidation sniping |
| **DEX/AMM trades** | Recommended for large trades — prevents sandwich attacks |
| **Oracle-dependent settlements** | Recommended — prevents front-running |
| **Display/read-only** | Not needed — no MEV risk |
| **Low-value transactions** | Optional — MEV extraction may not be profitable for attackers |

## SDK Installation

```bash
# Solidity (for protocols)
npm install @pythnetwork/express-relay-sdk-solidity

# TypeScript (for searchers/integrators)
npm install @pythnetwork/express-relay-js
```

## Key Considerations

1. **Express Relay is optional** — Your protocol works without it, but high-value operations benefit from MEV protection
2. **Auction revenue** — Protocols receive a share of the MEV auction proceeds, turning a cost into revenue
3. **Latency** — Express Relay adds minimal latency (~100ms) to transaction submission
4. **Backwards compatible** — You can add Express Relay to an existing Pyth integration without changing your core oracle logic

## Resources

- [Express Relay Documentation](https://docs.pyth.network/express-relay)
- [Express Relay SDK (Solidity)](https://www.npmjs.com/package/@pythnetwork/express-relay-sdk-solidity)
- [Express Relay SDK (TypeScript)](https://www.npmjs.com/package/@pythnetwork/express-relay-js)
- [How Express Relay Works](https://docs.pyth.network/express-relay/how-express-relay-works)
