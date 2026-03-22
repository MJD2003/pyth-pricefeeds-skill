# Pyth Price Feeds Security Considerations

## Oracle Architecture

Pyth uses a **pull oracle** model where:
1. Prices are aggregated off-chain from 120+ first-party data providers
2. Aggregated prices are signed and posted to **Pythnet** (Pyth's appchain)
3. **Hermes** serves price updates to applications
4. Applications submit price updates on-chain as part of their transactions
5. The Pyth contract verifies the signatures and stores the price

### What's Guaranteed
- **Prices are aggregated from multiple providers** — No single provider controls the price
- **Updates are signed** — Only valid, Pyth-signed data is accepted on-chain
- **On-chain verification** — The Pyth contract verifies Wormhole guardian signatures
- **Monotonic timestamps** — Prices can only move forward in time

### Trust Assumptions
- **Pyth data providers** — Trusted to submit honest price data
- **Wormhole guardians** — Trusted to sign valid price attestations
- **Hermes** — Trusted to serve authentic price data (but on-chain verification catches tampering)

## Oracle Manipulation Risks

### Price Manipulation Attacks

1. **Stale price exploitation** — Using an old price when the market has moved
   - **Mitigation**: Use tight `maxAge` in `getPriceNoOlderThan`

2. **Adversarial price selection** — User picks the most favorable price within the staleness window
   - **Mitigation**: Reduce `maxAge`, use delayed execution, add spreads

3. **Flash loan + oracle** — Borrowing to manipulate market prices, then exploiting the oracle
   - **Mitigation**: Pyth aggregates from off-chain sources (not on-chain DEXes), making this harder than with on-chain oracles like TWAP

4. **Market hours exploitation** — Using stale equity/FX prices outside market hours
   - **Mitigation**: Check `publishTime`, reject prices from closed markets for risk-sensitive operations

### Confidence-Based Risk Management

```solidity
// For lending: use conservative prices
function getCollateralValue(bytes32 feedId, uint256 amount) view returns (uint256) {
    PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 30);
    
    // Conservative: use lower bound of confidence interval
    int64 conservativePrice = price.price - int64(price.conf);
    require(conservativePrice > 0, "Negative conservative price");
    
    return uint256(uint64(conservativePrice)) * amount / (10 ** uint32(-price.expo));
}

function getDebtValue(bytes32 feedId, uint256 amount) view returns (uint256) {
    PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 30);
    
    // Conservative: use upper bound of confidence interval
    int64 conservativePrice = price.price + int64(price.conf);
    
    return uint256(uint64(conservativePrice)) * amount / (10 ** uint32(-price.expo));
}
```

### Uncertainty Gating

Pause high-risk operations when the market is too uncertain:

```solidity
function requireLowUncertainty(PythStructs.Price memory price, uint64 maxConfBps) pure {
    // maxConfBps = 100 means 1% max confidence/price ratio
    require(
        price.conf * 10000 / uint64(price.price) <= maxConfBps,
        "Price too uncertain"
    );
}
```

## Pull vs Push Security

### Pull Integration (Recommended for Most Apps)

**Pros:**
- Always get the freshest possible price
- No dependency on external price pushers
- Lower cost (user pays update fee)

**Cons:**
- User can choose which price update to submit (adversarial selection)
- Requires frontend/backend to fetch from Hermes

**Security tips:**
- Use tight `maxAge` (10-60 seconds)
- Validate the price update comes from the expected time range
- Consider `parsePriceFeedUpdatesUnique` for atomic update+read

### Push Integration

**Pros:**
- Simpler contract code (no update needed)
- No user-controlled price selection

**Cons:**
- Dependent on a price pusher being active
- Prices may be stale if pusher is down
- Limited to feeds in the push feed list

**Security tips:**
- Always use `getPriceNoOlderThan`, never `getPriceUnsafe`
- Have a fallback plan if push updates stop
- Monitor pusher health

## Price Availability and Market Hours

### Handling Market Closures

Equity and FX feeds stop updating outside market hours. Your contract must handle this:

```solidity
// Option A: Revert during market closure (safe but restrictive)
PythStructs.Price memory price = pyth.getPriceNoOlderThan(AAPL_USD, 3600);

// Option B: Use last known price with disclaimer
try pyth.getPriceNoOlderThan(AAPL_USD, 3600) returns (PythStructs.Price memory p) {
    return (p, true);  // fresh price
} catch {
    PythStructs.Price memory p = pyth.getPriceUnsafe(AAPL_USD);
    return (p, false); // stale price, mark as "last close"
}

// Option C: Use EMA for smoother degradation
PythStructs.Price memory ema = pyth.getEmaPriceUnsafe(AAPL_USD);
```

## Reentrancy Considerations

Pyth's `updatePriceFeeds` is an external call. If you call it within your contract logic, follow checks-effects-interactions:

```solidity
function swap(bytes[] calldata priceUpdate, uint256 amount) external payable {
    // 1. CHECKS
    require(amount > 0, "Zero amount");
    
    // 2. EFFECTS (state changes before external calls)
    balances[msg.sender] -= amount;
    
    // 3. INTERACTIONS (external calls last)
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);
    PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 60);
    
    // ... complete swap logic
}
```

## High-Value Application Checklist

For applications involving significant value (> $100k TVL):

- [ ] Use `getPriceNoOlderThan` with tight `maxAge` (10-30 seconds)
- [ ] Implement confidence interval checks — reject high-uncertainty prices
- [ ] Use conservative prices: `price - conf` for collateral, `price + conf` for debt
- [ ] Handle market hours — revert or pause for stale equity/FX prices
- [ ] Add a price deviation circuit breaker — pause if price changes > X% in one update
- [ ] Consider two-step execution for large trades (commit → execute with delay)
- [ ] Test with MockPyth including edge cases (negative prices, zero conf, extreme exponents)
- [ ] Audit update fee forwarding — ensure users can't drain contract ETH
- [ ] Monitor on-chain price freshness — alert if prices become stale
- [ ] Use multiple price sources for critical operations (Pyth + Chainlink as backup)
- [ ] Validate feed IDs at deployment — ensure they match expected assets
- [ ] Consider using EMA prices for lending/collateral (smoother, less manipulation risk)

## Comparison with Other Oracles

| Feature | Pyth (Pull) | Pyth (Push) | Chainlink | Uniswap TWAP |
|---------|-------------|-------------|-----------|--------------|
| Data source | 120+ off-chain providers | Same | Off-chain nodes | On-chain DEX |
| Latency | Sub-second | Depends on pusher | Heartbeat-based | Block-by-block |
| Cost model | User pays update fee | Pusher pays | Protocol subsidized | Free to read |
| Flash loan resistant | Yes (off-chain data) | Yes | Yes | Partially |
| Coverage | 1000+ feeds | Limited list | ~500 feeds | Only DEX pairs |
| Confidence interval | Yes | Yes | No | No |
| Multi-chain | 100+ chains | Limited | ~20 chains | EVM only |
| Registration | None | None | None | None |
