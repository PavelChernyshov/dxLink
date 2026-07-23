/**
 * Side of an aggregated price-level order, as serialized by the server (protobuf enum name).
 */
export type DeepBookOrderSide = 'SIDE_UNDEFINED' | 'SIDE_BUY' | 'SIDE_SELL'

/**
 * A single aggregated price-level order as received from the DeepBook stream.
 *
 * This is the JSON projection of the server-side `dxfeed.marketdata.v1.Order` protobuf message, so field names are
 * lowerCamelCase and unset (default-valued) fields are omitted. Only the fields relevant to an order-book heatmap are
 * typed explicitly; any additional order fields are preserved via the index signature.
 *
 * A `size` of `0` denotes that the price level has been removed (delta encoding).
 */
export interface DeepBookOrder {
  /** Symbol of this order, e.g. `"AAPL"`. */
  readonly eventSymbol?: string
  /** Unique per-symbol index of this order. May arrive as a string (int64) over JSON. */
  readonly index?: number | string
  /** Time of this order (epoch millis). May arrive as a string (int64) over JSON. */
  readonly time?: number | string
  /** Sequence number used to order events sharing the same time. */
  readonly sequence?: number
  /** Order source, e.g. `"NTV"`. */
  readonly source?: string
  /** Price of this price level. */
  readonly price?: number
  /** Resting size at this price level; `0` means the level was removed. */
  readonly size?: number
  /** Side of this order. */
  readonly side?: DeepBookOrderSide
  /** Transactional event flags. */
  readonly eventFlags?: number
  readonly [key: string]: unknown
}

/**
 * Parameters that identify a DeepBook stream request.
 */
export interface DeepBookParameters {
  /** Instrument symbol, e.g. `"AAPL"`. */
  readonly symbol: string
  /** Order source name, e.g. `"NTV"`. */
  readonly source: string
  /** Aggregation granularity as a candle-period string, e.g. `"1s"`, `"10m"`, `"1h"`. */
  readonly granularity: string
  /** Start of the history window in epoch millis; history is replayed from here, then the stream goes live. */
  readonly fromTime: number
}

/**
 * Wire request payload for `streamDeepBookOrders` (matches the server proto, lowerCamelCase JSON names).
 * @internal
 */
export interface StreamDeepBookOrdersRequest {
  readonly symbol: string
  readonly source: string
  readonly granularity: string
  readonly fromTime: number
}

/**
 * Wire response payload for `streamDeepBookOrders`.
 *
 * `orders` and `pending` are optional because protobuf JSON omits default values: the "caught up to live" marker frame
 * ({@code orders: [], pending: false}) can arrive as an empty object. Consumers must treat `orders ?? []` and
 * `pending ?? false`.
 * @internal
 */
export interface StreamDeepBookOrdersResponse {
  readonly orders?: DeepBookOrder[]
  readonly pending?: boolean
}
