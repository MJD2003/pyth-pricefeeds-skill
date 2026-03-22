// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

/// @title PythStructs — Offline reference copy
/// @notice Reference copy of Pyth data structures for IDE autocompletion and offline reading.
///         For production use, import from the npm package:
///         import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
/// @dev Source: https://github.com/pyth-network/pyth-crosschain/blob/main/target_chains/ethereum/sdk/solidity/PythStructs.sol

library PythStructs {
    /// @notice A price with a degree of uncertainty, represented as a price ± confidence interval.
    /// @dev The price and confidence are stored as fixed-point numbers with the given exponent.
    ///      real_price = price × 10^expo
    ///      real_conf  = conf  × 10^expo
    struct Price {
        /// @notice Price value (fixed-point, apply expo)
        int64 price;
        /// @notice Confidence interval around the price (fixed-point, apply expo)
        uint64 conf;
        /// @notice Exponent for fixed-point conversion
        /// @dev Typically negative, e.g., -8 means 8 decimal places
        int32 expo;
        /// @notice Unix timestamp of when this price was published
        uint publishTime;
    }

    /// @notice A complete price feed containing both spot and EMA prices.
    struct PriceFeed {
        /// @notice The price feed ID (unique 32-byte identifier)
        bytes32 id;
        /// @notice The current spot price
        Price price;
        /// @notice The exponentially-weighted moving average price
        Price emaPrice;
    }
}
