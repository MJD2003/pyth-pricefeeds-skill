# Pyth Price Feeds API Reference

## Solidity SDK

Install: `npm install @pythnetwork/pyth-sdk-solidity`

Remappings (Foundry): `@pythnetwork/pyth-sdk-solidity/=node_modules/@pythnetwork/pyth-sdk-solidity`

## IPyth Interface

Source: [IPyth.sol](https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/sdk/solidity/IPyth.sol)

### PythStructs.Price

```solidity
struct Price {
    int64 price;        // Price value in fixed-point representation
    uint64 conf;        // Confidence interval (± around the price)
    int32 expo;         // Exponent: real_price = price × 10^expo
    uint publishTime;   // Unix timestamp of the price update
}
```

**Example:** `price = 12276250`, `expo = -5` → Real price = `12276250 × 10^(-5)` = `$122.76250`

### updatePriceFeeds — Submit Price Updates

```solidity
function updatePriceFeeds(bytes[] calldata updateData) external payable;
```

Submit price update data fetched from Hermes to update on-chain prices. Requires payment of the update fee.

- `updateData` — Array of binary price update messages from Hermes
- Must send `msg.value >= getUpdateFee(updateData)`
- Reverts with `InsufficientFee` if insufficient payment
- Safe to call with stale data — only updates if newer than current on-chain price

### parsePriceFeedUpdates — Update and Parse in One Call

```solidity
function parsePriceFeedUpdates(
    bytes[] calldata updateData,
    bytes32[] calldata priceIds,
    uint64 minPublishTime,
    uint64 maxPublishTime
) external payable returns (PythStructs.PriceFeed[] memory priceFeeds);
```

Atomic update + parse. Useful when you need the exact prices from the update data.

### parsePriceFeedUpdatesUnique — Single Latest Price Per Feed

```solidity
function parsePriceFeedUpdatesUnique(
    bytes[] calldata updateData,
    bytes32[] calldata priceIds,
    uint64 minPublishTime,
    uint64 maxPublishTime
) external payable returns (PythStructs.PriceFeed[] memory priceFeeds);
```

Like `parsePriceFeedUpdates` but returns at most one price per feed (the most recent).

### getPriceNoOlderThan — Read Price with Staleness Check

```solidity
function getPriceNoOlderThan(
    bytes32 id,
    uint age
) external view returns (PythStructs.Price memory price);
```

Returns the most recent price for the given feed ID, provided it is no older than `age` seconds.

- **Reverts** with `StalePrice` (0x19abf40e) if the on-chain price is too old
- **Reverts** with `PriceFeedNotFound` if the feed ID doesn't exist
- This is the **recommended** method for reading prices

### getPriceUnsafe — Read Price Without Staleness Check

```solidity
function getPriceUnsafe(
    bytes32 id
) external view returns (PythStructs.Price memory price);
```

Returns the most recent price regardless of age. **Use with caution** — always add your own staleness check.

### getEmaPriceNoOlderThan — Read EMA Price

```solidity
function getEmaPriceNoOlderThan(
    bytes32 id,
    uint age
) external view returns (PythStructs.Price memory price);
```

Returns the exponential moving average (EMA) price. Useful for smoother price readings in lending protocols.

### getEmaPriceUnsafe — Read EMA Price Without Staleness Check

```solidity
function getEmaPriceUnsafe(
    bytes32 id
) external view returns (PythStructs.Price memory price);
```

### getUpdateFee — Calculate Required Fee

```solidity
function getUpdateFee(
    bytes[] calldata updateData
) external view returns (uint feeAmount);
```

Returns the fee required to update the given price data. Must be paid as `msg.value` when calling `updatePriceFeeds`.

### getValidTimePeriod

```solidity
function getValidTimePeriod() external view returns (uint validTimePeriod);
```

Returns the default validity period (in seconds) for price updates.

## PythStructs

```solidity
struct PriceFeed {
    bytes32 id;       // Price feed ID
    Price price;      // Current price
    Price emaPrice;   // Exponential moving average price
}
```

## Error Codes (EVM)

| Error | Selector | Description |
|-------|----------|-------------|
| `StalePrice` | `0x19abf40e` | Price is older than the requested `maxAge` |
| `PriceFeedNotFound` | `0x14aebe68` | No price feed exists for the given ID |
| `InsufficientFee` | `0x025dbdd4` | `msg.value` is less than `getUpdateFee()` |
| `NoFreshUpdate` | `0xde9b9650` | Price update does not contain a sufficiently recent update |
| `InvalidUpdateDataSource` | N/A | Update data is not from a valid Pyth source |
| `InvalidUpdateData` | N/A | Update data is malformed |

## Hermes REST API

Base URL: `https://hermes.pyth.network`

### GET /v2/updates/price/latest

Fetch the latest price updates for one or more feed IDs.

```
GET /v2/updates/price/latest?ids[]=<feedId1>&ids[]=<feedId2>&encoding=hex&parsed=true
```

**Parameters:**
- `ids[]` — One or more price feed IDs (with or without `0x` prefix)
- `encoding` — `hex` (default) or `base64`
- `parsed` — `true` to include parsed price data in response

**Response:**
```json
{
  "binary": {
    "encoding": "hex",
    "data": ["<hex-encoded update data>"]
  },
  "parsed": [
    {
      "id": "ff61491a...",
      "price": { "price": "238955000000", "conf": "119477500", "expo": -8, "publish_time": 1711234567 },
      "ema_price": { "price": "238800000000", "conf": "100000000", "expo": -8, "publish_time": 1711234567 }
    }
  ]
}
```

The `binary.data` array contains the encoded update data to submit on-chain.

### GET /v2/updates/price/stream

Server-Sent Events (SSE) endpoint for real-time price streaming.

```
GET /v2/updates/price/stream?ids[]=<feedId>&encoding=hex&parsed=true
```

- Connection auto-closes after 24 hours
- Implement reconnection logic for continuous updates
- Each event contains the same structure as `/latest`

### GET /v2/price_feeds

Search for price feeds by name or asset class.

```
GET /v2/price_feeds?query=btc&asset_type=crypto
```

**Parameters:**
- `query` — Search term (e.g., "btc", "eth", "aapl")
- `asset_type` — Filter by type: `crypto`, `equity`, `fx`, `metal`, `commodities`

## HermesClient TypeScript SDK

Install: `npm install @pythnetwork/hermes-client`

```typescript
import { HermesClient } from "@pythnetwork/hermes-client";

const client = new HermesClient("https://hermes.pyth.network");

// Fetch latest prices
const updates = await client.getLatestPriceUpdates(["0xff61...", "0xe62d..."]);
// updates.binary.data — array of hex-encoded update data for on-chain submission
// updates.parsed — array of parsed price objects

// Search for feeds
const feeds = await client.getPriceFeeds("btc", "crypto");

// Stream prices via SSE
const eventSource = await client.getStreamingPriceUpdates(["0xff61..."]);
eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log(data.parsed);
};
```

## Benchmarks API (Historical Prices)

Base URL: `https://benchmarks.pyth.network`

### GET /v1/shims/tradingview/history

TradingView-compatible historical price data.

```
GET /v1/shims/tradingview/history?symbol=Crypto.BTC/USD&resolution=1D&from=1700000000&to=1711234567
```

### GET /v2/updates/price/{publish_time}

Get the price update data for a specific timestamp.

```
GET /v2/updates/price/1711234567?ids[]=0xff61...&encoding=hex
```

## Solana SDK

### Rust (Anchor)

```toml
[dependencies]
pyth-solana-receiver-sdk = "0.4.0"
```

Key types:
- `PriceUpdateV2` — Account type holding verified price data
- `get_price_no_older_than(&clock, max_age, &feed_id)` — Read price with staleness check
- `get_feed_id_from_hex("0xff61...")` — Convert hex string to `[u8; 32]`

### TypeScript (Frontend)

```bash
npm install @pythnetwork/hermes-client @pythnetwork/pyth-solana-receiver
```

Key functions:
- `HermesClient.getLatestPriceUpdates(ids, { encoding: "base64" })` — Fetch for Solana
- `PythSolanaReceiver.postPriceUpdateInstructions(updateData)` — Create update instructions
