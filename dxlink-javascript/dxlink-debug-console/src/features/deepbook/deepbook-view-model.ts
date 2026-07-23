import { DXLinkDeepBook, DXLinkDeepBookState } from '@dxfeed/dxlink-api'
import type { DeepBookOrder, DeepBookOrderSide, DXLinkClient } from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import type { ViewModel } from '../../shared/view-model'
import { DXLinkCandles } from '../feed/candles'
import type { DXLinkCandleData } from '../feed/candles'

/**
 * A horizontal liquidity band: the resting `size` at (`price`, `side`) held constant from `tStart` until `tEnd` (epoch
 * ms). A price level produces a new segment each time its size changes; carrying the size forward this way turns the
 * per-event order stream into the continuous time×price liquidity field a Bookmap-style heatmap renders.
 */
export interface DeepBookSegment {
  price: number
  side: DeepBookOrderSide
  size: number
  tStart: number
  tEnd: number
}

/** Immutable snapshot of the heatmap model pushed to the renderer. */
export interface DeepBookHeatmap {
  /** Liquidity bands (closed history + still-resting levels extended to {@link nowTime}). */
  segments: DeepBookSegment[]
  minPrice: number
  maxPrice: number
  /**
   * Robust price-level spacing (≈ the instrument tick), for sizing band height in domain space. Color intensity is
   * NOT normalized here — the renderer derives its own percentile cutoffs from the sizes visible on screen.
   */
  priceStep: number
  /** Right edge (latest event time) that still-resting levels extend to. */
  nowTime: number
}

/** Imperative sink for heatmap frames (kept out of the Zustand store, like the chart views). */
export type DeepBookHeatmapListener = (heatmap: DeepBookHeatmap) => void

export interface DeepBookVMState {
  state: DXLinkDeepBookState
  totalOrders: number
  /** Number of price levels currently resting in the book. */
  levelCount: number
  lastUpdate: number | null
}

// Coalesce heatmap frames to ~10fps.
const FLUSH_INTERVAL_MS = 100
// Retain closed liquidity segments within this window of the latest data (older liquidity scrolls out of memory).
// Time is the intended retention bound (it must cover the requested history window so the heatmap reaches `fromTime`).
const RETAIN_MS = 60 * 60 * 1000
// Safety cap on retained closed segments (memory/redraw bound only). It must stay well above the number of segments a
// busy feed produces within RETAIN_MS — otherwise the count cap, not time, bounds retention and the heatmap history is
// cut short (never reaching the requested `fromTime`). At observed churn ~30k spans only ~10-15 min, so keep it high.
// TEMPORARY: bumped to give more history headroom until the renderer moves to a raster (which removes the cap need).
const MAX_SEGMENTS = 240000

const EMPTY_HEATMAP: DeepBookHeatmap = {
  segments: [],
  minPrice: NaN,
  maxPrice: NaN,
  priceStep: NaN,
  nowTime: 0,
}

/**
 * Robust estimate of the price-level spacing (≈ the instrument tick): a low percentile of the positive gaps between
 * consecutive distinct prices. The plain minimum latches onto the occasional sub-tick pair (a stray fractional price)
 * and collapses the band height; a low percentile stays near the true tick while ignoring those rare outliers.
 */
const robustPriceStep = (sortedAsc: number[], fallback: number): number => {
  const gaps: number[] = []
  for (let i = 1; i < sortedAsc.length; i++) {
    const gap = sortedAsc[i]! - sortedAsc[i - 1]!
    if (gap > 0) gaps.push(gap)
  }
  if (gaps.length === 0) return fallback
  gaps.sort((a, b) => a - b)
  // 10th percentile: close to the modal tick, robust to a handful of sub-tick gaps.
  return gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.1))]!
}

/** A price level currently resting in the book, with the time its current size took effect. */
interface BookLevel {
  price: number
  side: DeepBookOrderSide
  size: number
  sinceTime: number
}

/**
 * ViewModel for one DeepBook channel — wraps {@link DXLinkDeepBook} and a reference candle feed.
 *
 * Construction is PURE (StrictMode-safe); streams open in {@link start} and release in {@link stop}, driven by the
 * view's `useEffect`. Incoming orders update a running book (last write wins per (price, side); `size === 0` removes a
 * level) and, on each change, close a liquidity {@link DeepBookSegment} for the level's previous size — producing the
 * continuous time×price field the heatmap draws. High-frequency geometry stays out of the store; only lightweight
 * status counters go to the store.
 */
export class DeepBookViewModel implements ViewModel<DeepBookVMState> {
  readonly store = createStore<DeepBookVMState>(() => ({
    state: DXLinkDeepBookState.CONNECTING,
    totalOrders: 0,
    levelCount: 0,
    lastUpdate: null,
  }))

  private readonly client: DXLinkClient
  private readonly params: {
    symbol: string
    source: string
    granularity: string
    candlePeriod: string
    fromTime: number
  }
  private deepBook: DXLinkDeepBook | null = null

  // Reference candles for the same symbol/period (from the regular market-data feed, NOT ORCS), overlaid under the
  // heatmap so price levels can be validated against price action.
  private candles: DXLinkCandles | null = null
  private candleListener: ((data: DXLinkCandleData) => void) | null = null

  // Running book: `${price}|${side}` -> currently-resting level. Plus closed history segments and the latest time seen.
  private readonly book = new Map<string, BookLevel>()
  private segments: DeepBookSegment[] = []
  private lastTime = 0

  // While the historical snapshot is streaming (`pending`), reconstruct silently and DON'T paint: repainting the
  // partial book on every batch of a ~100k-order backfill is wasteful and shows a growing, incomplete picture. The
  // heatmap is painted once, when the stream flips to live, and updated normally thereafter.
  private backfilling = true

  private heatmapListener: DeepBookHeatmapListener | null = null
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  constructor(
    client: DXLinkClient,
    params: {
      symbol: string
      source: string
      granularity: string
      candlePeriod: string
      fromTime: number
    }
  ) {
    this.client = client
    this.params = params
  }

  /** Register the heatmap sink (the view wires this to the canvas). Pushes the current model immediately. */
  setHeatmapListener = (listener: DeepBookHeatmapListener | null): void => {
    this.heatmapListener = listener
    if (listener !== null) {
      listener(
        this.book.size === 0 && this.segments.length === 0 ? EMPTY_HEATMAP : this.buildHeatmap()
      )
    }
  }

  /** Register the reference-candle sink (the chart consumes candle snapshots/updates imperatively). */
  setCandleListener = (listener: ((data: DXLinkCandleData) => void) | null): void => {
    this.candleListener = listener
  }

  /** The candle symbol overlaid for reference, e.g. `AAPL{=1m}` for symbol `AAPL` at candle period `1m`. */
  getCandleSymbol = (): string => `${this.params.symbol}{=${this.params.candlePeriod}}`

  start = (): void => {
    if (this.deepBook !== null) return
    this.backfilling = true
    const deepBook = new DXLinkDeepBook(this.client, this.params)
    deepBook.addOrdersListener(this.handleOrders)
    deepBook.addStateChangeListener(this.handleState)
    this.deepBook = deepBook
    this.store.setState({ state: deepBook.getState() })

    // Reference candles for the same symbol/period and history window (regular feed, not ORCS).
    const candles = new DXLinkCandles(this.client)
    candles.addListener(this.handleCandles)
    candles.setSubscription({ symbol: this.getCandleSymbol(), fromTime: this.params.fromTime })
    this.candles = candles
  }

  stop = (): void => {
    const candles = this.candles
    if (candles !== null) {
      this.candles = null
      candles.removeListener(this.handleCandles)
      candles.close()
    }
    const deepBook = this.deepBook
    if (deepBook === null) return
    this.deepBook = null
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    deepBook.removeOrdersListener(this.handleOrders)
    deepBook.removeStateChangeListener(this.handleState)
    deepBook.close()
  }

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleCandles = (data: DXLinkCandleData): void => {
    if (this.candles === null) return
    this.candleListener?.(data)
  }

  private handleOrders = (orders: DeepBookOrder[], pending: boolean): void => {
    if (this.deepBook === null) return
    for (const order of orders) {
      this.applyOrder(order)
    }
    this.store.setState((s) => ({ totalOrders: s.totalOrders + orders.length }))

    if (pending) {
      // Still backfilling history: keep reconstructing, but don't paint a partial snapshot.
      this.backfilling = true
      return
    }

    if (this.backfilling) {
      // First live batch after the snapshot completed: paint the full reconstruction now, at once.
      this.backfilling = false
      if (this.flushHandle !== null) {
        clearTimeout(this.flushHandle)
        this.flushHandle = null
      }
      this.flush()
      return
    }

    // Live updates: coalesce repaints to ~10fps.
    if (this.flushHandle === null) {
      this.flushHandle = setTimeout(this.flush, FLUSH_INTERVAL_MS)
    }
  }

  private applyOrder(order: DeepBookOrder): void {
    const time = Number(order.time)
    const price = typeof order.price === 'number' ? order.price : Number(order.price)
    if (!Number.isFinite(time) || !Number.isFinite(price)) return

    const side: DeepBookOrderSide = order.side ?? 'SIDE_UNDEFINED'
    const size = typeof order.size === 'number' ? order.size : Number(order.size)
    if (time > this.lastTime) this.lastTime = time

    const key = `${price}|${side}`
    const existing = this.book.get(key)

    // Drop strictly out-of-order events: an event older than the level's current state must not overwrite a newer
    // size (streams are ascending, so this only guards the rare reordered/duplicate delivery at the boundary).
    if (existing !== undefined && time < existing.sinceTime) return

    // Close the previous size into a segment spanning [sinceTime, time) before applying the change.
    if (existing !== undefined && time > existing.sinceTime) {
      this.pushSegment({ price, side, size: existing.size, tStart: existing.sinceTime, tEnd: time })
    }

    if (Number.isFinite(size) && size > 0) {
      if (existing !== undefined && time === existing.sinceTime) {
        // Same-bucket update at the same timestamp: keep the start, just replace the size (last write wins).
        existing.size = size
      } else {
        this.book.set(key, { price, side, size, sinceTime: time })
      }
    } else {
      // Level removed (delta encoding): its prior size was already closed into a segment above.
      this.book.delete(key)
    }
  }

  private pushSegment(segment: DeepBookSegment): void {
    if (segment.tEnd <= segment.tStart) return
    this.segments.push(segment)
    if (this.segments.length > MAX_SEGMENTS) {
      this.segments.splice(0, this.segments.length - MAX_SEGMENTS)
    }
  }

  private buildHeatmap(): DeepBookHeatmap {
    const cutoff = this.lastTime - RETAIN_MS
    if (this.segments.length > 0 && this.segments[0]!.tEnd < cutoff) {
      this.segments = this.segments.filter((s) => s.tEnd >= cutoff)
    }

    const segments: DeepBookSegment[] = this.segments.slice()
    // Extend still-resting levels to the latest time so current liquidity reaches the right edge.
    for (const level of this.book.values()) {
      segments.push({
        price: level.price,
        side: level.side,
        size: level.size,
        tStart: level.sinceTime,
        tEnd: this.lastTime,
      })
    }

    const prices = new Set<number>()
    let minPrice = Infinity
    let maxPrice = -Infinity
    for (const s of segments) {
      prices.add(s.price)
      if (s.price < minPrice) minPrice = s.price
      if (s.price > maxPrice) maxPrice = s.price
    }
    const priceStep = robustPriceStep(
      Array.from(prices).sort((a, b) => a - b),
      Number.isFinite(minPrice) && Number.isFinite(maxPrice) && maxPrice > minPrice
        ? (maxPrice - minPrice) / 100
        : 0.01
    )
    return { segments, minPrice, maxPrice, priceStep, nowTime: this.lastTime }
  }

  private flush = (): void => {
    this.flushHandle = null
    if (this.deepBook === null) return
    const heatmap =
      this.book.size === 0 && this.segments.length === 0 ? EMPTY_HEATMAP : this.buildHeatmap()
    this.store.setState({ levelCount: this.book.size, lastUpdate: Date.now() })
    this.heatmapListener?.(heatmap)
  }

  private handleState = (state: DXLinkDeepBookState): void => {
    this.store.setState({ state })
  }
}
