# Debugging Pyth Price Feeds

## Error Diagnosis Checklist

When a Pyth price feed call fails, work through these in order:

1. **StalePrice (0x19abf40e)** — Most common. Price not updated on-chain recently enough.
2. **InsufficientFee** — `msg.value` too low for `updatePriceFeeds`.
3. **PriceFeedNotFound** — Wrong feed ID or feed not available on this chain.
4. **InvalidUpdateData** — Corrupted or wrong update data from Hermes.
5. **Market closed** — Asset not trading during this time period.

## StalePrice Error (0x19abf40e)

This is the **#1 most common error** with Pyth Price Feeds.

### Cause
`getPriceNoOlderThan(feedId, maxAge)` reverts because the on-chain price is older than `maxAge` seconds.

### Fix: Pull Integration

You must update the price before reading it:

```solidity
// WRONG — will revert if no one has updated recently
function getPrice() external view returns (PythStructs.Price memory) {
    return pyth.getPriceNoOlderThan(ETH_USD, 60);
}

// RIGHT — update then read
function getPrice(bytes[] calldata priceUpdate) external payable returns (PythStructs.Price memory) {
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);
    return pyth.getPriceNoOlderThan(ETH_USD, 60);
}
```

### Fix: Push Integration

If using push feeds, ensure:
1. Your feed is in the [push feeds list](https://docs.pyth.network/price-feeds/push-feeds)
2. A price pusher is actively updating the feed on your chain
3. Increase `maxAge` if the pusher updates less frequently

### Fix: Off-chain

Your frontend/backend must fetch from Hermes and include the update in the transaction:

```typescript
const hermes = new HermesClient("https://hermes.pyth.network");
const updates = await hermes.getLatestPriceUpdates(["0xff61..."]);
const updateData = updates.binary.data.map(d => "0x" + d);
// Pass updateData to your contract function
```

## InsufficientFee Error

### Cause
`msg.value` is less than what `getUpdateFee(priceUpdate)` returns.

### Fix
Always read the fee dynamically:

```solidity
// WRONG — hardcoded fee
pyth.updatePriceFeeds{value: 0.001 ether}(priceUpdate);

// RIGHT — dynamic fee
uint fee = pyth.getUpdateFee(priceUpdate);
pyth.updatePriceFeeds{value: fee}(priceUpdate);
```

In the frontend:
```typescript
const fee = await pythContract.getUpdateFee(updateData);
await contract.myFunction(updateData, { value: fee });
```

## PriceFeedNotFound Error

### Cause
The feed ID doesn't exist on the Pyth contract for this chain.

### Fix
1. Verify feed ID from https://docs.pyth.network/price-feeds/price-feeds
2. Ensure you're using the `Stable` feed (not `Beta`)
3. Check the feed ID has the `0x` prefix in Solidity
4. Ensure you're querying the right Pyth contract address for your chain

```solidity
// Common mistake: missing 0x prefix (Solidity will not compile)
bytes32 feedId = ff61491a...; // WRONG
bytes32 feedId = 0xff61491a...; // RIGHT
```

## Invalid Update Data

### Cause
The `priceUpdate` bytes are corrupted, expired, or not from a valid Pyth source.

### Fix
1. Fetch fresh data from Hermes immediately before the transaction
2. Ensure correct encoding (`hex` for EVM, `base64` for Solana)
3. Don't cache update data for too long (it becomes stale)
4. Verify the Hermes endpoint URL is correct

## Common Integration Mistakes

### 1. Forgetting to Pay the Update Fee

```solidity
// WRONG — no fee sent
pyth.updatePriceFeeds(priceUpdate);

// RIGHT — fee included
uint fee = pyth.getUpdateFee(priceUpdate);
pyth.updatePriceFeeds{value: fee}(priceUpdate);
```

### 2. Not Forwarding msg.value for the Fee

```solidity
// WRONG — user's msg.value isn't forwarded
function swap(bytes[] calldata priceUpdate) external payable {
    pyth.updatePriceFeeds(priceUpdate); // No value sent!
}

// RIGHT — forward the fee
function swap(bytes[] calldata priceUpdate) external payable {
    uint fee = pyth.getUpdateFee(priceUpdate);
    pyth.updatePriceFeeds{value: fee}(priceUpdate);
    // ... use remaining msg.value for the swap
}
```

### 3. Ignoring the Exponent

```solidity
// WRONG — treating raw price as dollars
uint256 priceInDollars = uint256(uint64(price.price)); // NOT dollars!

// RIGHT — apply exponent
// price.price = 238955000000, price.expo = -8
// Real price = 238955000000 * 10^(-8) = $2389.55
uint256 priceWith18Decimals = uint256(uint64(price.price)) * 10**(18 + uint32(-price.expo));
```

### 4. Not Handling Negative Prices

Some feeds (futures, interest rates) can have negative prices:

```solidity
// WRONG — will revert on negative price
uint256 p = uint256(uint64(price.price));

// RIGHT — check sign
require(price.price > 0, "Negative price not supported");
uint256 p = uint256(uint64(price.price));
```

### 5. Hardcoding Feed IDs Without Verification

```solidity
// WRONG — hardcoded without comments, easy to confuse
bytes32 constant FEED = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;

// RIGHT — documented and verifiable
bytes32 constant ETH_USD_FEED = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
// Verify at: https://docs.pyth.network/price-feeds/price-feeds
```

### 6. Using getPriceUnsafe in Production

```solidity
// DANGEROUS — no staleness check
PythStructs.Price memory price = pyth.getPriceUnsafe(feedId);

// SAFE — staleness-protected
PythStructs.Price memory price = pyth.getPriceNoOlderThan(feedId, 60);
```

## Testing Checklist

1. **Test with MockPyth** — Use `@pythnetwork/pyth-sdk-solidity/MockPyth.sol` for unit tests
2. **Test stale prices** — Ensure your contract handles `StalePrice` gracefully
3. **Test fee forwarding** — Verify `msg.value` is correctly forwarded
4. **Test negative exponents** — Most prices have `expo = -8`
5. **Test market hours** — Equity/FX feeds may be stale outside market hours
6. **Test confidence** — High confidence intervals during volatility
7. **Test on testnet** — Deploy to a testnet with real Pyth prices before mainnet

## Useful Tools

- **Hermes API Docs**: https://hermes.pyth.network/docs/ — Interactive API explorer
- **Price Feeds List**: https://docs.pyth.network/price-feeds/price-feeds — Find feed IDs
- **Pyth Explorer**: https://pyth.network/price-feeds — Real-time price viewer
- **Error Codes (EVM)**: https://docs.pyth.network/price-feeds/error-codes/evm
- **Error Codes (SVM)**: https://docs.pyth.network/price-feeds/error-codes/svm

## Hermes Rate Limits

The public Hermes instance has rate limits:
- **REST**: Limited requests per minute
- **SSE**: Connection auto-closes after 24 hours

For production apps, consider:
1. Using a third-party Hermes provider (see https://docs.pyth.network/price-feeds/api-instances-and-providers)
2. Implementing reconnection logic for SSE streams
3. Caching Hermes responses briefly (1-5 seconds)
4. Batching multiple feed requests into single API calls
