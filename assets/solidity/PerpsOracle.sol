// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/// @title PerpsOracle — Perpetuals/Derivatives Oracle powered by Pyth
/// @notice Provides mark price, index price, funding rate calculation, and
///         liquidation threshold checks for perpetual futures DEXs.
/// @dev Pyth is the #1 oracle for perps protocols. This template shows how to:
///      - Read mark/index prices with staleness + confidence checks
///      - Calculate funding rates from price divergence
///      - Check liquidation thresholds
///      - Support multiple trading pairs
///      Adapt to your protocol's specific funding formula and margin system.

contract PerpsOracle {
    IPyth public immutable pyth;
    address public owner;

    struct Market {
        bytes32 feedId;           // Pyth price feed ID
        uint64  maxStaleness;     // Max age for price (seconds)
        uint64  maxConfBps;       // Max confidence as basis points of price
        int64   fundingRateCap;   // Max funding rate per period (1e6 = 100%)
        bool    active;
    }

    struct Position {
        address trader;
        bytes32 marketId;
        int256  size;             // Positive = long, negative = short (WAD)
        uint256 collateral;       // Collateral in WAD
        uint256 entryPrice;       // Entry price in WAD
        uint256 leverage;         // Leverage in WAD (e.g., 10e18 = 10x)
    }

    // Market ID => Market config
    mapping(bytes32 => Market) public markets;
    // Position ID => Position
    mapping(bytes32 => Position) public positions;

    // Funding
    mapping(bytes32 => int256) public cumulativeFunding;  // per market, WAD
    mapping(bytes32 => uint256) public lastFundingTime;

    uint256 public constant WAD = 1e18;
    uint256 public constant FUNDING_PERIOD = 8 hours;
    uint256 public constant LIQUIDATION_FEE_BPS = 50;     // 0.5%
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500;  // 5%

    event MarketAdded(bytes32 indexed marketId, bytes32 feedId);
    event FundingUpdated(bytes32 indexed marketId, int256 fundingRate, int256 cumulativeFunding);
    event PositionLiquidated(bytes32 indexed positionId, address indexed trader, uint256 markPrice);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _pyth) {
        pyth = IPyth(_pyth);
        owner = msg.sender;
    }

    // ──────────────────────────────────────────────
    // Market Management
    // ──────────────────────────────────────────────

    function addMarket(
        bytes32 marketId,
        bytes32 feedId,
        uint64 maxStaleness,
        uint64 maxConfBps,
        int64 fundingRateCap
    ) external onlyOwner {
        markets[marketId] = Market({
            feedId: feedId,
            maxStaleness: maxStaleness,
            maxConfBps: maxConfBps,
            fundingRateCap: fundingRateCap,
            active: true
        });
        lastFundingTime[marketId] = block.timestamp;
        emit MarketAdded(marketId, feedId);
    }

    // ──────────────────────────────────────────────
    // Price Reading
    // ──────────────────────────────────────────────

    /// @notice Get the mark price for a market with full validation
    /// @param marketId The market identifier
    /// @param priceUpdate Hermes price update data
    /// @return priceWad Price in 18-decimal WAD format
    /// @return confWad Confidence in 18-decimal WAD format
    function getMarkPrice(
        bytes32 marketId,
        bytes[] calldata priceUpdate
    ) public payable returns (uint256 priceWad, uint256 confWad) {
        Market memory market = markets[marketId];
        require(market.active, "Market not active");

        // Update and read price
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        PythStructs.Price memory price = pyth.getPriceNoOlderThan(
            market.feedId,
            market.maxStaleness
        );

        require(price.price > 0, "Invalid price");

        // Confidence check: reject if spread is too wide
        uint256 confBps = (uint256(price.conf) * 10000) / uint256(int256(price.price));
        require(confBps <= market.maxConfBps, "Confidence too wide");

        // Convert to WAD
        priceWad = _toWad(price.price, price.expo);
        confWad = _toWad(int64(price.conf), price.expo);

        // Refund excess ETH
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }
    }

    /// @notice Get index price (unsafe, for display only — no update required)
    function getIndexPrice(bytes32 marketId) external view returns (uint256 priceWad) {
        Market memory market = markets[marketId];
        PythStructs.Price memory price = pyth.getPriceUnsafe(market.feedId);
        require(price.price > 0, "No price");
        return _toWad(price.price, price.expo);
    }

    // ──────────────────────────────────────────────
    // Funding Rate
    // ──────────────────────────────────────────────

    /// @notice Calculate and apply funding rate for a market
    /// @dev Funding = (markPrice - indexPrice) / indexPrice * timeElapsed / fundingPeriod
    ///      Positive funding → longs pay shorts. Negative → shorts pay longs.
    /// @param marketId The market to update
    /// @param markPriceWad Current mark price in WAD (from orderbook/TWAP)
    /// @param priceUpdate Hermes price update for index price
    /// @return fundingRate The funding rate for this period (WAD, can be negative)
    function updateFunding(
        bytes32 marketId,
        uint256 markPriceWad,
        bytes[] calldata priceUpdate
    ) external payable returns (int256 fundingRate) {
        Market memory market = markets[marketId];
        require(market.active, "Market not active");

        uint256 elapsed = block.timestamp - lastFundingTime[marketId];
        if (elapsed == 0) return 0;

        // Get index price from Pyth
        uint256 fee = pyth.getUpdateFee(priceUpdate);
        pyth.updatePriceFeeds{value: fee}(priceUpdate);

        PythStructs.Price memory indexPrice = pyth.getPriceNoOlderThan(
            market.feedId,
            market.maxStaleness
        );
        uint256 indexWad = _toWad(indexPrice.price, indexPrice.expo);
        require(indexWad > 0, "Zero index price");

        // Funding rate = (mark - index) / index * elapsed / period
        int256 priceDiff = int256(markPriceWad) - int256(indexWad);
        fundingRate = (priceDiff * int256(WAD) * int256(elapsed)) /
            (int256(indexWad) * int256(FUNDING_PERIOD));

        // Cap funding rate
        if (fundingRate > int256(int64(market.fundingRateCap)) * int256(WAD) / 1e6) {
            fundingRate = int256(int64(market.fundingRateCap)) * int256(WAD) / 1e6;
        }
        if (fundingRate < -int256(int64(market.fundingRateCap)) * int256(WAD) / 1e6) {
            fundingRate = -int256(int64(market.fundingRateCap)) * int256(WAD) / 1e6;
        }

        cumulativeFunding[marketId] += fundingRate;
        lastFundingTime[marketId] = block.timestamp;

        emit FundingUpdated(marketId, fundingRate, cumulativeFunding[marketId]);

        // Refund
        if (msg.value > fee) {
            (bool ok, ) = msg.sender.call{value: msg.value - fee}("");
            require(ok, "Refund failed");
        }
    }

    // ──────────────────────────────────────────────
    // Liquidation
    // ──────────────────────────────────────────────

    /// @notice Check if a position is liquidatable at the current Pyth price
    /// @param positionId The position to check
    /// @param priceUpdate Hermes price update data
    /// @return liquidatable True if position can be liquidated
    /// @return markPriceWad Current mark price
    /// @return marginRatioBps Current margin ratio in basis points
    function isLiquidatable(
        bytes32 positionId,
        bytes[] calldata priceUpdate
    ) public payable returns (bool liquidatable, uint256 markPriceWad, uint256 marginRatioBps) {
        Position memory pos = positions[positionId];
        require(pos.trader != address(0), "Position not found");

        (markPriceWad, ) = getMarkPrice(pos.marketId, priceUpdate);

        // Calculate unrealized PnL
        int256 pnl;
        if (pos.size > 0) {
            // Long: profit when price goes up
            pnl = (int256(markPriceWad) - int256(pos.entryPrice)) * pos.size / int256(WAD);
        } else {
            // Short: profit when price goes down
            pnl = (int256(pos.entryPrice) - int256(markPriceWad)) * (-pos.size) / int256(WAD);
        }

        // Remaining margin = collateral + PnL
        int256 remainingMargin = int256(pos.collateral) + pnl;
        if (remainingMargin <= 0) {
            return (true, markPriceWad, 0);
        }

        // Margin ratio = remaining margin / notional value
        uint256 notional = _abs(pos.size) * markPriceWad / WAD;
        if (notional == 0) return (false, markPriceWad, type(uint256).max);

        marginRatioBps = uint256(remainingMargin) * 10000 / notional;
        liquidatable = marginRatioBps < MAINTENANCE_MARGIN_BPS;
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _toWad(int64 price, int32 expo) internal pure returns (uint256) {
        uint256 p = uint256(uint64(price));
        if (expo >= 0) {
            return p * (10 ** uint32(expo)) * WAD;
        } else {
            uint32 absExpo = uint32(-expo);
            if (absExpo >= 18) {
                return p / (10 ** (absExpo - 18));
            } else {
                return p * (10 ** (18 - absExpo));
            }
        }
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    receive() external payable {}
}
