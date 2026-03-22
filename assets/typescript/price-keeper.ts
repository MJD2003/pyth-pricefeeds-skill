/**
 * Pyth Price Keeper — Automated on-chain price updater.
 *
 * Runs as a background service, periodically fetching fresh prices from Hermes
 * and submitting them on-chain. Essential for push-style consumers or protocols
 * that need guaranteed fresh prices.
 *
 * Install: npm install ethers @pythnetwork/hermes-client
 *
 * Usage:
 *   PRIVATE_KEY=0x... RPC_URL=https://... PYTH_ADDRESS=0x... npx ts-node price-keeper.ts
 */

import { ethers } from "ethers";
import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const config = {
  rpcUrl: process.env.RPC_URL || "https://sepolia.optimism.io",
  privateKey: process.env.PRIVATE_KEY || "",
  pythAddress: process.env.PYTH_ADDRESS || "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  hermesUrl: process.env.HERMES_URL || "https://hermes.pyth.network",

  /** Feed IDs to keep updated */
  feedIds: (process.env.FEED_IDS || "").split(",").filter(Boolean).length > 0
    ? (process.env.FEED_IDS || "").split(",").filter(Boolean)
    : [
        "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", // ETH/USD
        "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", // BTC/USD
      ],

  /** Update interval in milliseconds */
  intervalMs: Number(process.env.INTERVAL_MS) || 30_000, // 30 seconds

  /** Max gas price in gwei — skip updates if gas is too expensive */
  maxGasPriceGwei: Number(process.env.MAX_GAS_PRICE_GWEI) || 50,

  /** Max retries per update attempt */
  maxRetries: 3,

  /** Price deviation threshold (bps) — only update if price moved this much */
  deviationThresholdBps: Number(process.env.DEVIATION_BPS) || 0, // 0 = always update
};

// ─── Pyth ABI (minimal) ─────────────────────────────────

const PYTH_ABI = [
  "function updatePriceFeeds(bytes[] calldata updateData) external payable",
  "function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)",
  "function getPriceUnsafe(bytes32 id) external view returns (tuple(int64 price, uint64 conf, int32 expo, uint256 publishTime))",
];

// ─── State ──────────────────────────────────────────────

interface KeeperStats {
  totalUpdates: number;
  totalErrors: number;
  totalGasUsed: bigint;
  lastUpdateTime: number;
  lastPrices: Map<string, { price: bigint; publishTime: number }>;
  startTime: number;
}

const stats: KeeperStats = {
  totalUpdates: 0,
  totalErrors: 0,
  totalGasUsed: 0n,
  lastUpdateTime: 0,
  lastPrices: new Map(),
  startTime: Date.now(),
};

// ─── Core Keeper Logic ──────────────────────────────────

async function runUpdate(
  provider: ethers.Provider,
  wallet: ethers.Wallet,
  pythContract: ethers.Contract,
  hermes: HermesClient
): Promise<boolean> {
  // 1. Check gas price
  const feeData = await provider.getFeeData();
  const gasPriceGwei = Number(feeData.gasPrice || 0n) / 1e9;
  if (gasPriceGwei > config.maxGasPriceGwei) {
    console.log(`[Keeper] Gas too high: ${gasPriceGwei.toFixed(1)} gwei > ${config.maxGasPriceGwei} gwei limit. Skipping.`);
    return false;
  }

  // 2. Fetch latest prices from Hermes
  const updates = await hermes.getLatestPriceUpdates(config.feedIds);
  const updateData = updates.binary.data.map((d: string) => "0x" + d);

  // 3. Check deviation threshold (skip if prices haven't moved enough)
  if (config.deviationThresholdBps > 0 && updates.parsed) {
    let significantMove = false;
    for (const parsed of updates.parsed) {
      const feedId = "0x" + parsed.id;
      const lastPrice = stats.lastPrices.get(feedId);
      if (!lastPrice) {
        significantMove = true;
        break;
      }

      const newPrice = BigInt(parsed.price.price);
      const diff = newPrice > lastPrice.price
        ? newPrice - lastPrice.price
        : lastPrice.price - newPrice;
      const deviationBps = lastPrice.price !== 0n
        ? Number((diff * 10000n) / (lastPrice.price > 0n ? lastPrice.price : -lastPrice.price))
        : 10000;

      if (deviationBps >= config.deviationThresholdBps) {
        significantMove = true;
        break;
      }
    }

    if (!significantMove) {
      console.log(`[Keeper] Prices within ${config.deviationThresholdBps}bps threshold. Skipping.`);
      return false;
    }
  }

  // 4. Calculate fee
  const fee = await pythContract.getUpdateFee(updateData);

  // 5. Submit update
  const tx = await pythContract.updatePriceFeeds(updateData, {
    value: fee,
    gasLimit: 500_000n,
  });

  const receipt = await tx.wait();
  const gasUsed = receipt?.gasUsed || 0n;

  // 6. Update stats
  stats.totalUpdates++;
  stats.totalGasUsed += gasUsed;
  stats.lastUpdateTime = Date.now();

  // Cache last prices
  if (updates.parsed) {
    for (const parsed of updates.parsed) {
      stats.lastPrices.set("0x" + parsed.id, {
        price: BigInt(parsed.price.price),
        publishTime: parsed.price.publish_time,
      });
    }
  }

  const feedCount = config.feedIds.length;
  console.log(
    `[Keeper] Updated ${feedCount} feeds — tx: ${tx.hash} | gas: ${gasUsed} | total: ${stats.totalUpdates}`
  );

  return true;
}

async function runUpdateWithRetry(
  provider: ethers.Provider,
  wallet: ethers.Wallet,
  pythContract: ethers.Contract,
  hermes: HermesClient
): Promise<void> {
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      await runUpdate(provider, wallet, pythContract, hermes);
      return;
    } catch (err: any) {
      stats.totalErrors++;
      const isLastAttempt = attempt === config.maxRetries;
      console.error(
        `[Keeper] Error (attempt ${attempt}/${config.maxRetries}): ${err.message}${isLastAttempt ? " — giving up" : " — retrying..."}`
      );

      if (!isLastAttempt) {
        await new Promise((r) => setTimeout(r, 2000 * attempt)); // Exponential backoff
      }
    }
  }
}

// ─── Health Check ───────────────────────────────────────

function printHealth(): void {
  const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
  const lastAgo = stats.lastUpdateTime
    ? Math.floor((Date.now() - stats.lastUpdateTime) / 1000)
    : -1;

  console.log(`\n[Health] Uptime: ${uptime}s | Updates: ${stats.totalUpdates} | Errors: ${stats.totalErrors} | Gas: ${stats.totalGasUsed} | Last: ${lastAgo >= 0 ? lastAgo + "s ago" : "never"}\n`);
}

// ─── Main ───────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[Keeper] Pyth Price Keeper starting...");
  console.log(`[Keeper] RPC: ${config.rpcUrl}`);
  console.log(`[Keeper] Pyth: ${config.pythAddress}`);
  console.log(`[Keeper] Feeds: ${config.feedIds.length}`);
  console.log(`[Keeper] Interval: ${config.intervalMs}ms`);
  console.log(`[Keeper] Max gas: ${config.maxGasPriceGwei} gwei`);
  if (config.deviationThresholdBps > 0) {
    console.log(`[Keeper] Deviation threshold: ${config.deviationThresholdBps} bps`);
  }
  console.log("");

  if (!config.privateKey) {
    throw new Error("PRIVATE_KEY environment variable not set");
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const pythContract = new ethers.Contract(config.pythAddress, PYTH_ABI, wallet);
  const hermes = new HermesClient(config.hermesUrl);

  const balance = await provider.getBalance(wallet.address);
  console.log(`[Keeper] Wallet: ${wallet.address}`);
  console.log(`[Keeper] Balance: ${ethers.formatEther(balance)} ETH`);
  console.log("");

  // Health check every 5 minutes
  setInterval(printHealth, 5 * 60 * 1000);

  // Main loop
  while (true) {
    await runUpdateWithRetry(provider, wallet, pythContract, hermes);
    await new Promise((r) => setTimeout(r, config.intervalMs));
  }
}

main().catch((err) => {
  console.error("[Keeper] Fatal error:", err);
  process.exit(1);
});
