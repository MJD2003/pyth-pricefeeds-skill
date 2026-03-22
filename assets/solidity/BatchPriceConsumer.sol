// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title BatchPriceConsumer — Gas-optimized multi-feed price reading
/// @notice Reads multiple Pyth prices in a single transaction with efficient patterns.
///         Uses `parsePriceFeedUpdates` for gas savings over separate reads.
/// @dev Key optimization: `parsePriceFeedUpdates` is ~5k gas cheaper per feed
///      compared to `updatePriceFeeds` + `getPriceNoOlderThan` for each feed.

contract BatchPriceConsumer {
    IPyth public immutable pyth;

    // ─── Asset Registry ─────────────────────────────────

    struct Asset {
        bytes32 feedId;
        string symbol;
        uint256 maxAge;      // max staleness in seconds
        bool active;
    }

    Asset[] public assets;
    mapping(bytes32 => uint256) public feedIdToIndex;

    // ─── Events ─────────────────────────────────────────

    event AssetAdded(uint256 indexed index, bytes32 feedId, string symbol);
    event AssetRemoved(uint256 indexed index, bytes32 feedId);
    event BatchPriceUpdate(uint256 feedCount, uint256 gasUsed);

    // ─── Constructor ────────────────────────────────────

    constructor(address _pyth) {
        pyth = IPyth(_pyth);
    }

    // ─── Admin: Manage Assets ───────────────────────────

    function addAsset(bytes32 feedId, string calldata symbol, uint256 maxAge) external {
        uint256 index = assets.length;
        assets.push(Asset({
            feedId: feedId,
            symbol: symbol,
            maxAge: maxAge,
            active: true
        }));
        feedIdToIndex[feedId] = index;
        emit AssetAdded(index, feedId, symbol);
    }

    function removeAsset(uint256 index) external {
        require(index < assets.length, "Invalid index");
        bytes32 feedId = assets[index].feedId;
        assets[index].active = false;
        emit AssetRemoved(index, feedId);
    }

    // ─── Method 1: parsePriceFeedUpdates (Most Gas Efficient) ─

    /// @notice Read multiple prices using parsePriceFeedUpdates.
    /// @dev This is the most gas-efficient method for reading multiple feeds.
    ///      It parses specific feeds from the update data in one call.
    /// @param priceUpdate The Hermes price update data
    /// @param feedIds Which feeds to parse
    /// @param minPublishTime Minimum accepted publish time (typically block.timestamp - maxAge)
    /// @param maxPublishTime Maximum accepted publish time (typically block.timestamp)
    /// @return priceFeeds Array of parsed price feeds
    function batchReadEfficient(
        bytes[] calldata priceUpdate,
        bytes32[] calldata feedIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory priceFeeds) {
        uint256 gasStart = gasleft();

        uint256 fee = pyth.getUpdateFee(priceUpdate);
        priceFeeds = pyth.parsePriceFeedUpdates{value: fee}(
            priceUpdate,
            feedIds,
            minPublishTime,
            maxPublishTime
        );

        // Refund excess ETH
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }

        emit BatchPriceUpdate(feedIds.length, gasStart - gasleft());
    }

    // ─── Method 2: updatePriceFeeds + loop (Simpler) ────

    /// @notice Read multiple prices using update + individual reads.
    /// @dev Simpler but slightly more gas per feed.
    function batchReadSimple(
        bytes[] calldata priceUpdate,
        bytes32[] calldata feedIds,
        uint256 maxAge
    ) external payable returns (PythStructs.Price[] memory prices) {
        uint256 gasStart = gasleft();

        // Single update covers all feeds
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        // Read each feed
        prices = new PythStructs.Price[](feedIds.length);
        for (uint256 i = 0; i < feedIds.length; i++) {
            prices[i] = pyth.getPriceNoOlderThan(feedIds[i], maxAge);
        }

        // Refund
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }

        emit BatchPriceUpdate(feedIds.length, gasStart - gasleft());
    }

    // ─── Method 3: Read All Registered Assets ───────────

    /// @notice Read prices for all active registered assets.
    function readAllAssets(
        bytes[] calldata priceUpdate
    ) external payable returns (PythStructs.Price[] memory prices, bytes32[] memory feedIds) {
        // Collect active feed IDs
        uint256 activeCount = 0;
        for (uint256 i = 0; i < assets.length; i++) {
            if (assets[i].active) activeCount++;
        }

        feedIds = new bytes32[](activeCount);
        uint256[] memory maxAges = new uint256[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < assets.length; i++) {
            if (assets[i].active) {
                feedIds[j] = assets[i].feedId;
                maxAges[j] = assets[i].maxAge;
                j++;
            }
        }

        // Update all at once
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        // Read each
        prices = new PythStructs.Price[](activeCount);
        for (uint256 i = 0; i < activeCount; i++) {
            prices[i] = pyth.getPriceNoOlderThan(feedIds[i], maxAges[i]);
        }

        // Refund
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }
    }

    // ─── Helpers ────────────────────────────────────────

    /// @notice Convert a batch of Pyth prices to WAD (18 decimal) format.
    function toWadBatch(
        PythStructs.Price[] memory prices
    ) external pure returns (uint256[] memory wads) {
        wads = new uint256[](prices.length);
        for (uint256 i = 0; i < prices.length; i++) {
            wads[i] = _toWad(prices[i].price, prices[i].expo);
        }
    }

    function _toWad(int64 price, int32 expo) internal pure returns (uint256) {
        require(price > 0, "Negative price");
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

    function getAssetCount() external view returns (uint256) {
        return assets.length;
    }

    function getActiveAssetCount() external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < assets.length; i++) {
            if (assets[i].active) count++;
        }
        return count;
    }

    receive() external payable {}
}
