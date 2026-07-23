import {
  type DXLinkClient,
  type DXLinkError,
  DXLinkLogLevel,
  type DXLinkLogger,
  Logger,
} from '@dxfeed/dxlink-core'
import { DxLinkRpcService } from '@dxfeed/dxlink-rpc'
import type { Subscription } from 'rxjs'

import {
  type DeepBookOrder,
  type DeepBookParameters,
  type StreamDeepBookOrdersRequest,
  type StreamDeepBookOrdersResponse,
} from './messages'

/**
 * Full service name of the DeepBook RPC service, as registered by the server.
 */
const DEEP_BOOK_SERVICE_NAME = 'dxfeed.marketdata.v1.DeepBookService'

/**
 * Server-streaming RPC method that delivers history followed by live price-level orders.
 */
const STREAM_DEEP_BOOK_ORDERS_METHOD = 'streamDeepBookOrders'

/**
 * Lifecycle phase of a {@link DXLinkDeepBook} stream, derived from the response flow.
 *
 * - `CONNECTING` — the stream has been requested but no response has arrived yet.
 * - `HISTORY` — historical (snapshot) batches are being delivered (`pending === true`).
 * - `LIVE` — the snapshot has been fully delivered and live updates are flowing (`pending === false`).
 * - `CLOSED` — the server closed the stream (or {@link DXLinkDeepBook.close} was called).
 * - `ERROR` — the stream terminated with an error.
 */
export enum DXLinkDeepBookState {
  CONNECTING = 'CONNECTING',
  HISTORY = 'HISTORY',
  LIVE = 'LIVE',
  CLOSED = 'CLOSED',
  ERROR = 'ERROR',
}

/**
 * Listener for batches of price-level orders received from the DeepBook stream.
 *
 * @param orders - Aggregated price-level orders in this batch (may be empty).
 * @param pending - `true` while the historical snapshot is still being delivered; `false` once caught up to live.
 */
export type DXLinkDeepBookOrdersListener = (orders: DeepBookOrder[], pending: boolean) => void

/**
 * Listener for {@link DXLinkDeepBookState} changes.
 */
export type DXLinkDeepBookStateChangeListener = (
  state: DXLinkDeepBookState,
  prev: DXLinkDeepBookState
) => void

/**
 * Options for the {@link DXLinkDeepBook} instance.
 */
export interface DXLinkDeepBookOptions {
  /**
   * Whether to re-request the stream after a connection drop.
   * When `true`, the same request is re-sent on reconnect (history is replayed again from `fromTime`).
   * @default false
   */
  retry: boolean
  /**
   * Log level for the DeepBook stream.
   */
  logLevel: DXLinkLogLevel
}

/**
 * dxLink DeepBook stream: a seamless history-plus-live stream of aggregated price-level orders for rendering an
 * order-book heatmap.
 *
 * Backed by the server-streaming RPC `dxfeed.marketdata.v1.DeepBookService/streamDeepBookOrders`. On construction it
 * opens a channel and starts streaming: first the aggregated history from `fromTime` (in batches, with `pending`
 * `true`), then live price-level updates on the same stream (`pending` `false`). Orders are keyed by (time, price,
 * side), so a renderer can apply them idempotently (last write wins), and `size === 0` denotes a removed level.
 */
export class DXLinkDeepBook {
  /** Instrument symbol of this stream. */
  public readonly symbol: string
  /** Order source of this stream. */
  public readonly source: string
  /** Aggregation granularity of this stream. */
  public readonly granularity: string
  /** History window start (epoch millis) of this stream. */
  public readonly fromTime: number

  private readonly rpc: DxLinkRpcService
  private subscription: Subscription | undefined
  private state: DXLinkDeepBookState = DXLinkDeepBookState.CONNECTING

  private readonly ordersListeners = new Set<DXLinkDeepBookOrdersListener>()
  private readonly stateListeners = new Set<DXLinkDeepBookStateChangeListener>()
  private readonly errorListeners = new Set<(error: DXLinkError) => void>()

  private readonly logger: DXLinkLogger
  private readonly options: DXLinkDeepBookOptions

  constructor(
    client: DXLinkClient,
    parameters: DeepBookParameters,
    options: Partial<DXLinkDeepBookOptions> = {}
  ) {
    this.options = {
      retry: false,
      logLevel: DXLinkLogLevel.WARN,
      ...options,
    }
    this.symbol = parameters.symbol
    this.source = parameters.source
    this.granularity = parameters.granularity
    this.fromTime = parameters.fromTime

    this.logger = new Logger(
      `${DXLinkDeepBook.name} ${parameters.symbol}:${parameters.source}`,
      this.options.logLevel
    )

    this.rpc = new DxLinkRpcService(client, DEEP_BOOK_SERVICE_NAME, {
      logLevel: this.options.logLevel,
    })

    const request: StreamDeepBookOrdersRequest = {
      symbol: parameters.symbol,
      source: parameters.source,
      granularity: parameters.granularity,
      fromTime: parameters.fromTime,
    }

    this.subscription = this.rpc
      .requestStream<
        StreamDeepBookOrdersRequest,
        StreamDeepBookOrdersResponse
      >(STREAM_DEEP_BOOK_ORDERS_METHOD, request, { retry: this.options.retry })
      .subscribe({
        next: (response) => this.processResponse(response),
        error: (error) => this.processError(error),
        complete: () => this.setState(DXLinkDeepBookState.CLOSED),
      })
  }

  /**
   * Current lifecycle state of the stream.
   */
  getState = (): DXLinkDeepBookState => this.state

  /**
   * Add a listener for order batches received from the stream.
   */
  addOrdersListener = (listener: DXLinkDeepBookOrdersListener): void => {
    this.ordersListeners.add(listener)
  }
  /**
   * Remove a previously added orders listener.
   */
  removeOrdersListener = (listener: DXLinkDeepBookOrdersListener): void => {
    this.ordersListeners.delete(listener)
  }

  /**
   * Add a listener for {@link DXLinkDeepBookState} changes.
   */
  addStateChangeListener = (listener: DXLinkDeepBookStateChangeListener): void => {
    this.stateListeners.add(listener)
  }
  /**
   * Remove a previously added state-change listener.
   */
  removeStateChangeListener = (listener: DXLinkDeepBookStateChangeListener): void => {
    this.stateListeners.delete(listener)
  }

  /**
   * Add a listener for errors raised on the stream.
   */
  addErrorListener = (listener: (error: DXLinkError) => void): void => {
    this.errorListeners.add(listener)
  }
  /**
   * Remove a previously added error listener.
   */
  removeErrorListener = (listener: (error: DXLinkError) => void): void => {
    this.errorListeners.delete(listener)
  }

  /**
   * Close the stream and release the underlying channel. Idempotent.
   */
  close = (): void => {
    this.subscription?.unsubscribe()
    this.subscription = undefined
    this.setState(DXLinkDeepBookState.CLOSED)
    this.ordersListeners.clear()
    this.stateListeners.clear()
    this.errorListeners.clear()
  }

  private processResponse(response: StreamDeepBookOrdersResponse): void {
    // protobuf JSON omits default values, so treat missing fields as empty/false.
    const pending = response.pending ?? false
    const orders = response.orders ?? []

    this.setState(pending ? DXLinkDeepBookState.HISTORY : DXLinkDeepBookState.LIVE)

    for (const listener of this.ordersListeners) {
      try {
        listener(orders, pending)
      } catch (error) {
        this.logger.error('Error in orders listener', error)
      }
    }
  }

  private processError(error: DXLinkError): void {
    this.setState(DXLinkDeepBookState.ERROR)
    if (this.errorListeners.size === 0) {
      this.logger.error('DeepBook stream error', error)
      return
    }
    for (const listener of this.errorListeners) {
      try {
        listener(error)
      } catch (listenerError) {
        this.logger.error('Error in error listener', listenerError)
      }
    }
  }

  private setState(state: DXLinkDeepBookState): void {
    if (this.state === state) return
    // Terminal states must not be overwritten.
    if (this.state === DXLinkDeepBookState.CLOSED || this.state === DXLinkDeepBookState.ERROR) {
      return
    }
    const prev = this.state
    this.state = state
    for (const listener of this.stateListeners) {
      try {
        listener(state, prev)
      } catch (error) {
        this.logger.error('Error in state listener', error)
      }
    }
  }
}
