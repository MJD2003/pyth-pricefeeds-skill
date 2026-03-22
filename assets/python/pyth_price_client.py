"""
Pyth Price Feeds — Python client.

Install: pip install httpx

Optional for on-chain interaction: pip install web3

This template shows how to:
  1. Fetch prices from Hermes REST API
  2. Stream prices via SSE
  3. Convert fixed-point prices to Python floats
  4. (Optional) Submit updates on-chain via web3.py

Adapt to your project's patterns.
"""

import httpx
import json
import time
from typing import Optional
from dataclasses import dataclass

# ─── Configuration ──────────────────────────────────────

HERMES_URL = "https://hermes.pyth.network"

# Common feed IDs
FEED_IDS = {
    "BTC/USD": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    "ETH/USD": "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    "SOL/USD": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "USDC/USD": "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a",
}

# ─── Types ──────────────────────────────────────────────


@dataclass
class PythPrice:
    """Parsed Pyth price with human-readable values."""
    feed_id: str
    price: float
    confidence: float
    expo: int
    publish_time: int
    raw_price: int
    raw_conf: int

    @property
    def lower_bound(self) -> float:
        return self.price - self.confidence

    @property
    def upper_bound(self) -> float:
        return self.price + self.confidence

    @property
    def confidence_percent(self) -> float:
        if self.price == 0:
            return 0
        return abs(self.confidence / self.price) * 100


# ─── Core Functions ─────────────────────────────────────


def pyth_to_float(price: int, expo: int) -> float:
    """Convert Pyth fixed-point price to Python float."""
    return price * (10 ** expo)


def parse_price(parsed: dict) -> PythPrice:
    """Parse a Hermes API price response into a PythPrice object."""
    p = parsed["price"]
    raw_price = int(p["price"])
    raw_conf = int(p["conf"])
    expo = int(p["expo"])

    return PythPrice(
        feed_id=parsed["id"],
        price=pyth_to_float(raw_price, expo),
        confidence=pyth_to_float(raw_conf, expo),
        expo=expo,
        publish_time=int(p["publish_time"]),
        raw_price=raw_price,
        raw_conf=raw_conf,
    )


def fetch_latest_prices(feed_ids: list[str]) -> tuple[list[PythPrice], list[str]]:
    """
    Fetch the latest prices from Hermes.
    
    Returns:
        - List of parsed PythPrice objects
        - List of hex-encoded update data (for on-chain submission)
    """
    params = [("ids[]", fid.replace("0x", "")) for fid in feed_ids]
    params.extend([("encoding", "hex"), ("parsed", "true")])

    response = httpx.get(f"{HERMES_URL}/v2/updates/price/latest", params=params)
    response.raise_for_status()
    data = response.json()

    prices = [parse_price(p) for p in data.get("parsed", [])]
    update_data = ["0x" + d for d in data.get("binary", {}).get("data", [])]

    return prices, update_data


def fetch_price(feed_id: str) -> PythPrice:
    """Fetch a single price."""
    prices, _ = fetch_latest_prices([feed_id])
    if not prices:
        raise ValueError(f"No price data for feed {feed_id}")
    return prices[0]


def get_update_data(feed_ids: list[str]) -> list[str]:
    """Fetch binary update data for on-chain submission."""
    _, update_data = fetch_latest_prices(feed_ids)
    return update_data


def search_feeds(query: str, asset_type: Optional[str] = None) -> list[dict]:
    """Search for price feeds by name."""
    params = {"query": query}
    if asset_type:
        params["asset_type"] = asset_type

    response = httpx.get(f"{HERMES_URL}/v2/price_feeds", params=params)
    response.raise_for_status()
    return response.json()


# ─── Dynamic Feed Discovery ─────────────────────────────


def fetch_all_feeds(asset_type: Optional[str] = None) -> list[dict]:
    """
    Fetch ALL available Pyth price feeds from Hermes.
    No hardcoding needed — discover feed IDs at runtime.

    Endpoint: https://hermes.pyth.network/v2/price_feeds

    Args:
        asset_type: Optional filter — "crypto", "equity", "fx", "metal", "commodities", "rates"

    Returns:
        List of feed dicts with 'id' and 'attributes' (symbol, asset_type, base, etc.)
    """
    params = {}
    if asset_type:
        params["asset_type"] = asset_type

    response = httpx.get(f"{HERMES_URL}/v2/price_feeds", params=params)
    response.raise_for_status()
    return response.json()


def resolve_feed_id(symbol: str) -> Optional[str]:
    """
    Resolve a human-readable symbol (e.g., "ETH/USD") to its Pyth feed ID dynamically.

    Returns:
        Feed ID with 0x prefix, or None if not found.
    """
    query = symbol.replace("/", "")
    feeds = search_feeds(query)
    normalized = symbol.upper()

    for feed in feeds:
        feed_symbol = (feed.get("attributes", {}).get("symbol", "") or "").upper()
        if feed_symbol == normalized or feed_symbol.endswith(f".{normalized}"):
            return "0x" + feed["id"]

    return None


def resolve_feed_ids(symbols: list[str]) -> dict[str, Optional[str]]:
    """
    Resolve multiple symbols to feed IDs in a single batch.

    Returns:
        Dict mapping symbol → feed ID (or None if not found).
    """
    all_feeds = fetch_all_feeds()
    result = {}

    for symbol in symbols:
        normalized = symbol.upper()
        match = None
        for feed in all_feeds:
            feed_symbol = (feed.get("attributes", {}).get("symbol", "") or "").upper()
            if feed_symbol == normalized or feed_symbol.endswith(f".{normalized}"):
                match = "0x" + feed["id"]
                break
        result[symbol] = match

    return result


def build_feed_registry() -> dict[str, list[dict]]:
    """
    Build a complete feed registry organized by asset type.

    Returns:
        Dict mapping asset_type → list of {id, symbol, base, quote}.
    """
    all_feeds = fetch_all_feeds()
    registry: dict[str, list[dict]] = {
        "crypto": [], "equity": [], "fx": [], "metal": [],
        "commodities": [], "rates": [], "other": [],
    }

    for feed in all_feeds:
        attrs = feed.get("attributes", {})
        asset_type = attrs.get("asset_type", "other")
        bucket = registry.get(asset_type, registry["other"])
        bucket.append({
            "id": "0x" + feed["id"],
            "symbol": attrs.get("symbol", feed["id"]),
            "base": attrs.get("base"),
            "quote": attrs.get("quote_currency"),
        })

    return registry


# ─── SSE Streaming ──────────────────────────────────────


def stream_prices(feed_ids: list[str], callback, duration_seconds: int = 60):
    """
    Stream real-time prices via Server-Sent Events.
    
    Args:
        feed_ids: List of feed IDs to stream
        callback: Function called with list of PythPrice on each update
        duration_seconds: How long to stream (default 60s)
    """
    params = "&".join(
        [f"ids[]={fid.replace('0x', '')}" for fid in feed_ids]
        + ["encoding=hex", "parsed=true"]
    )
    url = f"{HERMES_URL}/v2/updates/price/stream?{params}"

    start_time = time.time()

    with httpx.stream("GET", url) as response:
        for line in response.iter_lines():
            if time.time() - start_time > duration_seconds:
                break

            if not line or not line.startswith("data:"):
                continue

            try:
                data = json.loads(line[5:].strip())
                prices = [parse_price(p) for p in data.get("parsed", [])]
                if prices:
                    callback(prices)
            except (json.JSONDecodeError, KeyError):
                continue


# ─── Cross-Rate Derivation ──────────────────────────────


def derive_cross_rate(
    base_feed_id: str, quote_feed_id: str
) -> tuple[float, float]:
    """
    Derive a cross-rate from two USD-denominated feeds.
    Example: ETH/EUR = ETH/USD ÷ EUR/USD
    
    Returns: (cross_rate, cross_confidence)
    """
    prices, _ = fetch_latest_prices([base_feed_id, quote_feed_id])
    if len(prices) < 2:
        raise ValueError("Could not fetch both prices")

    base = prices[0]
    quote = prices[1]

    if quote.price == 0:
        raise ValueError("Quote price is zero")

    cross_rate = base.price / quote.price

    # Propagate confidence: relative errors add
    rel_conf_base = abs(base.confidence / base.price) if base.price != 0 else 0
    rel_conf_quote = abs(quote.confidence / quote.price) if quote.price != 0 else 0
    cross_conf = abs(cross_rate) * (rel_conf_base + rel_conf_quote)

    return cross_rate, cross_conf


# ─── On-Chain Interaction (web3.py) ─────────────────────


def update_on_chain(
    rpc_url: str,
    pyth_address: str,
    feed_ids: list[str],
    private_key: str,
):
    """
    Submit price updates on-chain using web3.py.
    
    Install: pip install web3
    """
    try:
        from web3 import Web3
    except ImportError:
        raise ImportError("pip install web3 required for on-chain interaction")

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = w3.eth.account.from_key(private_key)

    # Fetch update data
    update_data = get_update_data(feed_ids)
    update_bytes = [bytes.fromhex(d[2:]) for d in update_data]

    # Minimal Pyth ABI for updatePriceFeeds
    pyth_abi = [
        {
            "name": "getUpdateFee",
            "type": "function",
            "stateMutability": "view",
            "inputs": [{"name": "updateData", "type": "bytes[]"}],
            "outputs": [{"name": "", "type": "uint256"}],
        },
        {
            "name": "updatePriceFeeds",
            "type": "function",
            "stateMutability": "payable",
            "inputs": [{"name": "updateData", "type": "bytes[]"}],
            "outputs": [],
        },
    ]

    pyth = w3.eth.contract(address=pyth_address, abi=pyth_abi)

    # Get fee
    fee = pyth.functions.getUpdateFee(update_bytes).call()

    # Submit update
    tx = pyth.functions.updatePriceFeeds(update_bytes).build_transaction(
        {
            "from": account.address,
            "value": fee,
            "gas": 300000,
            "nonce": w3.eth.get_transaction_count(account.address),
        }
    )

    signed = w3.eth.account.sign_transaction(tx, private_key)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    print(f"Price update tx: {receipt.transactionHash.hex()}")
    return receipt


# ─── Usage Example ──────────────────────────────────────

if __name__ == "__main__":
    # 1. Fetch single price
    eth_price = fetch_price(FEED_IDS["ETH/USD"])
    print(f"ETH/USD: ${eth_price.price:.2f} ±${eth_price.confidence:.4f}")
    print(f"  Confidence: {eth_price.confidence_percent:.3f}%")
    print(f"  Range: ${eth_price.lower_bound:.2f} — ${eth_price.upper_bound:.2f}")

    # 2. Fetch multiple prices
    prices, update_data = fetch_latest_prices(list(FEED_IDS.values()))
    for p in prices:
        print(f"  {p.feed_id[:10]}...: ${p.price:.2f}")
    print(f"  Update data: {len(update_data)} items")

    # 3. Search for feeds
    results = search_feeds("btc", "crypto")
    print(f"\nFound {len(results)} BTC-related feeds")

    # 4. Derive cross-rate
    # ETH/BTC = ETH/USD ÷ BTC/USD
    cross, conf = derive_cross_rate(FEED_IDS["ETH/USD"], FEED_IDS["BTC/USD"])
    print(f"\nETH/BTC: {cross:.6f} ±{conf:.6f}")

    # 5. Stream real-time prices (10 seconds)
    print("\nStreaming ETH/USD for 10 seconds...")
    stream_prices(
        [FEED_IDS["ETH/USD"]],
        lambda prices: print(f"  ${prices[0].price:.2f}"),
        duration_seconds=10,
    )
