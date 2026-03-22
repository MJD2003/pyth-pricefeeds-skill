// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title PushConsumer
/// @notice Example push integration — reads prices directly from the Pyth contract
///         without needing to submit price updates. Requires a price pusher to keep
///         prices fresh on-chain.
/// @dev Use this pattern ONLY if your feed is in the push feeds list:
///      https://docs.pyth.network/price-feeds/push-feeds
///      Otherwise, use PullConsumer.sol instead.
contract PushConsumer {
    IPyth public immutable pyth;
    bytes32 public immutable priceFeedId;
    uint256 public constant MAX_PRICE_AGE = 60; // seconds

    constructor(address pythContract, bytes32 _priceFeedId) {
        pyth = IPyth(pythContract);
        priceFeedId = _priceFeedId;
    }

    /// @notice Read the latest on-chain price (push integration — no update needed)
    /// @dev Reverts with StalePrice if the on-chain price is older than MAX_PRICE_AGE.
    ///      This happens if the price pusher is down or the feed isn't in the push list.
    function getLatestPrice() external view returns (
        int64 price,
        uint64 conf,
        int32 expo,
        uint publishTime
    ) {
        PythStructs.Price memory p = pyth.getPriceNoOlderThan(priceFeedId, MAX_PRICE_AGE);
        return (p.price, p.conf, p.expo, p.publishTime);
    }

    /// @notice Read price with custom staleness tolerance
    function getPriceWithAge(uint256 maxAge) external view returns (PythStructs.Price memory) {
        return pyth.getPriceNoOlderThan(priceFeedId, maxAge);
    }

    /// @notice Read the EMA price (smoother, useful for lending)
    function getEmaPrice() external view returns (PythStructs.Price memory) {
        return pyth.getEmaPriceNoOlderThan(priceFeedId, MAX_PRICE_AGE);
    }

    /// @notice Check if the price is currently available (market open and pusher active)
    function isPriceAvailable() external view returns (bool) {
        try pyth.getPriceNoOlderThan(priceFeedId, MAX_PRICE_AGE) returns (PythStructs.Price memory) {
            return true;
        } catch {
            return false;
        }
    }

    /// @notice Get the last known price regardless of staleness (USE WITH CAUTION)
    /// @dev Only use for display purposes. Never use for DeFi logic without staleness checks.
    function getUnsafePrice() external view returns (PythStructs.Price memory) {
        return pyth.getPriceUnsafe(priceFeedId);
    }
}
