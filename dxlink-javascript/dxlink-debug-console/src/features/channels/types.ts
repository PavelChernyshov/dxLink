export type ChannelKind = 'feed' | 'dom' | 'indichart'

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
}

export interface IndiChartConfig {
  kind: 'indichart'
  /** Indicator scripts; the protocol names them 1..N by position. */
  indicators: string[]
}

export type ChannelConfig = FeedConfig | DomConfig | IndiChartConfig

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
}

export interface IndiChartRequest {
  indicators: string[]
}

export const MAX_INDICATORS = 10
