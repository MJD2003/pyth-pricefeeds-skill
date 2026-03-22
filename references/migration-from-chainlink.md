# Migrating from Chainlink to Pyth

## Key Differences

| Aspect | Chainlink | Pyth |
|--------|-----------|------|
| **Model** | Push (nodes push to chain) | Pull (app fetches + pushes) or Push |
| **Latency** | Heartbeat + deviation trigger | Sub-second (pull) |
| **Cost** | Free to read (sponsors pay) | Fee per update (~$0.01) |
| **Feed ID** | Contract address per feed | 32-byte hex ID (same across chains) |
| **Price format** | `int256` with fixed decimals (8) | `int64 price` + `int32 expo` + `uint64 conf` |
| **Staleness** | `updatedAt` timestamp | `publishTime` + `getPriceNoOlderThan` |
| **Confidence** | None | Built-in confidence interval |
| **Coverage** | ~100 feeds per chain | 1000+ feeds, same IDs all chains |
| **Registration** | None | None |

## Step-by-Step Migration

### 1. Replace the Interface Import

```solidity
// BEFORE: Chainlink
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// AFTER: Pyth
import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
```

### 2. Replace the State Variable

```solidity
// BEFORE: Chainlink — one contract per feed
AggregatorV3Interface internal priceFeed;
constructor() {
    priceFeed = AggregatorV3Interface(0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419); // ETH/USD Ethereum
}

// AFTER: Pyth — single contract, feed ID parameter
IPyth internal pyth;
bytes32 internal feedId;
constructor(address _pyth, bytes32 _feedId) {
    pyth = IPyth(_pyth);
    feedId = _feedId;
}
```

### 3. Replace the Price Read

```solidity
// BEFORE: Chainlink
function getPrice() public view returns (int256) {
    (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
    require(block.timestamp - updatedAt < 3600, "Stale price");
    return price; // 8 decimals (e.g., 200000000000 = $2000.00)
}

// AFTER: Pyth (pull model — needs price update data)
function getPrice(bytes[] calldata priceUpdate) public payable returns (int64, int32) {
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);

    PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 60);
    return (price.price, price.expo);
    // price.price = 200000000000, price.expo = -8 → $2000.00
}
```

### 4. Update Price Conversion

```solidity
// BEFORE: Chainlink (always 8 decimals for USD feeds)
uint256 priceInWei = uint256(price) * 1e10; // 8 → 18 decimals

// AFTER: Pyth (dynamic exponent)
function toWad(int64 price, int32 expo) internal pure returns (uint256) {
    if (expo >= 0) {
        return uint256(int256(price)) * (10 ** uint32(18 + expo));
    } else {
        uint32 absExpo = uint32(-expo);
        if (absExpo <= 18) {
            return uint256(int256(price)) * (10 ** (18 - absExpo));
        } else {
            return uint256(int256(price)) / (10 ** (absExpo - 18));
        }
    }
}
```

### 5. Add Price Update Flow to Frontend

Chainlink doesn't need frontend changes. Pyth pull model requires fetching update data from Hermes:

```typescript
// NEW: Fetch price update before calling contract
import { HermesClient } from "@pythnetwork/hermes-client";

const hermes = new HermesClient("https://hermes.pyth.network");
const feedId = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

async function callContractWithPrice(contract) {
  const updates = await hermes.getLatestPriceUpdates([feedId]);
  const updateData = updates.binary.data.map(d => "0x" + d);

  // Pass updateData to your contract function
  const fee = await contract.getUpdateFee(updateData);
  const tx = await contract.getPrice(updateData, { value: fee });
}
```

### 6. Map Feed Addresses to Feed IDs

| Pair | Chainlink (Ethereum) | Pyth Feed ID |
|------|---------------------|-------------|
| ETH/USD | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| BTC/USD | `0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c` | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| USDC/USD | `0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6` | `0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a` |
| DAI/USD | `0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9` | `0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e6f20c30188e` |
| SOL/USD | N/A (not on Ethereum) | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |

> Full mapping: Search dynamically via `https://hermes.pyth.network/v2/price_feeds?query=ETH`

## Common Migration Patterns

### Simple Read-Only → Pull Consumer

If your contract just reads a price (like a price display), convert to PullConsumer pattern. See `assets/solidity/PullConsumer.sol`.

### Chainlink Keeper-Updated → Push Consumer

If you had a Chainlink Keeper updating prices, you can either:
1. Switch to Pyth's push model (if the feed is push-supported)
2. Run your own keeper (see `assets/typescript/price-keeper.ts`)
3. Use Gelato / OpenZeppelin Defender (see `references/patterns.md`)

### Multi-Oracle (Chainlink + Pyth)

For extra safety, use both oracles and compare:

```solidity
function getVerifiedPrice(bytes[] calldata priceUpdate) external payable returns (int256) {
    // Get Chainlink price
    (, int256 clPrice, , , ) = chainlinkFeed.latestRoundData();

    // Get Pyth price
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);
    PythStructs.Price memory pythPrice = pyth.getPriceNoOlderThan(feedId, 60);
    int256 pythPriceScaled = int256(pythPrice.price) * int256(10 ** uint32(8 + pythPrice.expo));

    // Compare: reject if they differ by more than 2%
    int256 diff = clPrice > pythPriceScaled ? clPrice - pythPriceScaled : pythPriceScaled - clPrice;
    require(diff * 100 / clPrice < 2, "Oracle mismatch");

    return pythPriceScaled; // Use Pyth (fresher)
}
```

## Benefits After Migration

- **Faster prices** — Sub-second vs Chainlink's heartbeat (1-60 min)
- **Confidence data** — Know how tight/wide the market is
- **More feeds** — 1000+ vs ~100 per chain
- **Cross-chain** — Same feed IDs everywhere (no per-chain lookups)
- **Cheaper L2 deployment** — Single Pyth contract vs many Chainlink aggregators
- **EMA prices** — Built-in exponential moving average for smoothing
