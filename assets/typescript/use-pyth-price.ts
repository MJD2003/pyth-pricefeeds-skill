/**
 * usePythPrice — React/wagmi hook for real-time Pyth prices.
 *
 * Install: npm install @pythnetwork/hermes-client wagmi viem @tanstack/react-query
 *
 * Features:
 *   - Streams real-time prices via Hermes SSE
 *   - Provides update data for on-chain submission
 *   - Auto-reconnects on connection loss
 *   - Fixed-point conversion to human-readable numbers
 *
 * Usage:
 *   const { price, confidence, updateData, isStreaming, error } = usePythPrice("0xff61...");
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { HermesClient } from "@pythnetwork/hermes-client";

// ─── Configuration ──────────────────────────────────────

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_URL || "https://hermes.pyth.network";

// ─── Types ──────────────────────────────────────────────

export interface PythPriceData {
  price: number;
  confidence: number;
  expo: number;
  publishTime: number;
  rawPrice: string;
  rawConf: string;
}

export interface UsePythPriceResult {
  /** Current price as a number (e.g., 2389.55) */
  price: number | null;
  /** Confidence interval (e.g., 1.19) */
  confidence: number | null;
  /** Full price data including raw values */
  priceData: PythPriceData | null;
  /** Binary update data for on-chain submission (hex-encoded with 0x prefix) */
  updateData: string[] | null;
  /** Whether the SSE stream is active */
  isStreaming: boolean;
  /** Error message if any */
  error: string | null;
  /** Manually refresh the price (fetches latest from REST) */
  refresh: () => Promise<void>;
}

// ─── Hook Implementation ────────────────────────────────

export function usePythPrice(
  feedId: string,
  options?: {
    /** Use SSE streaming (default: true) */
    streaming?: boolean;
    /** Polling interval in ms if not streaming (default: 5000) */
    pollingInterval?: number;
    /** Auto-reconnect delay in ms (default: 3000) */
    reconnectDelay?: number;
  }
): UsePythPriceResult {
  const {
    streaming = true,
    pollingInterval = 5000,
    reconnectDelay = 3000,
  } = options || {};

  const [priceData, setPriceData] = useState<PythPriceData | null>(null);
  const [updateData, setUpdateData] = useState<string[] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse Hermes response into PythPriceData
  const parsePriceUpdate = useCallback((parsed: any): PythPriceData => {
    const p = parsed.price;
    return {
      price: Number(p.price) * 10 ** p.expo,
      confidence: Number(p.conf) * 10 ** p.expo,
      expo: p.expo,
      publishTime: p.publish_time,
      rawPrice: p.price,
      rawConf: p.conf,
    };
  }, []);

  // Fetch latest price via REST
  const refresh = useCallback(async () => {
    try {
      setError(null);
      const client = new HermesClient(HERMES_URL);
      const updates = await client.getLatestPriceUpdates([feedId]);

      if (updates.parsed && updates.parsed.length > 0) {
        setPriceData(parsePriceUpdate(updates.parsed[0]));
      }

      setUpdateData(updates.binary.data.map((d: string) => "0x" + d));
    } catch (err: any) {
      setError(err.message || "Failed to fetch price");
    }
  }, [feedId, parsePriceUpdate]);

  // SSE streaming
  useEffect(() => {
    if (!streaming || !feedId) return;

    let stopped = false;

    function connect() {
      if (stopped) return;

      const cleanId = feedId.replace("0x", "");
      const url = `${HERMES_URL}/v2/updates/price/stream?ids[]=${cleanId}&encoding=hex&parsed=true`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setIsStreaming(true);
        setError(null);
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.parsed && data.parsed.length > 0) {
            setPriceData(parsePriceUpdate(data.parsed[0]));
          }
          if (data.binary?.data) {
            setUpdateData(data.binary.data.map((d: string) => "0x" + d));
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        setIsStreaming(false);
        es.close();
        if (!stopped) {
          reconnectTimeoutRef.current = setTimeout(connect, reconnectDelay);
        }
      };
    }

    connect();

    return () => {
      stopped = true;
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      setIsStreaming(false);
    };
  }, [feedId, streaming, reconnectDelay, parsePriceUpdate]);

  // Polling fallback (if not streaming)
  useEffect(() => {
    if (streaming || !feedId) return;

    refresh();
    const interval = setInterval(refresh, pollingInterval);
    return () => clearInterval(interval);
  }, [feedId, streaming, pollingInterval, refresh]);

  return {
    price: priceData?.price ?? null,
    confidence: priceData?.confidence ?? null,
    priceData,
    updateData,
    isStreaming,
    error,
    refresh,
  };
}

// ─── Multi-Feed Hook ────────────────────────────────────

export interface UsePythPricesResult {
  prices: Record<string, PythPriceData>;
  updateData: string[] | null;
  isStreaming: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePythPrices(
  feedIds: string[],
  options?: { streaming?: boolean; pollingInterval?: number }
): UsePythPricesResult {
  const { streaming = true, pollingInterval = 5000 } = options || {};

  const [prices, setPrices] = useState<Record<string, PythPriceData>>({});
  const [updateData, setUpdateData] = useState<string[] | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsePriceUpdate = useCallback((parsed: any): PythPriceData => {
    const p = parsed.price;
    return {
      price: Number(p.price) * 10 ** p.expo,
      confidence: Number(p.conf) * 10 ** p.expo,
      expo: p.expo,
      publishTime: p.publish_time,
      rawPrice: p.price,
      rawConf: p.conf,
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const client = new HermesClient(HERMES_URL);
      const updates = await client.getLatestPriceUpdates(feedIds);

      const newPrices: Record<string, PythPriceData> = {};
      for (const parsed of updates.parsed || []) {
        newPrices[parsed.id] = parsePriceUpdate(parsed);
      }
      setPrices(newPrices);
      setUpdateData(updates.binary.data.map((d: string) => "0x" + d));
    } catch (err: any) {
      setError(err.message || "Failed to fetch prices");
    }
  }, [feedIds, parsePriceUpdate]);

  useEffect(() => {
    if (!streaming || feedIds.length === 0) return;

    const cleanIds = feedIds.map((id) => id.replace("0x", ""));
    const params = cleanIds.map((id) => `ids[]=${id}`).join("&");
    const url = `${HERMES_URL}/v2/updates/price/stream?${params}&encoding=hex&parsed=true`;
    const es = new EventSource(url);

    es.onopen = () => setIsStreaming(true);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.parsed) {
          setPrices((prev) => {
            const next = { ...prev };
            for (const parsed of data.parsed) {
              next[parsed.id] = parsePriceUpdate(parsed);
            }
            return next;
          });
        }
        if (data.binary?.data) {
          setUpdateData(data.binary.data.map((d: string) => "0x" + d));
        }
      } catch {
        // Ignore
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
      es.close();
    };

    return () => {
      es.close();
      setIsStreaming(false);
    };
  }, [feedIds.join(","), streaming, parsePriceUpdate]);

  useEffect(() => {
    if (streaming || feedIds.length === 0) return;
    refresh();
    const interval = setInterval(refresh, pollingInterval);
    return () => clearInterval(interval);
  }, [feedIds.join(","), streaming, pollingInterval, refresh]);

  return { prices, updateData, isStreaming, error, refresh };
}
