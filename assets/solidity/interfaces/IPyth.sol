// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title IPyth Interface — Offline reference copy
/// @notice This is a reference copy of the Pyth IPyth interface for IDE autocompletion
///         and offline reading. For production use, import from the npm package:
///         import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
/// @dev Source: https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/sdk/solidity/IPyth.sol

import "./PythStructs.sol";

interface IPyth {
    /// @notice Update price feeds with given update messages.
    /// @param updateData Array of price update data from Hermes
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Returns the required fee to update an array of price updates.
    /// @param updateData Array of price update data
    /// @return feeAmount The required fee in wei
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount);

    /// @notice Returns the price that is no older than `age` seconds of the current time.
    /// @param id The Pyth Price Feed ID
    /// @param age Maximum acceptable age of the price in seconds
    /// @return price The price struct
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (PythStructs.Price memory price);

    /// @notice Returns the latest price regardless of age.
    /// @dev WARNING: This function does not check staleness. Only use for display, never for DeFi logic.
    /// @param id The Pyth Price Feed ID
    /// @return price The price struct
    function getPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory price);

    /// @notice Returns the exponentially-weighted moving average price no older than `age`.
    /// @param id The Pyth Price Feed ID
    /// @param age Maximum acceptable age in seconds
    /// @return price The EMA price struct
    function getEmaPriceNoOlderThan(bytes32 id, uint age) external view returns (PythStructs.Price memory price);

    /// @notice Returns the latest EMA price regardless of age.
    /// @param id The Pyth Price Feed ID
    /// @return price The EMA price struct
    function getEmaPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory price);

    /// @notice Returns the period within which a price is considered valid.
    /// @return validTimePeriod The valid time period in seconds
    function getValidTimePeriod() external view returns (uint validTimePeriod);

    /// @notice Parse and return specific price feeds from the update data.
    /// @dev More gas-efficient than updatePriceFeeds + getPriceNoOlderThan when reading specific feeds.
    /// @param updateData Array of price update data
    /// @param priceIds Array of price feed IDs to parse
    /// @param minPublishTime Minimum accepted publish time
    /// @param maxPublishTime Maximum accepted publish time
    /// @return priceFeeds Array of parsed price feeds
    function parsePriceFeedUpdates(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PythStructs.PriceFeed[] memory priceFeeds);
}
