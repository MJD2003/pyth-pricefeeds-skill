// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PythPriceFeedBase.sol";

/// @title LendingOracle
/// @notice Oracle adapter for lending protocols that uses Pyth Price Feeds
///         with confidence intervals for conservative valuations.
/// @dev Reference pattern for lending/borrowing protocols.
///      - Collateral valued at price - confidence (lower bound)
///      - Debt valued at price + confidence (upper bound)
///      - Uses EMA prices for smoother operation
///      - Rejects prices with excessive uncertainty
contract LendingOracle is PythPriceFeedBase {
    uint256 public constant MAX_PRICE_AGE = 30; // 30 seconds for lending
    uint64 public constant MAX_CONF_BPS = 200;  // 2% max confidence/price ratio

    mapping(address => bytes32) public assetFeedIds;

    event AssetFeedSet(address indexed asset, bytes32 feedId);

    constructor(address pythContract) PythPriceFeedBase(pythContract) {}

    /// @notice Set the Pyth feed ID for an asset
    function setAssetFeed(address asset, bytes32 feedId) external {
        // In production, add access control (onlyOwner, onlyGovernance, etc.)
        assetFeedIds[asset] = feedId;
        emit AssetFeedSet(asset, feedId);
    }

    /// @notice Get the collateral value of an asset (conservative lower bound)
    /// @param asset The asset address
    /// @param amount The amount of the asset (in asset decimals)
    /// @param assetDecimals The number of decimals the asset uses
    /// @param priceUpdate Fresh price data from Hermes
    /// @return valueUsd The value in USD with 18 decimals
    function getCollateralValueUsd(
        address asset,
        uint256 amount,
        uint8 assetDecimals,
        bytes[] calldata priceUpdate
    ) external payable returns (uint256 valueUsd) {
        _updatePrices(priceUpdate);

        bytes32 feedId = assetFeedIds[asset];
        require(feedId != bytes32(0), "Feed not set");

        PythStructs.Price memory price = _getPrice(feedId, MAX_PRICE_AGE);
        _requireLowUncertainty(price, MAX_CONF_BPS);

        // Use lower bound (price - conf) for collateral valuation
        int64 conservativePrice = _priceLowerBound(price);
        require(conservativePrice > 0, "Negative collateral price");

        // Convert to 18-decimal USD value
        uint256 priceWad = _priceToWad(conservativePrice, price.expo);
        valueUsd = (amount * priceWad) / (10 ** assetDecimals);
    }

    /// @notice Get the debt value of an asset (conservative upper bound)
    /// @param asset The asset address
    /// @param amount The amount of the asset (in asset decimals)
    /// @param assetDecimals The number of decimals the asset uses
    /// @param priceUpdate Fresh price data from Hermes
    /// @return valueUsd The value in USD with 18 decimals
    function getDebtValueUsd(
        address asset,
        uint256 amount,
        uint8 assetDecimals,
        bytes[] calldata priceUpdate
    ) external payable returns (uint256 valueUsd) {
        _updatePrices(priceUpdate);

        bytes32 feedId = assetFeedIds[asset];
        require(feedId != bytes32(0), "Feed not set");

        PythStructs.Price memory price = _getPrice(feedId, MAX_PRICE_AGE);
        _requireLowUncertainty(price, MAX_CONF_BPS);

        // Use upper bound (price + conf) for debt valuation
        int64 conservativePrice = _priceUpperBound(price);

        // Convert to 18-decimal USD value
        uint256 priceWad = _priceToWad(conservativePrice, price.expo);
        valueUsd = (amount * priceWad) / (10 ** assetDecimals);
    }

    /// @notice Get the EMA price (smoother, reduces liquidation cascades)
    function getEmaPriceUsd(
        address asset,
        bytes[] calldata priceUpdate
    ) external payable returns (uint256 priceWad) {
        _updatePrices(priceUpdate);

        bytes32 feedId = assetFeedIds[asset];
        require(feedId != bytes32(0), "Feed not set");

        PythStructs.Price memory price = _getEmaPrice(feedId, MAX_PRICE_AGE);
        require(price.price > 0, "Negative EMA price");

        priceWad = _priceToWad(price.price, price.expo);
    }

    /// @notice Check if a position is liquidatable
    /// @return liquidatable True if debt value exceeds collateral value * liquidation threshold
    function isLiquidatable(
        address collateralAsset,
        uint256 collateralAmount,
        uint8 collateralDecimals,
        address debtAsset,
        uint256 debtAmount,
        uint8 debtDecimals,
        uint256 liquidationThresholdBps, // e.g., 8000 = 80%
        bytes[] calldata priceUpdate
    ) external payable returns (bool liquidatable) {
        _updatePrices(priceUpdate);

        // Collateral at lower bound
        bytes32 collFeed = assetFeedIds[collateralAsset];
        PythStructs.Price memory collPrice = _getPrice(collFeed, MAX_PRICE_AGE);
        int64 collConservative = _priceLowerBound(collPrice);
        require(collConservative > 0, "Negative collateral price");
        uint256 collValueUsd = (collateralAmount * _priceToWad(collConservative, collPrice.expo)) / (10 ** collateralDecimals);

        // Debt at upper bound
        bytes32 debtFeed = assetFeedIds[debtAsset];
        PythStructs.Price memory debtPrice = _getPrice(debtFeed, MAX_PRICE_AGE);
        int64 debtConservative = _priceUpperBound(debtPrice);
        uint256 debtValueUsd = (debtAmount * _priceToWad(debtConservative, debtPrice.expo)) / (10 ** debtDecimals);

        // Liquidatable if collateral * threshold < debt
        liquidatable = (collValueUsd * liquidationThresholdBps / 10000) < debtValueUsd;
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    function _priceToWad(int64 price, int32 expo) internal pure returns (uint256) {
        uint64 priceAbs = uint64(price);
        if (expo >= 0) {
            return uint256(priceAbs) * (10 ** uint32(expo)) * 1e18;
        } else {
            uint32 absExpo = uint32(-expo);
            if (absExpo >= 18) {
                return uint256(priceAbs) / (10 ** (absExpo - 18));
            } else {
                return uint256(priceAbs) * (10 ** (18 - absExpo));
            }
        }
    }
}
