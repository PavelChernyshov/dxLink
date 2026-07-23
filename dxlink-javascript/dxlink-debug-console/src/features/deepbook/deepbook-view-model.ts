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
  /** Largest resting size in view, used to normalize color intensity. */
  maxSize: number
  /** Representative price-level spacing, for sizing band height in domain space. */
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
const RETAIN_MS = 60 * 60 * 1000
// Hard cap on retained closed segments to bound memory and redraw cost.
const MAX_SEGMENTS = 30000

const EMPTY_HEATMAP: DeepBookHeatmap = {
  segments: [],
  minPrice: NaN,
  maxPrice: NaN,
  maxSize: 0,
  priceStep: NaN,
  nowTime: 0,
}

/** Smallest positive gap between consecutive values of a sorted numeric array, or `fallback` if none. */
const minPositiveGap = (sortedAsc: number[], fallback: number): number => {
  let min = Infinity
  for (let i = 1; i < sortedAsc.length; i++) {
    const gap = sortedAsc[i]! - sortedAsc[i - 1]!
    if (gap > 0 && gap < min) min = gap
  }
  return Number.isFinite(min) ? min : fallback
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

  private handleOrders = (orders: DeepBookOrder[], _pending: boolean): void => {
    if (this.deepBook === null) return
    for (const order of orders) {
      this.applyOrder(order)
    }
    this.store.setState((s) => ({ totalOrders: s.totalOrders + orders.length }))
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

    // Close the previous size into a segment spanning [sinceTime, time) before applying the change.
    if (existing !== undefined && time > existing.sinceTime) {
      this.pushSegment({ price, side, size: existing.size, tStart: existing.sinceTime, tEnd: time })
    }

    if (Number.isFinite(size) && size > 0) {
      if (existing !== undefined && time <= existing.sinceTime) {
        // Same-bucket (or out-of-order) update: keep the start, just replace the size.
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
    let maxSize = 0
    for (const s of segments) {
      prices.add(s.price)
      if (s.price < minPrice) minPrice = s.price
      if (s.price > maxPrice) maxPrice = s.price
      if (s.size > maxSize) maxSize = s.size
    }
    const priceStep = minPositiveGap(
      Array.from(prices).sort((a, b) => a - b),
      Number.isFinite(minPrice) && Number.isFinite(maxPrice) && maxPrice > minPrice
        ? (maxPrice - minPrice) / 100
        : 0.01
    )
    return { segments, minPrice, maxPrice, maxSize, priceStep, nowTime: this.lastTime }
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
