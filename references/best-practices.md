# Pyth Price Feeds Best Practices

## Fixed-Point Numeric Representation

Pyth prices use a fixed-point format with an exponent field:

```
real_price = price × 10^expo
real_conf  = conf  × 10^expo
```

**Example:** `price = 12276250`, `expo = -5` → `$122.76250`, `conf = 1500` → `±$0.015`

### Converting to Standard Decimals

#### Solidity
```solidity
function convertToUint(PythStructs.Price memory price, uint8 targetDecimals) pure returns (uint256) {
    if (price.price < 0) revert("Negative price");
    uint64 priceAbs = uint64(price.price);
    
    if (price.expo >= 0) {
        return uint256(priceAbs) * 10**uint32(price.expo) * 10**targetDecimals;
    } else {
        uint32 absExpo = uint32(-price.expo);
        if (absExpo >= targetDecimals) {
            return uint256(priceAbs) / 10**(absExpo - targetDecimals);
        } else {
            return uint256(priceAbs) * 10**(targetDecimals - absExpo);
        }
    }
}
```

#### TypeScript
```typescript
function pythPriceToNumber(price: { price: string; expo: number; conf: string }): {
    value: number;
    confidence: number;
} {
    const p = Number(price.price) * 10 ** price.expo;
    const c = Number(price.conf) * 10 ** price.expo;
    return { value: p, confidence: c };
}
```

#### Python
```python
def pyth_price_to_float(price: int, expo: int) -> float:
    return price * (10 ** expo)
```

### Common Decimal Conversions

| Target | Use Case | How |
|--------|----------|-----|
| 18 decimals | ERC-20 token math | `price * 10^(18 + expo)` |
| 8 decimals | Chainlink-compatible | `price * 10^(8 + expo)` |
| 6 decimals | USDC-scale | `price * 10^(6 + expo)` |
| Float | Display / UI | `price * 10^expo` |

## Price Staleness

### Why Staleness Matters

Pyth uses a **pull oracle** model. Prices are only updated on-chain when someone submits an update. Between updates, the on-chain price becomes stale. Using a stale price is dangerous for DeFi.

### Staleness Protection

**Always** use `getPriceNoOlderThan(feedId, maxAge)` — never use `getPriceUnsafe` in production.

Recommended `maxAge` values:

| Application | maxAge (seconds) | Rationale |
|-------------|-----------------|-----------|
| Perpetual futures | 5–10 | Extremely latency-sensitive |
| Lending liquidation | 10–30 | Must reflect current market |
| DEX / swap | 30–60 | Moderate sensitivity |
| Vault / yield | 60–300 | Lower frequency updates |
| Dashboard / display | 300–3600 | Informational only |

### Handling StalePrice Errors

```solidity
// Option 1: Try/catch with fallback
try pyth.getPriceNoOlderThan(feedId, 60) returns (PythStructs.Price memory price) {
    return price;
} catch {
    // Fallback: require fresh update, pause operations, or use EMA
    revert("Price too stale — submit a price update");
}

// Option 2: Use getPriceUnsafe + manual check
PythStructs.Price memory price = pyth.getPriceUnsafe(feedId);
require(block.timestamp - price.publishTime <= 60, "Stale price");
```

## Confidence Intervals

Pyth publishes a **confidence interval** (`conf`) with every price. This represents the uncertainty in the price across data providers.

### When to Use Confidence

For **risk-sensitive applications** (lending, derivatives, liquidations):

```solidity
PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 30);

// Conservative collateral valuation (lower bound)
int64 collateralPrice = price.price - int64(price.conf);

// Conservative debt valuation (upper bound)
int64 debtPrice = price.price + int64(price.conf);
```

### High Confidence Check

Pause activity when the market is too uncertain:

```solidity
// Require confidence < 1% of price
require(price.conf * 100 < uint64(price.price), "Price too uncertain");
```

### When Confidence Is Wide

A wide confidence interval means:
- High market volatility (bid-ask spreads are wide)
- Data providers disagree on the price
- An exchange may be having issues (e.g., blocked withdrawals)

**Recommended actions:**
1. Use discounted prices (`price ± conf`) favorable to the protocol
2. Pause new activity if `conf / price > threshold`
3. Increase collateral requirements during high-uncertainty periods

## Adversarial Selection

Pull oracles allow users some ability to select which price to use:
- Users can choose any valid price update within the staleness window
- This is equivalent to seeing the price slightly into the future

### Mitigations

1. **Tight staleness window** — Use the shortest `maxAge` your app can tolerate
2. **Two-step execution** — User commits, then executes after a delay (prevents choosing favorable prices)
3. **Confidence-weighted pricing** — Use `price ± conf` to make adversarial selection less profitable

## Latency Considerations

On-chain oracle prices always lag behind off-chain sources (CEXes, OTC markets). Assume adversaries see price changes before your protocol.

### Mitigations for Latency-Sensitive Protocols

1. **Fees/spreads** — Add a spread to the oracle price to compensate for latency
2. **Delayed execution** — Users submit orders that execute at a future price
3. **Rate limiting** — Limit how frequently a user can trade at oracle prices
4. **Size limits** — Cap the size of trades that can execute at oracle prices

## Price Availability (Market Hours)

Not all assets trade 24/7. Pyth follows traditional market hours:

| Asset Class | Trading Hours |
|-------------|--------------|
| Crypto | 24/7 |
| US Equities | Mon-Fri 9:30-16:00 ET |
| FX | Sun 17:00 - Fri 17:00 ET |
| Metals | Sun 18:00 - Fri 17:15 ET |
| Commodities | Varies by product |

**When markets are closed:**
- `getPriceNoOlderThan` will revert (price is stale)
- `getPriceUnsafe` returns the last available price
- `getEmaPriceUnsafe` returns the last EMA (smoother)

Handle this in your UI and contracts:

```solidity
try pyth.getPriceNoOlderThan(feedId, 3600) returns (PythStructs.Price memory p) {
    // Market is open or recently closed
} catch {
    // Market is closed — show last known price with disclaimer
    PythStructs.Price memory p = pyth.getPriceUnsafe(feedId);
    // Mark as "last close" in UI
}
```

## EMA vs Spot Price

Pyth provides both spot and EMA (exponential moving average) prices:

| | Spot Price | EMA Price |
|---|-----------|-----------|
| Method | `getPriceNoOlderThan` | `getEmaPriceNoOlderThan` |
| Behavior | Latest market price | Smoothed average |
| Use for | Trading, swaps, instant valuation | Lending, collateral, slower-moving apps |
| Volatility | High | Lower |

**Lending protocols** often prefer EMA to reduce liquidation cascades during flash crashes.

## Cross-Rate Derivation

To get a price not directly available (e.g., ETH/EUR):

```
ETH/EUR = ETH/USD ÷ EUR/USD
```

In Solidity:
```solidity
PythStructs.Price memory ethUsd = pyth.getPriceNoOlderThan(ETH_USD_FEED, 60);
PythStructs.Price memory eurUsd = pyth.getPriceNoOlderThan(EUR_USD_FEED, 60);

// Cross-rate with matching exponents
int64 ethEurPrice = (ethUsd.price * int64(10 ** uint32(-eurUsd.expo))) / eurUsd.price;
int32 ethEurExpo = ethUsd.expo;
```

See `assets/solidity/CrossRate.sol` for a complete implementation with confidence propagation.

## Gas Cost Benchmarks

Typical gas costs for Pyth operations on EVM chains (approximate, varies by chain and calldata size):

| Operation | Feeds | Approximate Gas | Notes |
|-----------|-------|----------------|-------|
| `updatePriceFeeds` | 1 | ~65,000 | Single feed update |
| `updatePriceFeeds` | 2 | ~85,000 | Two feeds in one call |
| `updatePriceFeeds` | 5 | ~140,000 | Five feeds in one call |
| `updatePriceFeeds` | 10 | ~230,000 | Ten feeds in one call |
| `getPriceNoOlderThan` | 1 | ~8,000 | Read-only after update |
| `getPriceUnsafe` | 1 | ~5,000 | No staleness check (display only) |
| `getEmaPriceNoOlderThan` | 1 | ~8,000 | EMA price read |
| `parsePriceFeedUpdates` | 1 | ~55,000 | Parse + read in one call |
| `parsePriceFeedUpdates` | 5 | ~115,000 | ~5k cheaper per feed vs update+read |
| `getUpdateFee` | any | ~3,000 | View function (free off-chain) |

### Gas Optimization Strategies

1. **Use `parsePriceFeedUpdates`** instead of `updatePriceFeeds` + separate `getPriceNoOlderThan` when you need specific feeds — saves ~5,000 gas per feed
2. **Batch updates** — One `updatePriceFeeds` call with N feeds is much cheaper than N separate calls
3. **Store feed IDs as `immutable`** — Saves ~2,100 gas per SLOAD vs regular storage
4. **Use `memory` not `storage`** — Only persist prices you truly need across transactions
5. **Refund excess ETH** — Always return `msg.value - fee` to avoid locking user funds
6. **Skip redundant updates** — If your contract was just updated by another user in the same block, the second update is wasted gas

### L2 vs L1 Gas Considerations

| Chain | Update Cost (1 feed) | Notes |
|-------|---------------------|-------|
| Ethereum L1 | ~$2-10 | Expensive; consider push model + keeper |
| Arbitrum | ~$0.01-0.05 | Cheap execution, calldata dominates |
| Base | ~$0.01-0.03 | Very cheap with EIP-4844 blobs |
| Optimism | ~$0.01-0.05 | Similar to Arbitrum |
| Polygon | ~$0.005-0.02 | Very cheap |
| BNB Chain | ~$0.05-0.20 | Moderate |

> On L2s, pull integration is very economical. On L1, consider push model or batching updates with a keeper to amortize costs.
