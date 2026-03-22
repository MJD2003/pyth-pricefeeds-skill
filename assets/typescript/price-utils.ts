/**
 * Pyth Price Feeds — Utility functions for price conversion and formatting.
 *
 * No external dependencies — works in any TypeScript project.
 *
 * These utilities handle:
 *   - Fixed-point conversion (price × 10^expo)
 *   - Confidence interval calculations
 *   - Price formatting for display
 *   - Feed ID validation
 */

// ─── Types ──────────────────────────────────────────────

export interface RawPythPrice {
  price: string | number | bigint;
  conf: string | number | bigint;
  expo: number;
  publish_time?: number;
}

export interface FormattedPrice {
  value: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
  confidencePercent: number;
  publishTime: number;
  formatted: string;
  formattedWithConf: string;
}

// ─── Conversion Functions ───────────────────────────────

/**
 * Convert a Pyth raw price to a human-readable number.
 * real_price = price × 10^expo
 */
export function pythToNumber(price: string | number | bigint, expo: number): number {
  return Number(price) * 10 ** expo;
}

/**
 * Convert a Pyth price struct to a fully formatted price object.
 */
export function formatPythPrice(raw: RawPythPrice): FormattedPrice {
  const value = pythToNumber(raw.price, raw.expo);
  const confidence = pythToNumber(raw.conf, raw.expo);
  const lowerBound = value - confidence;
  const upperBound = value + confidence;
  const confidencePercent = value !== 0 ? (confidence / Math.abs(value)) * 100 : 0;

  return {
    value,
    confidence,
    lowerBound,
    upperBound,
    confidencePercent,
    publishTime: raw.publish_time || 0,
    formatted: formatUsd(value),
    formattedWithConf: `${formatUsd(value)} ±${formatUsd(confidence)}`,
  };
}

/**
 * Convert a Pyth price to a BigInt with the specified number of decimals.
 * Useful for on-chain math in JavaScript/TypeScript.
 */
export function pythToBigInt(
  price: string | number | bigint,
  expo: number,
  targetDecimals: number
): bigint {
  const p = BigInt(price.toString());
  const shift = targetDecimals + expo;

  if (shift >= 0) {
    return p * 10n ** BigInt(shift);
  } else {
    return p / 10n ** BigInt(-shift);
  }
}

/**
 * Convert a Pyth price to a uint256 with 18 decimals (WAD format).
 */
export function pythToWad(price: string | number | bigint, expo: number): bigint {
  return pythToBigInt(price, expo, 18);
}

/**
 * Convert a Pyth price to 8 decimals (Chainlink-compatible).
 */
export function pythTo8Decimals(price: string | number | bigint, expo: number): bigint {
  return pythToBigInt(price, expo, 8);
}

// ─── Confidence Interval Functions ──────────────────────

/**
 * Check if the confidence interval is within acceptable bounds.
 * Returns true if confidence/price < maxPercent.
 */
export function isConfidenceAcceptable(raw: RawPythPrice, maxPercent: number): boolean {
  const price = Math.abs(Number(raw.price));
  const conf = Number(raw.conf);
  if (price === 0) return false;
  return (conf / price) * 100 < maxPercent;
}

/**
 * Get the conservative (lower bound) price for collateral valuation.
 */
export function getConservativeLow(raw: RawPythPrice): number {
  return pythToNumber(raw.price, raw.expo) - pythToNumber(raw.conf, raw.expo);
}

/**
 * Get the conservative (upper bound) price for debt valuation.
 */
export function getConservativeHigh(raw: RawPythPrice): number {
  return pythToNumber(raw.price, raw.expo) + pythToNumber(raw.conf, raw.expo);
}

// ─── Cross-Rate Functions ───────────────────────────────

/**
 * Derive a cross-rate from two USD-denominated prices.
 * Example: ETH/EUR = ETH/USD ÷ EUR/USD
 */
export function deriveCrossRate(
  baseUsd: RawPythPrice,
  quoteUsd: RawPythPrice
): { value: number; confidence: number } {
  const baseValue = pythToNumber(baseUsd.price, baseUsd.expo);
  const quoteValue = pythToNumber(quoteUsd.price, quoteUsd.expo);
  const baseConf = pythToNumber(baseUsd.conf, baseUsd.expo);
  const quoteConf = pythToNumber(quoteUsd.conf, quoteUsd.expo);

  if (quoteValue === 0) throw new Error("Quote price is zero");

  const crossRate = baseValue / quoteValue;

  // Propagate confidence: relative errors add
  const relConfBase = Math.abs(baseConf / baseValue);
  const relConfQuote = Math.abs(quoteConf / quoteValue);
  const crossConf = Math.abs(crossRate) * (relConfBase + relConfQuote);

  return { value: crossRate, confidence: crossConf };
}

// ─── Formatting Functions ───────────────────────────────

/**
 * Format a number as USD with appropriate precision.
 */
export function formatUsd(value: number, minDecimals = 2, maxDecimals = 6): string {
  const abs = Math.abs(value);
  let decimals = minDecimals;

  if (abs < 0.01) decimals = maxDecimals;
  else if (abs < 1) decimals = 4;
  else if (abs < 100) decimals = 2;
  else decimals = minDecimals;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a price change as a percentage string.
 */
export function formatPriceChange(current: number, previous: number): string {
  if (previous === 0) return "N/A";
  const change = ((current - previous) / Math.abs(previous)) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}

/**
 * Format a timestamp as a human-readable "time ago" string.
 */
export function timeAgo(publishTime: number): string {
  const diff = Math.floor(Date.now() / 1000) - publishTime;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Validation Functions ───────────────────────────────

/**
 * Validate a Pyth feed ID format.
 */
export function isValidFeedId(feedId: string): boolean {
  const clean = feedId.replace("0x", "");
  return /^[0-9a-fA-F]{64}$/.test(clean);
}

/**
 * Normalize a feed ID to lowercase with 0x prefix.
 */
export function normalizeFeedId(feedId: string): string {
  const clean = feedId.replace("0x", "").toLowerCase();
  if (clean.length !== 64) throw new Error(`Invalid feed ID length: ${clean.length}`);
  return "0x" + clean;
}
