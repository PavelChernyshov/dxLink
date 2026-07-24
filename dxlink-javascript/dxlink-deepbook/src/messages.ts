/**
 * Side of an aggregated price-level order, as serialized by the server (protobuf enum name).
 */
export type DeepBookLevelSide = 'SIDE_UNDEFINED' | 'SIDE_BUY' | 'SIDE_SELL'

/**
 * A single aggregated price-level change as received from the DeepBook stream.
 *
 * This is the JSON projection of the server-side `dxfeed.marketdata.v1alpha.DeepBookLevel` protobuf message, so field
 * names are lowerCamelCase. Every field is optional because protobuf JSON omits defaults: an absent field means the
 * default rather than missing data — in particular an absent `size` means `0`, i.e. the level was removed (the stream
 * is delta-encoded).
 *
 * The stream carries only these four fields. Symbol and order source are properties of the request, so they are not
 * repeated per order, and the ~18 unused fields of the shared market-data `Order` message (order/trade ids, exchange
 * code, scope, action, event flags, nano time) are no longer sent — they cost 417 wire bytes per order where these
 * four cost ~67.
 */
export interface DeepBookLevel {
  /** Time of this change (epoch millis), quantized to the requested granularity. Arrives as a string (int64). */
  readonly time?: number | string
  /** Price of this level. */
  readonly price?: number
  /** Resting size at this price level; absent or `0` means the level was removed. */
  readonly size?: number
  /** Side this level rests on. A price may flip side over time, so this describes the level's current state. */
  readonly side?: DeepBookLevelSide
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
 * Wire request payload for `streamDeepBookLevels` (matches the server proto, lowerCamelCase JSON names).
 * @internal
 */
export interface StreamDeepBookLevelsRequest {
  readonly symbol: string
  readonly source: string
  readonly granularity: string
  readonly fromTime: number
}

/**
 * Wire response payload for `streamDeepBookLevels`.
 *
 * `levels` and `pending` are optional because protobuf JSON omits default values: the "caught up to live" marker frame
 * ({@code levels: [], pending: false}) can arrive as an empty object. Consumers must treat `levels ?? []` and
 * `pending ?? false`.
 * @internal
 */
export interface StreamDeepBookLevelsResponse {
  readonly levels?: DeepBookLevel[]
  readonly pending?: boolean
}
