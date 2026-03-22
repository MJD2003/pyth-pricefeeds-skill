# Common Integration Patterns

## TWAP (Time-Weighted Average Price)

Smooth out short-term volatility by averaging Pyth prices over a window.

### Solidity — On-Chain TWAP

```solidity
contract PythTWAP {
    IPyth public pyth;
    bytes32 public feedId;

    uint256 public constant WINDOW = 12;          // number of samples
    int64[12] public priceSamples;
    uint256 public sampleIndex;
    uint256 public lastSampleTime;
    uint256 public constant SAMPLE_INTERVAL = 5 minutes;

    function recordSample(bytes[] calldata priceUpdate) external payable {
        require(block.timestamp >= lastSampleTime + SAMPLE_INTERVAL, "Too soon");

        uint fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, 60);
        priceSamples[sampleIndex % WINDOW] = p.price;
        sampleIndex++;
        lastSampleTime = block.timestamp;
    }

    function getTWAP() external view returns (int64) {
        uint count = sampleIndex < WINDOW ? sampleIndex : WINDOW;
        require(count > 0, "No samples");

        int256 sum = 0;
        for (uint i = 0; i < count; i++) {
            sum += priceSamples[i];
        }
        return int64(sum / int256(count));
    }
}
```

### TypeScript — Off-Chain TWAP

```typescript
class PythTWAP {
  private samples: { price: number; timestamp: number }[] = [];
  constructor(private windowMs: number = 60 * 60 * 1000) {} // 1 hour

  addSample(price: number) {
    const now = Date.now();
    this.samples.push({ price, timestamp: now });
    // Prune old samples
    this.samples = this.samples.filter(s => now - s.timestamp < this.windowMs);
  }

  getTWAP(): number | null {
    if (this.samples.length === 0) return null;
    const sum = this.samples.reduce((acc, s) => acc + s.price, 0);
    return sum / this.samples.length;
  }
}
```

## Multi-Feed Price Aggregation

Read multiple prices in a single transaction to reduce gas and ensure atomic reads.

### Solidity — Multi-Feed Read

```solidity
function getMultiplePrices(
    bytes[] calldata priceUpdate,
    bytes32[] calldata feedIds,
    uint maxAge
) external payable returns (PythStructs.Price[] memory) {
    // Single update covers all feeds
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);

    PythStructs.Price[] memory prices = new PythStructs.Price[](feedIds.length);
    for (uint i = 0; i < feedIds.length; i++) {
        prices[i] = pyth.getPriceNoOlderThan(feedIds[i], maxAge);
    }
    return prices;
}
```

### Using `parsePriceFeedUpdates` (More Efficient)

```solidity
function getMultiplePricesEfficient(
    bytes[] calldata priceUpdate,
    bytes32[] calldata feedIds,
    uint64 minPublishTime,
    uint64 maxPublishTime
) external payable returns (PythStructs.PriceFeed[] memory) {
    uint fee = pyth.getUpdateFee(priceUpdate);
    // parsePriceFeedUpdates returns specific feeds from the update data
    // More gas-efficient than updatePriceFeeds + multiple getPriceNoOlderThan
    return pyth.parsePriceFeedUpdates{value: fee}(
        priceUpdate, feedIds, minPublishTime, maxPublishTime
    );
}
```

## Price Feed Fallback Chains

Gracefully handle feed unavailability with fallback strategies.

### Solidity — Fallback Pattern

```solidity
function getPriceWithFallback(
    bytes[] calldata priceUpdate,
    bytes32 primaryFeedId,
    bytes32 fallbackFeedId,
    uint maxAge
) external payable returns (int64 price, int32 expo, bool usedFallback) {
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);

    // Try primary feed
    try pyth.getPriceNoOlderThan(primaryFeedId, maxAge) returns (PythStructs.Price memory p) {
        return (p.price, p.expo, false);
    } catch {}

    // Fall back to secondary feed
    try pyth.getPriceNoOlderThan(fallbackFeedId, maxAge) returns (PythStructs.Price memory p) {
        return (p.price, p.expo, true);
    } catch {}

    // Both failed
    revert("No price available");
}
```

### Solidity — EMA Fallback

```solidity
function getPriceOrEMA(bytes32 feedId, uint maxAge) internal view returns (PythStructs.Price memory) {
    // Try spot price first
    try pyth.getPriceNoOlderThan(feedId, maxAge) returns (PythStructs.Price memory p) {
        return p;
    } catch {}

    // Fall back to EMA (more stable, slightly older)
    return pyth.getEmaPriceNoOlderThan(feedId, maxAge * 2);
}
```

## Circuit Breaker Pattern

Reject operations when prices move too drastically between updates.

```solidity
contract PriceCircuitBreaker {
    IPyth public pyth;
    bytes32 public feedId;

    int64 public lastKnownPrice;
    uint256 public maxDeviationBps;  // e.g., 1000 = 10%

    event CircuitBreakerTripped(int64 oldPrice, int64 newPrice, uint256 deviationBps);

    function updateAndCheck(bytes[] calldata priceUpdate) external payable returns (bool safe) {
        uint fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        PythStructs.Price memory p = pyth.getPriceNoOlderThan(feedId, 30);

        if (lastKnownPrice != 0) {
            int256 diff = int256(p.price) - int256(lastKnownPrice);
            if (diff < 0) diff = -diff;
            uint256 deviationBps = uint256(diff * 10000) / uint256(int256(lastKnownPrice));

            if (deviationBps > maxDeviationBps) {
                emit CircuitBreakerTripped(lastKnownPrice, p.price, deviationBps);
                return false; // Circuit breaker tripped
            }
        }

        lastKnownPrice = p.price;
        return true;
    }
}
```

## Keeper / Scheduler Pattern

Automatically push price updates on-chain at regular intervals.

### TypeScript — Cron Keeper

```typescript
import { ethers } from "ethers";
import { HermesClient } from "@pythnetwork/hermes-client";

async function keeperLoop(
  pythContract: ethers.Contract,
  feedIds: string[],
  intervalMs: number = 30_000
) {
  const hermes = new HermesClient("https://hermes.pyth.network");

  while (true) {
    try {
      const updates = await hermes.getLatestPriceUpdates(feedIds);
      const updateData = updates.binary.data.map(d => "0x" + d);
      const fee = await pythContract.getUpdateFee(updateData);

      const tx = await pythContract.updatePriceFeeds(updateData, { value: fee });
      await tx.wait();
      console.log(`[Keeper] Updated ${feedIds.length} feeds — tx: ${tx.hash}`);
    } catch (err) {
      console.error("[Keeper] Error:", err);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
```

See `assets/typescript/price-keeper.ts` for a full production-ready keeper with health checks, retry logic, and gas management.

## Confidence-Weighted Pricing

Use confidence intervals for risk-adjusted pricing in DeFi protocols.

### Conservative Valuation (Lending)

```solidity
// For COLLATERAL: use the lowest likely price (pessimistic for lender)
int64 collateralPrice = price.price - int64(price.conf);

// For DEBT: use the highest likely price (pessimistic for lender)
int64 debtPrice = price.price + int64(price.conf);

// Wider confidence = wider spread = more conservative
```

### Confidence Gating

```solidity
// Reject trades when market is too uncertain
function requireTightSpread(PythStructs.Price memory p, uint64 maxConfBps) internal pure {
    // conf as % of price
    uint256 confBps = (uint256(p.conf) * 10000) / uint256(int256(p.price > 0 ? p.price : -p.price));
    require(confBps <= maxConfBps, "Spread too wide");
}
```

## Cross-Rate Derivation

Derive any pair from two USD-denominated feeds.

### General Formula

```
ETH/EUR = (ETH/USD) / (EUR/USD)

price = (basePrice × 10^baseExpo) / (quotePrice × 10^quoteExpo)
```

### Confidence Propagation

```
combined_conf = |basePrice/quotePrice| × sqrt((baseConf/basePrice)² + (quoteConf/quotePrice)²)
```

See `assets/solidity/CrossRate.sol` for the full Solidity implementation.

## Market Hours Awareness

Handle equity and FX feeds that go stale outside trading hours.

```typescript
function isLikelyTrading(feedSymbol: string): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();

  // Weekend check
  if (utcDay === 0 || utcDay === 6) {
    // Crypto trades 24/7, equities/FX don't
    if (feedSymbol.startsWith("Equity.") || feedSymbol.startsWith("FX.")) {
      return false;
    }
  }

  // US equities: ~14:30-21:00 UTC (9:30-4:00 ET)
  if (feedSymbol.startsWith("Equity.")) {
    return utcHour >= 14 && utcHour < 21;
  }

  // FX: Sun 22:00 UTC to Fri 22:00 UTC
  if (feedSymbol.startsWith("FX.")) {
    if (utcDay === 0 && utcHour < 22) return false;
    if (utcDay === 5 && utcHour >= 22) return false;
    if (utcDay === 6) return false;
    return true;
  }

  return true; // Crypto is 24/7
}
```

### Solidity — Adaptive Staleness

```solidity
function getMaxAge(bytes32 feedId, bool isCrypto) internal pure returns (uint) {
    if (isCrypto) return 30;       // 30 seconds for crypto
    return 86400;                  // 24 hours for equity/FX (across market close)
}
```

## Gas Optimization Tips

1. **Use `parsePriceFeedUpdates`** instead of `updatePriceFeeds` + `getPriceNoOlderThan` when you need specific feeds — saves ~5,000 gas per feed
2. **Batch updates** — One `updatePriceFeeds` call with multiple feeds is cheaper than multiple calls
3. **Cache feed IDs** — Store `bytes32` feed IDs as `immutable` or `constant` in contracts
4. **Minimize storage writes** — Only store prices you need to persist; use `memory` for intermediate reads
5. **Refund excess ETH** — Always refund `msg.value - fee` to the caller

## Price Scheduling with Gelato / OpenZeppelin Defender

For automated price pushing without running your own keeper:

```typescript
// Gelato Web3 Function
const { ethers } = require("ethers");

Web3Function.onRun(async (context) => {
  const { provider, multiChainProvider } = context;
  const pythAddress = "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C";

  // Fetch fresh update from Hermes
  const resp = await fetch(
    "https://hermes.pyth.network/v2/updates/price/latest?ids[]=ff61491a..."
  );
  const data = await resp.json();
  const updateData = data.binary.data.map(d => "0x" + d);

  // Build transaction
  const iface = new ethers.Interface(["function updatePriceFeeds(bytes[]) payable"]);
  const callData = iface.encodeFunctionData("updatePriceFeeds", [updateData]);

  return { canExec: true, callData: [{ to: pythAddress, data: callData }] };
});
```
