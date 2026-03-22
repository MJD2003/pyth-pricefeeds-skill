// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "@pythnetwork/pyth-sdk-solidity/MockPyth.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";
import "../PullConsumer.sol";
import "../PushConsumer.sol";
import "../OracleSwap.sol";
import "../LendingOracle.sol";
import "../CrossRate.sol";

/// @title PythPriceFeedTest
/// @notice Test patterns for Pyth Price Feed consumers using MockPyth.
/// @dev Adapt to your specific consumer contract. Uses Foundry test framework.
///      For Hardhat, convert to TypeScript using ethers + chai.

contract PythPriceFeedTest is Test {
    MockPyth public mockPyth;
    PullConsumer public pullConsumer;
    PushConsumer public pushConsumer;

    bytes32 constant ETH_USD_FEED = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant BTC_USD_FEED = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant EUR_USD_FEED = 0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b;

    // MockPyth parameters
    uint256 constant VALID_TIME_PERIOD = 60;
    uint256 constant SINGLE_UPDATE_FEE = 1;

    function setUp() public {
        // Deploy MockPyth with 60s validity and 1 wei fee per update
        mockPyth = new MockPyth(VALID_TIME_PERIOD, SINGLE_UPDATE_FEE);

        // Deploy consumers with MockPyth address
        pullConsumer = new PullConsumer(address(mockPyth), ETH_USD_FEED);
        pushConsumer = new PushConsumer(address(mockPyth), ETH_USD_FEED);

        // Fund the test contract
        vm.deal(address(this), 100 ether);
    }

    // ──────────────────────────────────────────────
    // Helper: Create price update data
    // ──────────────────────────────────────────────

    function _createPriceUpdate(
        int64 price,
        uint64 conf,
        int32 expo,
        uint64 publishTime
    ) internal view returns (bytes[] memory) {
        bytes[] memory updateData = new bytes[](1);
        updateData[0] = mockPyth.createPriceFeedUpdateData(
            ETH_USD_FEED,
            price,
            conf,
            expo,
            price,     // EMA price (same as spot for simplicity)
            conf,      // EMA conf
            publishTime,
            publishTime
        );
        return updateData;
    }

    function _updateMockPrice(int64 price, uint64 conf, int32 expo) internal {
        bytes[] memory updateData = _createPriceUpdate(
            price, conf, expo, uint64(block.timestamp)
        );
        uint256 fee = mockPyth.getUpdateFee(updateData);
        mockPyth.updatePriceFeeds{value: fee}(updateData);
    }

    // ──────────────────────────────────────────────
    // Pull Consumer Tests
    // ──────────────────────────────────────────────

    function test_PullConsumer_UpdateAndGetPrice() public {
        bytes[] memory updateData = _createPriceUpdate(
            238955000000,  // $2389.55 with 8 decimals
            119477500,     // ±$1.19 confidence
            -8,            // exponent
            uint64(block.timestamp)
        );

        uint256 fee = pullConsumer.getUpdateFee(updateData);
        PythStructs.Price memory price = pullConsumer.updateAndGetPrice{value: fee + 0.01 ether}(updateData);

        assertEq(price.price, 238955000000);
        assertEq(price.conf, 119477500);
        assertEq(price.expo, -8);
    }

    function test_PullConsumer_RevertsOnStalePrice() public {
        // Update price in the past
        bytes[] memory updateData = _createPriceUpdate(
            238955000000, 119477500, -8,
            uint64(block.timestamp - 120)  // 2 minutes ago
        );
        uint256 fee = mockPyth.getUpdateFee(updateData);
        mockPyth.updatePriceFeeds{value: fee}(updateData);

        // Reading should revert because price is too old (>60s)
        vm.expectRevert();
        pullConsumer.getLatestPrice();
    }

    function test_PullConsumer_PriceConversion18Decimals() public {
        // Set price: $2389.55 (238955000000 * 10^-8)
        _updateMockPrice(238955000000, 119477500, -8);

        uint256 priceWad = pullConsumer.getLatestPriceWad();

        // Expected: 2389.55 * 10^18 = 2389550000000000000000
        assertApproxEqRel(priceWad, 2389.55e18, 0.001e18); // 0.1% tolerance
    }

    function test_PullConsumer_InsufficientFee() public {
        bytes[] memory updateData = _createPriceUpdate(
            238955000000, 119477500, -8, uint64(block.timestamp)
        );

        // Should revert with insufficient fee
        vm.expectRevert();
        pullConsumer.updateAndGetPrice{value: 0}(updateData);
    }

    // ──────────────────────────────────────────────
    // Push Consumer Tests
    // ──────────────────────────────────────────────

    function test_PushConsumer_ReadPrice() public {
        // First update MockPyth directly (simulating a price pusher)
        _updateMockPrice(238955000000, 119477500, -8);

        (int64 price, uint64 conf, int32 expo, ) = pushConsumer.getLatestPrice();

        assertEq(price, 238955000000);
        assertEq(conf, 119477500);
        assertEq(expo, -8);
    }

    function test_PushConsumer_IsPriceAvailable() public {
        // No price has been pushed yet — should be unavailable
        bool available = pushConsumer.isPriceAvailable();
        assertFalse(available);

        // Push a price
        _updateMockPrice(238955000000, 119477500, -8);

        available = pushConsumer.isPriceAvailable();
        assertTrue(available);
    }

    function test_PushConsumer_StaleAfterTimeout() public {
        _updateMockPrice(238955000000, 119477500, -8);

        // Warp time forward past the staleness threshold
        vm.warp(block.timestamp + 120);

        // Price should now be stale
        bool available = pushConsumer.isPriceAvailable();
        assertFalse(available);

        // But unsafe price should still work
        PythStructs.Price memory p = pushConsumer.getUnsafePrice();
        assertEq(p.price, 238955000000);
    }

    // ──────────────────────────────────────────────
    // Edge Case Tests
    // ──────────────────────────────────────────────

    function test_DifferentExponents() public {
        // Price with exponent -5: $122.76250
        _updateMockPrice(12276250, 1500, -5);

        PythStructs.Price memory p = pullConsumer.getLatestPrice();
        assertEq(p.price, 12276250);
        assertEq(p.expo, -5);

        // Verify conversion to 18 decimals
        uint256 wad = pullConsumer.getLatestPriceWad();
        assertApproxEqRel(wad, 122.7625e18, 0.001e18);
    }

    function test_HighConfidenceInterval() public {
        // Price $100 with very high confidence ±$50 (50%)
        _updateMockPrice(10000000000, 5000000000, -8);

        PythStructs.Price memory p = pullConsumer.getLatestPrice();
        assertEq(p.price, 10000000000);
        assertEq(p.conf, 5000000000);
    }

    // ──────────────────────────────────────────────
    // Fuzz Tests
    // ──────────────────────────────────────────────

    function testFuzz_PriceConversion(int64 price, int32 expo) public {
        // Bound to reasonable values
        vm.assume(price > 0);
        vm.assume(expo >= -18 && expo <= 0);

        _updateMockPrice(price, 0, expo);

        // Should not revert
        uint256 wad = pullConsumer.getLatestPriceWad();
        assertGt(wad, 0);
    }

    // ──────────────────────────────────────────────
    // Cross-Rate Tests
    // ──────────────────────────────────────────────

    function test_CrossRate_ETH_EUR() public {
        // Setup: ETH/USD = $2400, EUR/USD = $1.08
        bytes[] memory updateData = new bytes[](2);
        updateData[0] = mockPyth.createPriceFeedUpdateData(
            ETH_USD_FEED, 240000000000, 100000000, -8,
            240000000000, 100000000, uint64(block.timestamp), uint64(block.timestamp)
        );
        updateData[1] = mockPyth.createPriceFeedUpdateData(
            EUR_USD_FEED, 108000000, 50000, -8,
            108000000, 50000, uint64(block.timestamp), uint64(block.timestamp)
        );

        uint256 fee = mockPyth.getUpdateFee(updateData);
        mockPyth.updatePriceFeeds{value: fee}(updateData);

        // ETH/EUR should be ~2222.22 ($2400 / $1.08)
        PythStructs.Price memory ethUsd = mockPyth.getPriceNoOlderThan(ETH_USD_FEED, 60);
        PythStructs.Price memory eurUsd = mockPyth.getPriceNoOlderThan(EUR_USD_FEED, 60);

        assertGt(ethUsd.price, 0);
        assertGt(eurUsd.price, 0);

        // Manual cross-rate calculation
        int64 crossPrice = (ethUsd.price * int64(10 ** uint32(-eurUsd.expo))) / eurUsd.price;
        // ~222222222222 with expo -8 = ~2222.22
        assertApproxEqRel(uint256(int256(crossPrice)), 222222222222, 0.01e18); // 1% tolerance
    }

    // ──────────────────────────────────────────────
    // Lending Oracle / Confidence Tests
    // ──────────────────────────────────────────────

    function test_LendingOracle_ConservativePricing() public {
        // ETH/USD = $2400 ±$12 (0.5% confidence)
        _updateMockPrice(240000000000, 1200000000, -8);

        PythStructs.Price memory p = pullConsumer.getLatestPrice();

        // Collateral valuation: use pessimistic (price - conf)
        int64 collateralPrice = p.price - int64(p.conf);
        // = 240000000000 - 1200000000 = 238800000000 ($2388.00)
        assertEq(collateralPrice, 238800000000);

        // Debt valuation: use optimistic (price + conf)
        int64 debtPrice = p.price + int64(p.conf);
        // = 240000000000 + 1200000000 = 241200000000 ($2412.00)
        assertEq(debtPrice, 241200000000);

        // Spread = 2 * conf / price = 1%
        uint256 spreadBps = (uint256(p.conf) * 20000) / uint256(int256(p.price));
        assertEq(spreadBps, 100); // 100 bps = 1%
    }

    function test_LendingOracle_WideConfidenceRejection() public {
        // ETH/USD = $2400 ±$240 (10% confidence — very wide, market stress)
        _updateMockPrice(240000000000, 24000000000, -8);

        PythStructs.Price memory p = pullConsumer.getLatestPrice();

        uint256 confBps = (uint256(p.conf) * 10000) / uint256(int256(p.price));
        // 10% = 1000 bps
        assertEq(confBps, 1000);

        // A lending protocol should reject this — spread is too wide
        assertTrue(confBps > 500, "Confidence too wide for lending");
    }

    // ──────────────────────────────────────────────
    // Multi-Feed Batch Tests
    // ──────────────────────────────────────────────

    function test_MultiFeed_BatchUpdate() public {
        // Update ETH and BTC in one call
        bytes[] memory updateData = new bytes[](2);
        updateData[0] = mockPyth.createPriceFeedUpdateData(
            ETH_USD_FEED, 240000000000, 100000000, -8,
            240000000000, 100000000, uint64(block.timestamp), uint64(block.timestamp)
        );
        updateData[1] = mockPyth.createPriceFeedUpdateData(
            BTC_USD_FEED, 6800000000000, 500000000, -8,
            6800000000000, 500000000, uint64(block.timestamp), uint64(block.timestamp)
        );

        uint256 fee = mockPyth.getUpdateFee(updateData);
        mockPyth.updatePriceFeeds{value: fee}(updateData);

        // Both should be readable
        PythStructs.Price memory ethPrice = mockPyth.getPriceNoOlderThan(ETH_USD_FEED, 60);
        PythStructs.Price memory btcPrice = mockPyth.getPriceNoOlderThan(BTC_USD_FEED, 60);

        assertEq(ethPrice.price, 240000000000);  // $2400
        assertEq(btcPrice.price, 6800000000000); // $68000
    }

    function test_MultiFeed_FeeCalculation() public {
        bytes[] memory singleUpdate = new bytes[](1);
        singleUpdate[0] = mockPyth.createPriceFeedUpdateData(
            ETH_USD_FEED, 240000000000, 100000000, -8,
            240000000000, 100000000, uint64(block.timestamp), uint64(block.timestamp)
        );

        bytes[] memory doubleUpdate = new bytes[](2);
        doubleUpdate[0] = singleUpdate[0];
        doubleUpdate[1] = mockPyth.createPriceFeedUpdateData(
            BTC_USD_FEED, 6800000000000, 500000000, -8,
            6800000000000, 500000000, uint64(block.timestamp), uint64(block.timestamp)
        );

        uint256 singleFee = mockPyth.getUpdateFee(singleUpdate);
        uint256 doubleFee = mockPyth.getUpdateFee(doubleUpdate);

        // Fee scales with number of updates
        assertEq(doubleFee, singleFee * 2);
    }

    // ──────────────────────────────────────────────
    // EMA Price Tests
    // ──────────────────────────────────────────────

    function test_EMAPrice_Available() public {
        _updateMockPrice(240000000000, 100000000, -8);

        // EMA should also be available (MockPyth sets EMA = spot in our helper)
        PythStructs.Price memory ema = mockPyth.getEmaPriceNoOlderThan(ETH_USD_FEED, 60);
        assertEq(ema.price, 240000000000);
    }

    // Allow receiving ETH refunds
    receive() external payable {}
}
