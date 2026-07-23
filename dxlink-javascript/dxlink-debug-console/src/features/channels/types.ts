export type ChannelKind = 'feed' | 'dom' | 'deepbook' | 'indichart'

export type FeedView = 'subscriptions' | 'chart'

export interface FeedConfig {
  kind: 'feed'
  view: FeedView
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

export interface DomConfig {
  kind: 'dom'
  symbol: string
  source: string
  /** Feed qualification — omitted from the protocol when empty. */
  feed: string
  /** Feed space — omitted from the protocol when empty. */
  space: string
}

export interface DeepBookConfig {
  kind: 'deepbook'
  symbol: string
  source: string
  /** ORCS aggregation granularity of the heatmap as a candle-period string, e.g. "1s". */
  granularity: string
  /** Candle period of the reference overlay chart, e.g. "1m" (independent of the heatmap granularity). */
  candlePeriod: string
  /** History window start (epoch millis) fixed at channel-open time. */
  fromTime: number
}

export interface IndiChartConfig {
  kind: 'indichart'
  /** Indicator scripts; the protocol names them 1..N by position. */
  indicators: string[]
}

export type ChannelConfig = FeedConfig | DomConfig | DeepBookConfig | IndiChartConfig

export interface DraftChannel {
  id: string
  config: ChannelConfig
}

// Channel-request parameters — the values entered in each service's request
// form. Preserved between dialog opens so the user can quickly open several
// channels of the same kind.
export interface FeedRequest {
  view: FeedView
  feed: string
  space: string
}

export interface DomRequest {
  symbol: string
  source: string
  feed: string
  space: string
}

export interface DeepBookRequest {
  symbol: string
  source: string
  granularity: string
  candlePeriod: string
  /** History lookback in minutes; fromTime = now − lookback at open time. */
  lookbackMinutes: string
}

export interface IndiChartRequest {
  indicators: string[]
}

export const MAX_INDICATORS = 10
