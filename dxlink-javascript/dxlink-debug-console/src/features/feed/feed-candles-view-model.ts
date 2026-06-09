import { DXLinkChannelState } from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkIndiChartCandle } from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import { DXLinkCandles } from './candles'
import type { DXLinkCandleData, DXLinkCandleEvent } from './candles'
import type { ViewModel } from '../../shared/view-model'

/** How the chart consumes a batch of candles: a fresh snapshot or an incremental update. */
export type CandleChartListener = (
  candles: DXLinkIndiChartCandle[],
  dataType: 'candles' | 'update'
) => void

export interface CandlesVMState {
  channelState: DXLinkChannelState
  subscription: { symbol: string; fromTime: number } | null
  candleCount: number
  lastUpdate: number | null
}

const toChartCandle = (event: DXLinkCandleEvent): DXLinkIndiChartCandle => ({
  eventSymbol: event.eventSymbol,
  index: event.index,
  time: event.time,
  open: event.open,
  high: event.high,
  low: event.low,
  close: event.close,
  volume: event.volume,
})

/**
 * ViewModel for the Feed candle-chart view — wraps {@link DXLinkCandles}.
 *
 * Construction is PURE (StrictMode-safe); the candle channel is opened in
 * {@link start} and released in {@link stop} via the view's `useEffect`. Candle
 * batches are forwarded to the chart through an imperative {@link CandleChartListener}
 * (the chart consumes data via a ref), while channel state / counts go to the store.
 */
export class FeedCandlesViewModel implements ViewModel<CandlesVMState> {
  readonly store = createStore<CandlesVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    subscription: null,
    candleCount: 0,
    lastUpdate: null,
  }))

  private readonly client: DXLinkClient
  private candles: DXLinkCandles | null = null
  private chartListener: CandleChartListener | null = null

  constructor(client: DXLinkClient) {
    this.client = client
  }

  /** Register the chart sink (the view wires this to `chartRef.pushData`). */
  setChartListener = (listener: CandleChartListener | null): void => {
    this.chartListener = listener
  }

  start = (): void => {
    if (this.candles !== null) return
    const candles = new DXLinkCandles(this.client)
    candles.addListener(this.handleData)
    candles.getChannel().addStateChangeListener(this.handleState)
    this.candles = candles
    this.store.setState({ channelState: candles.getChannel().getState() })
    // Re-apply an existing subscription after a StrictMode restart.
    const { subscription } = this.store.getState()
    if (subscription !== null) {
      candles.setSubscription(subscription)
    }
  }

  stop = (): void => {
    const candles = this.candles
    if (candles === null) return
    this.candles = null
    candles.removeListener(this.handleData)
    candles.getChannel().removeStateChangeListener(this.handleState)
    candles.close()
  }

  setSubscription = (symbol: string, fromTime: number): void => {
    const subscription = { symbol, fromTime }
    this.store.setState({ subscription, candleCount: 0, lastUpdate: null })
    this.candles?.setSubscription(subscription)
  }

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleData = (data: DXLinkCandleData): void => {
    if (this.candles === null) return
    const candles = data.events.map(toChartCandle)
    this.store.setState({ candleCount: candles.length, lastUpdate: Date.now() })
    this.chartListener?.(candles, data.isSnapshot ? 'candles' : 'update')
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
  }
}
