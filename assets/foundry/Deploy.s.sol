// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

/// @title Pyth Price Feed Consumer Deploy Script (Foundry)
/// @notice Reference deploy script — adapt the contract import and constructor args
///         to match YOUR consumer contract.
/// @dev Usage:
///   forge script script/Deploy.s.sol:DeployPythConsumer \
///     --rpc-url $RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify
///
/// Environment variables required:
///   RPC_URL            — Target chain RPC endpoint
///   PRIVATE_KEY        — Deployer wallet private key
///   PYTH_ADDRESS       — Pyth contract on target chain (see references/chainlist.md)
///   ETHERSCAN_API_KEY  — (Optional) For contract verification

// ─── Import YOUR consumer contract here ─────────────────
// import {PullConsumer} from "../src/PullConsumer.sol";
// import {PushConsumer} from "../src/PushConsumer.sol";
// import {OracleSwap} from "../src/OracleSwap.sol";
// import {LendingOracle} from "../src/LendingOracle.sol";
// import {CrossRate} from "../src/CrossRate.sol";

contract DeployPythConsumer is Script {
    function run() external {
        // Read environment variables
        address pythAddress = vm.envAddress("PYTH_ADDRESS");
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        console.log("Deploying to chain:", block.chainid);
        console.log("Pyth address:", pythAddress);
        console.log("Deployer:", vm.addr(deployerPrivateKey));

        vm.startBroadcast(deployerPrivateKey);

        // ─── Deploy YOUR contract ───────────────────────
        // Uncomment and adapt the lines matching your contract:

        // --- Pull Consumer (most common) ---
        // bytes32 feedId = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace; // ETH/USD
        // PullConsumer consumer = new PullConsumer(pythAddress, feedId);
        // console.log("PullConsumer deployed at:", address(consumer));

        // --- Push Consumer ---
        // bytes32 feedId = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
        // PushConsumer consumer = new PushConsumer(pythAddress, feedId);
        // console.log("PushConsumer deployed at:", address(consumer));

        // --- Oracle Swap ---
        // address tokenBase = vm.envAddress("TOKEN_BASE");
        // address tokenQuote = vm.envAddress("TOKEN_QUOTE");
        // bytes32 baseFeedId = vm.envBytes32("BASE_FEED_ID");
        // bytes32 quoteFeedId = vm.envBytes32("QUOTE_FEED_ID");
        // OracleSwap swap = new OracleSwap(pythAddress, tokenBase, tokenQuote, baseFeedId, quoteFeedId);
        // console.log("OracleSwap deployed at:", address(swap));

        // --- Lending Oracle ---
        // LendingOracle oracle = new LendingOracle(pythAddress);
        // console.log("LendingOracle deployed at:", address(oracle));

        // --- Cross Rate ---
        // bytes32 baseFeedId = vm.envBytes32("BASE_FEED_ID");   // e.g., ETH/USD
        // bytes32 quoteFeedId = vm.envBytes32("QUOTE_FEED_ID"); // e.g., EUR/USD
        // CrossRate crossRate = new CrossRate(pythAddress, baseFeedId, quoteFeedId);
        // console.log("CrossRate deployed at:", address(crossRate));

        vm.stopBroadcast();
    }
}
