// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PythPriceFeedBase.sol";

/// @title PullConsumer
/// @notice Example pull integration — fetches price updates from Hermes off-chain,
///         submits them on-chain, then reads the latest price.
/// @dev This is the DEFAULT and RECOMMENDED integration pattern.
///      Adapt this template to match your project's structure and naming.
contract PullConsumer is PythPriceFeedBase {
    bytes32 public immutable priceFeedId;
    uint256 public constant MAX_PRICE_AGE = 60; // seconds

    event PriceRead(int64 price, uint64 conf, int32 expo, uint256 publishTime);

    constructor(
        address pythContract,
        bytes32 _priceFeedId
    ) PythPriceFeedBase(pythContract) {
        priceFeedId = _priceFeedId;
    }

    /// @notice Update prices and read the latest price in one transaction
    /// @param priceUpdate The encoded price update data fetched from Hermes
    /// @return price The latest price struct
    function updateAndGetPrice(
        bytes[] calldata priceUpdate
    ) external payable returns (PythStructs.Price memory price) {
        // Step 1: Update prices on-chain (pays the fee)
        _updatePrices(priceUpdate);

        // Step 2: Read the fresh price
        price = _getPrice(priceFeedId, MAX_PRICE_AGE);

        emit PriceRead(price.price, price.conf, price.expo, price.publishTime);

        // Refund excess ETH
        uint256 excess = msg.value - pyth.getUpdateFee(priceUpdate);
        if (excess > 0) {
            (bool ok, ) = msg.sender.call{value: excess}("");
            require(ok, "Refund failed");
        }
    }

    /// @notice Read the current on-chain price (reverts if stale)
    function getLatestPrice() external view returns (PythStructs.Price memory) {
        return _getPrice(priceFeedId, MAX_PRICE_AGE);
    }

    /// @notice Read the current price as uint256 with 18 decimals
    function getLatestPriceWad() external view returns (uint256) {
        PythStructs.Price memory price = _getPrice(priceFeedId, MAX_PRICE_AGE);
        return _toWad(price);
    }

    /// @notice Read the EMA price (smoother, good for lending protocols)
    function getEmaPrice() external view returns (PythStructs.Price memory) {
        return _getEmaPrice(priceFeedId, MAX_PRICE_AGE);
    }
}
