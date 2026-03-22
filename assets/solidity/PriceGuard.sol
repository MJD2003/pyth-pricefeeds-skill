// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title PriceGuard — Circuit breaker and price deviation guard for Pyth Price Feeds
/// @notice Protects DeFi protocols from flash crashes, oracle manipulation, and stale data.
///         Tracks price history and rejects updates that deviate too much from recent values.
/// @dev Adapt the deviation thresholds and cooldown periods to your protocol's risk profile.

abstract contract PriceGuard {
    IPyth public immutable pyth;

    // ─── Circuit Breaker State ──────────────────────────

    struct FeedGuard {
        int64 lastPrice;
        uint256 lastUpdateTime;
        bool circuitBroken;
        uint256 circuitBrokenUntil;
    }

    mapping(bytes32 => FeedGuard) public feedGuards;

    /// @notice Max allowed price deviation in basis points (e.g., 1000 = 10%)
    uint256 public maxDeviationBps;

    /// @notice How long the circuit breaker stays tripped (seconds)
    uint256 public circuitBreakerCooldown;

    /// @notice Max allowed confidence interval as % of price (bps). 0 = disabled
    uint256 public maxConfidenceBps;

    // ─── Events ─────────────────────────────────────────

    event CircuitBreakerTripped(
        bytes32 indexed feedId,
        int64 oldPrice,
        int64 newPrice,
        uint256 deviationBps
    );

    event CircuitBreakerReset(bytes32 indexed feedId);

    event PriceAccepted(
        bytes32 indexed feedId,
        int64 price,
        uint64 conf,
        uint256 publishTime
    );

    // ─── Constructor ────────────────────────────────────

    constructor(
        address _pyth,
        uint256 _maxDeviationBps,
        uint256 _circuitBreakerCooldown,
        uint256 _maxConfidenceBps
    ) {
        pyth = IPyth(_pyth);
        maxDeviationBps = _maxDeviationBps;
        circuitBreakerCooldown = _circuitBreakerCooldown;
        maxConfidenceBps = _maxConfidenceBps;
    }

    // ─── Guarded Price Read ─────────────────────────────

    /// @notice Update and read a price with circuit breaker protection.
    /// @param priceUpdate The Hermes price update data
    /// @param feedId The price feed to read
    /// @param maxAge Maximum staleness in seconds
    /// @return price The validated PythStructs.Price
    function getGuardedPrice(
        bytes[] calldata priceUpdate,
        bytes32 feedId,
        uint256 maxAge
    ) internal returns (PythStructs.Price memory price) {
        // Update on-chain prices
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        // Read the price
        price = pyth.getPriceNoOlderThan(feedId, maxAge);

        // Check circuit breaker
        FeedGuard storage guard = feedGuards[feedId];

        // If circuit is broken and cooldown hasn't passed, revert
        if (guard.circuitBroken && block.timestamp < guard.circuitBrokenUntil) {
            revert("PriceGuard: circuit breaker active");
        }

        // Reset circuit breaker if cooldown passed
        if (guard.circuitBroken && block.timestamp >= guard.circuitBrokenUntil) {
            guard.circuitBroken = false;
            emit CircuitBreakerReset(feedId);
        }

        // Check confidence interval width
        if (maxConfidenceBps > 0) {
            int256 absPrice = price.price > 0 ? int256(price.price) : -int256(price.price);
            if (absPrice > 0) {
                uint256 confBps = (uint256(price.conf) * 10000) / uint256(absPrice);
                require(confBps <= maxConfidenceBps, "PriceGuard: confidence too wide");
            }
        }

        // Check deviation from last known price
        if (guard.lastPrice != 0) {
            int256 diff = int256(price.price) - int256(guard.lastPrice);
            if (diff < 0) diff = -diff;

            int256 absLast = guard.lastPrice > 0 ? int256(guard.lastPrice) : -int256(guard.lastPrice);
            uint256 deviationBps = absLast > 0
                ? (uint256(diff) * 10000) / uint256(absLast)
                : 0;

            if (deviationBps > maxDeviationBps) {
                guard.circuitBroken = true;
                guard.circuitBrokenUntil = block.timestamp + circuitBreakerCooldown;

                emit CircuitBreakerTripped(feedId, guard.lastPrice, price.price, deviationBps);
                revert("PriceGuard: price deviation too large");
            }
        }

        // Accept the price
        guard.lastPrice = price.price;
        guard.lastUpdateTime = block.timestamp;

        emit PriceAccepted(feedId, price.price, price.conf, price.publishTime);
    }

    /// @notice Check if a feed's circuit breaker is currently active.
    function isCircuitBroken(bytes32 feedId) external view returns (bool) {
        FeedGuard storage guard = feedGuards[feedId];
        return guard.circuitBroken && block.timestamp < guard.circuitBrokenUntil;
    }

    /// @notice Get time remaining on circuit breaker cooldown.
    function circuitBreakerTimeLeft(bytes32 feedId) external view returns (uint256) {
        FeedGuard storage guard = feedGuards[feedId];
        if (!guard.circuitBroken || block.timestamp >= guard.circuitBrokenUntil) {
            return 0;
        }
        return guard.circuitBrokenUntil - block.timestamp;
    }

    // ─── Admin Functions (Override in Child) ─────────────

    /// @notice Manually reset the circuit breaker. Override with access control.
    function _resetCircuitBreaker(bytes32 feedId) internal {
        feedGuards[feedId].circuitBroken = false;
        feedGuards[feedId].circuitBrokenUntil = 0;
        emit CircuitBreakerReset(feedId);
    }

    /// @notice Update deviation threshold. Override with access control.
    function _setMaxDeviationBps(uint256 _maxDeviationBps) internal {
        maxDeviationBps = _maxDeviationBps;
    }
}
