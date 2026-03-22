// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PythPriceFeedBase.sol";

/// @title CrossRate
/// @notice Derive cross-rates from two Pyth USD-denominated price feeds.
///         Example: ETH/EUR = ETH/USD ÷ EUR/USD
/// @dev Reference pattern — adapt to your project's needs.
contract CrossRate is PythPriceFeedBase {
    bytes32 public immutable baseFeedId;  // e.g., ETH/USD
    bytes32 public immutable quoteFeedId; // e.g., EUR/USD

    uint256 public constant MAX_PRICE_AGE = 60;

    event CrossRateRead(
        int64 basePrice,
        int64 quotePrice,
        int64 crossPrice,
        int32 crossExpo
    );

    /// @param pythContract Pyth contract address for your chain
    /// @param _baseFeedId Feed ID for base/USD (e.g., ETH/USD)
    /// @param _quoteFeedId Feed ID for quote/USD (e.g., EUR/USD)
    constructor(
        address pythContract,
        bytes32 _baseFeedId,
        bytes32 _quoteFeedId
    ) PythPriceFeedBase(pythContract) {
        baseFeedId = _baseFeedId;
        quoteFeedId = _quoteFeedId;
    }

    /// @notice Get the cross-rate (base/quote) by dividing two USD feeds
    /// @param priceUpdate Fresh price data from Hermes (must include both feeds)
    /// @return crossPrice The derived cross-rate price
    /// @return crossConf The propagated confidence interval
    /// @return crossExpo The exponent for the cross-rate
    function getCrossRate(
        bytes[] calldata priceUpdate
    ) external payable returns (int64 crossPrice, uint64 crossConf, int32 crossExpo) {
        _updatePrices(priceUpdate);

        PythStructs.Price memory basePrice = _getPrice(baseFeedId, MAX_PRICE_AGE);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, MAX_PRICE_AGE);

        require(basePrice.price > 0 && quotePrice.price > 0, "Non-positive price");

        // Derive cross-rate: base/quote = (base/USD) / (quote/USD)
        // To maintain precision, we scale numerator before dividing
        uint8 PRECISION = 8;

        uint256 basePriceScaled = uint256(uint64(basePrice.price)) * (10 ** PRECISION);
        uint256 quotePriceAbs = uint256(uint64(quotePrice.price));

        // Adjust for exponent difference
        int32 expoDiff = basePrice.expo - quotePrice.expo;
        if (expoDiff > 0) {
            basePriceScaled = basePriceScaled * (10 ** uint32(expoDiff));
        } else if (expoDiff < 0) {
            quotePriceAbs = quotePriceAbs * (10 ** uint32(-expoDiff));
        }

        crossPrice = int64(int256(basePriceScaled / quotePriceAbs));
        crossExpo = basePrice.expo - int32(int8(PRECISION));

        // Propagate confidence: relative errors add
        // conf_cross ≈ cross_price * (conf_base/price_base + conf_quote/price_quote)
        uint256 relConfBase = (uint256(basePrice.conf) * 1e18) / uint256(uint64(basePrice.price));
        uint256 relConfQuote = (uint256(quotePrice.conf) * 1e18) / uint256(uint64(quotePrice.price));
        crossConf = uint64((uint256(uint64(crossPrice)) * (relConfBase + relConfQuote)) / 1e18);

        emit CrossRateRead(basePrice.price, quotePrice.price, crossPrice, crossExpo);
    }

    /// @notice Read the cross-rate without updating (uses existing on-chain prices)
    function getCrossRateNoUpdate() external view returns (int64 crossPrice, uint64 crossConf, int32 crossExpo) {
        return _getCrossRate(baseFeedId, quoteFeedId, MAX_PRICE_AGE);
    }

    /// @notice Get the cross-rate as a uint256 with 18 decimals
    function getCrossRateWad(
        bytes[] calldata priceUpdate
    ) external payable returns (uint256 rateWad) {
        _updatePrices(priceUpdate);

        PythStructs.Price memory basePrice = _getPrice(baseFeedId, MAX_PRICE_AGE);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, MAX_PRICE_AGE);

        require(basePrice.price > 0 && quotePrice.price > 0, "Non-positive price");

        // base_wad / quote_wad = cross_rate_wad
        uint256 baseWad = _toWad(basePrice);
        uint256 quoteWad = _toWad(quotePrice);

        rateWad = (baseWad * 1e18) / quoteWad;
    }
}
