import { DXLinkChannelState, DXLinkDepthOfMarket } from '@dxfeed/dxlink-api'
import type {
  DepthOfMarketAcceptConfig,
  DepthOfMarketConfig,
  DepthOfMarketOrder,
  DXLinkClient,
} from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import type { ViewModel } from '../../shared/view-model'

export interface DomSnapshot {
  time: number
  bids: DepthOfMarketOrder[]
  asks: DepthOfMarketOrder[]
}

export interface DomVMState {
  channelState: DXLinkChannelState
  config: DepthOfMarketConfig | null
  snapshot: DomSnapshot | null
}

// Coalesce snapshots to the latest one within this window (~10fps).
const FLUSH_INTERVAL_MS = 100

/**
 * ViewModel for one DOM (Depth of Market) channel — wraps {@link DXLinkDepthOfMarket}.
 *
 * Construction is PURE (StrictMode-safe); the channel is opened in {@link start}
 * and released in {@link stop}, driven by the view's `useEffect`. Snapshots are
 * full replacements coalesced to the latest within a frame.
 */
export class DomViewModel implements ViewModel<DomVMState> {
  readonly store = createStore<DomVMState>(() => ({
    channelState: DXLinkChannelState.REQUESTED,
    config: null,
    snapshot: null,
  }))

  private readonly client: DXLinkClient
  private readonly params: { symbol: string; sources: string[] }
  private dom: DXLinkDepthOfMarket | null = null
  private pendingSnapshot: DomSnapshot | null = null
  private flushHandle: ReturnType<typeof setTimeout> | null = null

  constructor(client: DXLinkClient, params: { symbol: string; sources: string[] }) {
    this.client = client
    this.params = params
  }

  start = (): void => {
    if (this.dom !== null) return
    const dom = new DXLinkDepthOfMarket(this.client, {
      symbol: this.params.symbol,
      sources: this.params.sources,
    })
    dom.addSnapshotListener(this.handleSnapshot)
    dom.addConfigChangeListener(this.handleConfig)
    dom.addStateChangeListener(this.handleState)
    this.dom = dom
    this.store.setState({ channelState: dom.getState(), config: dom.getConfig() })
  }

  stop = (): void => {
    const dom = this.dom
    if (dom === null) return
    this.dom = null
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.pendingSnapshot = null
    dom.removeSnapshotListener(this.handleSnapshot)
    dom.removeConfigChangeListener(this.handleConfig)
    dom.removeStateChangeListener(this.handleState)
    dom.close()
  }

  configure = (accept: DepthOfMarketAcceptConfig): void => {
    this.dom?.configure(accept)
  }

  close = (): void => {
    this.stop()
  }

  dispose = (): void => {
    this.stop()
  }

  private handleSnapshot = (
    time: number,
    bids: DepthOfMarketOrder[],
    asks: DepthOfMarketOrder[]
  ): void => {
    if (this.dom === null) return
    this.pendingSnapshot = { time, bids, asks }
    if (this.flushHandle === null) {
      this.flushHandle = setTimeout(this.flush, FLUSH_INTERVAL_MS)
    }
  }

  private flush = (): void => {
    this.flushHandle = null
    if (this.dom === null || this.pendingSnapshot === null) return
    this.store.setState({ snapshot: this.pendingSnapshot })
    this.pendingSnapshot = null
  }

  private handleConfig = (config: DepthOfMarketConfig): void => {
    this.store.setState({ config })
  }

  private handleState = (state: DXLinkChannelState): void => {
    this.store.setState({ channelState: state })
  }
}
