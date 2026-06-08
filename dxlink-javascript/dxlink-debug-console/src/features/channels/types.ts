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

// Setup-form draft shapes — preserved between dialog opens so the user can
// quickly open multiple channels.
export interface FeedDraft {
  view: FeedView
  feed: string
  space: string
}

export interface DomDraft {
  symbol: string
  source: string
}

export interface IndiDraft {
  indicators: string[]
}

export const MAX_INDICATORS = 10

export const DEFAULT_INDICATOR_CODE = `// Simple Moving Average
input length: number = 14
plot SMA = sma(close, length)`
