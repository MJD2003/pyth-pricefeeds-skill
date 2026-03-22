// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./PythPriceFeedBase.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OracleSwap
/// @notice AMM that swaps two ERC-20 tokens at the Pyth oracle exchange rate.
///         Users provide Pyth price updates and swap at the current oracle price.
/// @dev Reference pattern — adapt to your project. Uses pull integration.
///      Based on: https://github.com/pyth-network/pyth-examples/tree/main/price_feeds/evm/oracle_swap
contract OracleSwap is PythPriceFeedBase {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenBase;
    IERC20 public immutable tokenQuote;
    bytes32 public immutable baseFeedId;
    bytes32 public immutable quoteFeedId;

    uint256 public constant MAX_PRICE_AGE = 60;

    event Swapped(
        address indexed user,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 amountOut,
        int64 basePrice,
        int64 quotePrice
    );

    constructor(
        address pythContract,
        address _tokenBase,
        address _tokenQuote,
        bytes32 _baseFeedId,
        bytes32 _quoteFeedId
    ) PythPriceFeedBase(pythContract) {
        tokenBase = IERC20(_tokenBase);
        tokenQuote = IERC20(_tokenQuote);
        baseFeedId = _baseFeedId;
        quoteFeedId = _quoteFeedId;
    }

    /// @notice Swap base token for quote token at the oracle price
    /// @param baseAmount Amount of base token to sell
    /// @param priceUpdate Price update data from Hermes
    function swapBaseForQuote(
        uint256 baseAmount,
        bytes[] calldata priceUpdate
    ) external payable {
        _updatePrices(priceUpdate);

        PythStructs.Price memory basePrice = _getPrice(baseFeedId, MAX_PRICE_AGE);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, MAX_PRICE_AGE);

        uint256 quoteAmount = _calculateSwapAmount(baseAmount, basePrice, quotePrice);
        require(quoteAmount > 0, "Zero output amount");
        require(tokenQuote.balanceOf(address(this)) >= quoteAmount, "Insufficient liquidity");

        tokenBase.safeTransferFrom(msg.sender, address(this), baseAmount);
        tokenQuote.safeTransfer(msg.sender, quoteAmount);

        emit Swapped(msg.sender, address(tokenBase), baseAmount, address(tokenQuote), quoteAmount, basePrice.price, quotePrice.price);
    }

    /// @notice Swap quote token for base token at the oracle price
    /// @param quoteAmount Amount of quote token to sell
    /// @param priceUpdate Price update data from Hermes
    function swapQuoteForBase(
        uint256 quoteAmount,
        bytes[] calldata priceUpdate
    ) external payable {
        _updatePrices(priceUpdate);

        PythStructs.Price memory basePrice = _getPrice(baseFeedId, MAX_PRICE_AGE);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, MAX_PRICE_AGE);

        uint256 baseAmount = _calculateSwapAmount(quoteAmount, quotePrice, basePrice);
        require(baseAmount > 0, "Zero output amount");
        require(tokenBase.balanceOf(address(this)) >= baseAmount, "Insufficient liquidity");

        tokenQuote.safeTransferFrom(msg.sender, address(this), quoteAmount);
        tokenBase.safeTransfer(msg.sender, baseAmount);

        emit Swapped(msg.sender, address(tokenQuote), quoteAmount, address(tokenBase), baseAmount, basePrice.price, quotePrice.price);
    }

    /// @notice Calculate output amount given input amount and two prices
    /// @dev outputAmount = inputAmount × (inputPrice / outputPrice)
    ///      Handles different exponents by normalizing to a common scale
    function _calculateSwapAmount(
        uint256 inputAmount,
        PythStructs.Price memory inputPrice,
        PythStructs.Price memory outputPrice
    ) internal pure returns (uint256) {
        require(inputPrice.price > 0 && outputPrice.price > 0, "Non-positive price");

        uint256 inputPriceAbs = uint256(uint64(inputPrice.price));
        uint256 outputPriceAbs = uint256(uint64(outputPrice.price));

        // Normalize exponents: result = inputAmount * inputPrice / outputPrice
        // Account for different exponents between the two feeds
        int32 expoDiff = inputPrice.expo - outputPrice.expo;

        if (expoDiff >= 0) {
            return (inputAmount * inputPriceAbs * (10 ** uint32(expoDiff))) / outputPriceAbs;
        } else {
            return (inputAmount * inputPriceAbs) / (outputPriceAbs * (10 ** uint32(-expoDiff)));
        }
    }

    /// @notice Get the current exchange rate (base per quote)
    function getExchangeRate(bytes[] calldata priceUpdate) external payable returns (uint256 rate18) {
        _updatePrices(priceUpdate);
        PythStructs.Price memory basePrice = _getPrice(baseFeedId, MAX_PRICE_AGE);
        PythStructs.Price memory quotePrice = _getPrice(quoteFeedId, MAX_PRICE_AGE);

        // Rate in 18 decimals: 1 base token = X quote tokens
        rate18 = _calculateSwapAmount(1e18, basePrice, quotePrice);
    }
}
