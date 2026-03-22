// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title PythPriceFeedBase
/// @notice Abstract base contract for consuming Pyth Price Feeds.
///         Inherit this and implement your application logic.
/// @dev Reference pattern — adapt naming, style, and structure to match your project.
abstract contract PythPriceFeedBase {
    IPyth public immutable pyth;

    error InsufficientFee(uint256 required, uint256 provided);
    error StalePrice(bytes32 feedId, uint256 publishTime, uint256 currentTime);
    error NegativePrice(bytes32 feedId, int64 price);
    error PriceUncertain(bytes32 feedId, uint64 conf, int64 price);

    constructor(address pythContract) {
        pyth = IPyth(pythContract);
    }

    // ──────────────────────────────────────────────
    // Price update helpers
    // ──────────────────────────────────────────────

    /// @notice Update prices on-chain. Must be called before reading fresh prices (pull model).
    /// @param priceUpdate The encoded price update data from Hermes
    function _updatePrices(bytes[] calldata priceUpdate) internal {
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);
    }

    /// @notice Get the fee required to update prices
    function getUpdateFee(bytes[] calldata priceUpdate) external view returns (uint256) {
        return pyth.getUpdateFee(priceUpdate);
    }

    // ──────────────────────────────────────────────
    // Price reading helpers
    // ──────────────────────────────────────────────

    /// @notice Read a price with staleness protection
    /// @param feedId The Pyth price feed ID
    /// @param maxAge Maximum acceptable age in seconds
    function _getPrice(bytes32 feedId, uint256 maxAge) internal view returns (PythStructs.Price memory) {
        return pyth.getPriceNoOlderThan(feedId, maxAge);
    }

    /// @notice Read an EMA price with staleness protection
    /// @param feedId The Pyth price feed ID
    /// @param maxAge Maximum acceptable age in seconds
    function _getEmaPrice(bytes32 feedId, uint256 maxAge) internal view returns (PythStructs.Price memory) {
        return pyth.getEmaPriceNoOlderThan(feedId, maxAge);
    }

    // ──────────────────────────────────────────────
    // Fixed-point conversion utilities
    // ──────────────────────────────────────────────

    /// @notice Convert a Pyth price to a uint256 with the specified number of decimals
    /// @param price The Pyth price struct
    /// @param targetDecimals The desired number of decimals in the output
    /// @return The price as a uint256 with targetDecimals decimals
    function _toUint256(
        PythStructs.Price memory price,
        uint8 targetDecimals
    ) internal pure returns (uint256) {
        if (price.price < 0) revert NegativePrice(bytes32(0), price.price);

        uint64 priceAbs = uint64(price.price);

        if (price.expo >= 0) {
            return uint256(priceAbs) * (10 ** uint32(price.expo)) * (10 ** targetDecimals);
        } else {
            uint32 absExpo = uint32(uint32(-price.expo));
            if (absExpo >= targetDecimals) {
                return uint256(priceAbs) / (10 ** (absExpo - targetDecimals));
            } else {
                return uint256(priceAbs) * (10 ** (targetDecimals - absExpo));
            }
        }
    }

    /// @notice Get price as uint256 with 18 decimals (standard ERC-20 scale)
    function _toWad(PythStructs.Price memory price) internal pure returns (uint256) {
        return _toUint256(price, 18);
    }

    /// @notice Get price as uint256 with 8 decimals (Chainlink-compatible scale)
    function _to8Decimals(PythStructs.Price memory price) internal pure returns (uint256) {
        return _toUint256(price, 8);
    }

    // ──────────────────────────────────────────────
    // Confidence interval utilities
    // ──────────────────────────────────────────────

    /// @notice Get the lower bound of the confidence interval (price - conf)
    function _priceLowerBound(PythStructs.Price memory price) internal pure returns (int64) {
        return price.price - int64(price.conf);
    }

    /// @notice Get the upper bound of the confidence interval (price + conf)
    function _priceUpperBound(PythStructs.Price memory price) internal pure returns (int64) {
        return price.price + int64(price.conf);
    }

    /// @notice Check that confidence is below a threshold (in basis points)
    /// @param price The Pyth price struct
    /// @param maxConfBps Maximum confidence/price ratio in basis points (100 = 1%)
    function _requireLowUncertainty(
        PythStructs.Price memory price,
        uint64 maxConfBps
    ) internal pure {
        if (price.price <= 0) return; // Skip check for non-positive prices
        uint64 absPrice = uint64(price.price);
        if (price.conf * 10000 / absPrice > maxConfBps) {
            revert PriceUncertain(bytes32(0), price.conf, price.price);
        }
    }

    // ──────────────────────────────────────────────
    // Cross-rate derivation
    // ──────────────────────────────────────────────

    /// @notice Derive a cross-rate from two USD-denominated feeds
    /// @dev Example: ETH/EUR = ETH/USD ÷ EUR/USD
    /// @param baseFeedId Feed for the base asset (e.g., ETH/USD)
    /// @param quoteFeedId Feed for the quote currency (e.g., EUR/USD)
    /// @param maxAge Maximum acceptable age for both prices
    function _getCrossRate(
        bytes32 baseFeedId,
        bytes32 quoteFeedId,
        uint256 maxAge
    ) internal view returns (int64 crossPrice, uint64 crossConf, int32 crossExpo) {
        PythStructs.Price memory basePrice = _getPrice(baseFeedId, maxAge);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, maxAge);

        // Normalize to same exponent
        int32 resultExpo = basePrice.expo;
        int64 normalizedQuote = quotePrice.price;

        if (quotePrice.expo > basePrice.expo) {
            normalizedQuote = quotePrice.price * int64(int256(10 ** uint256(uint32(quotePrice.expo - basePrice.expo))));
        } else if (quotePrice.expo < basePrice.expo) {
            resultExpo = quotePrice.expo;
            int64 normalizedBase = basePrice.price * int64(int256(10 ** uint256(uint32(basePrice.expo - quotePrice.expo))));
            crossPrice = normalizedBase / quotePrice.price;
            crossConf = uint64(uint256(uint64(basePrice.conf)) * uint256(uint64(quotePrice.price)) / uint256(uint64(quotePrice.price)));
            crossExpo = resultExpo;
            return (crossPrice, crossConf, crossExpo);
        }

        crossPrice = basePrice.price * int64(int256(10 ** uint256(uint32(-resultExpo)))) / normalizedQuote;
        crossConf = uint64(basePrice.conf);
        crossExpo = resultExpo;
    }

    /// @dev Allow contract to receive ETH for fee refunds
    receive() external payable {}
}
