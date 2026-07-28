import type { DxLinkErrorType } from '@dxfeed/dxlink-client-v2'

/**
 * dxLink WebSocket protocol version proposed in SETUP.
 */
export const DXLINK_WS_PROTOCOL_VERSION = '1.0'

/**
 * Connection channel used for SETUP / AUTH / AUTH_STATE / KEEPALIVE / connection-level ERROR.
 * Service RPC channels use positive identifiers.
 */
export const DXLINK_CONNECTION_CHANNEL = 0

/**
 * WebSocket subprotocols negotiated via `Sec-WebSocket-Protocol`.
 */
export const DXLINK_WS_SUBPROTOCOLS = {
  json: 'dxlink-ws-json',
  protobuf: 'dxlink-ws-protobuf',
} as const

/**
 * A negotiated dxLink WebSocket subprotocol.
 */
export type DxLinkWsSubprotocol =
  (typeof DXLINK_WS_SUBPROTOCOLS)[keyof typeof DXLINK_WS_SUBPROTOCOLS]

/**
 * Frame type discriminators. Values match the JSON subprotocol `type` field and the protobuf
 * `DxLinkWsFrame` oneof cases.
 */
export const DXLINK_FRAME_TYPES = {
  SETUP: 'SETUP',
  AUTH: 'AUTH',
  AUTH_STATE: 'AUTH_STATE',
  KEEPALIVE: 'KEEPALIVE',
  ERROR: 'ERROR',
  CHANNEL_REQUEST: 'CHANNEL_REQUEST',
  CHANNEL_OPENED: 'CHANNEL_OPENED',
  CHANNEL_CANCEL: 'CHANNEL_CANCEL',
  CHANNEL_CLOSED: 'CHANNEL_CLOSED',
  CHANNEL_DATA: 'CHANNEL_DATA',
} as const

/**
 * Wire authentication state carried by AUTH_STATE (JSON enum names).
 */
export type DxLinkWireAuthState = 'AUTHORIZED' | 'UNAUTHORIZED'

/**
 * Fields shared by every frame.
 */
export interface DxLinkFrameBase {
  /** Channel identifier: 0 for connection frames, positive for service channels. */
  readonly channel: number
  /** Optional epoch-millis timestamp. */
  readonly time?: number
}

/** SETUP — protocol version and keepalive negotiation. Bidirectional. */
export interface DxLinkSetupFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.SETUP
  readonly version: string
  readonly keepaliveTimeout?: number
  readonly acceptKeepaliveTimeout?: number
}

/** AUTH — authenticate or re-authenticate. Client-to-server. */
export interface DxLinkAuthFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.AUTH
  readonly token: string
}

/** AUTH_STATE — current authentication state. Server-to-client. */
export interface DxLinkAuthStateFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.AUTH_STATE
  readonly state: DxLinkWireAuthState
}

/** KEEPALIVE — heartbeat. Bidirectional. */
export interface DxLinkKeepaliveFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.KEEPALIVE
}

/** ERROR — protocol-level error report. Bidirectional. */
export interface DxLinkErrorFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.ERROR
  readonly error: DxLinkErrorType
  readonly message: string
}

/** CHANNEL_REQUEST — invoke an RPC method on a new channel. Client-to-server. */
export interface DxLinkChannelRequestFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.CHANNEL_REQUEST
  readonly service: string
  readonly method: string
}

/** CHANNEL_OPENED — confirmation that a requested channel has been opened. Server-to-client. */
export interface DxLinkChannelOpenedFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.CHANNEL_OPENED
  readonly service: string
  readonly method: string
}

/** CHANNEL_CANCEL — cancel a pending or in-progress RPC call. Client-to-server. */
export interface DxLinkChannelCancelFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.CHANNEL_CANCEL
}

/** CHANNEL_CLOSED — the RPC call lifecycle on the channel has ended. Server-to-client. */
export interface DxLinkChannelClosedFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.CHANNEL_CLOSED
}

/**
 * CHANNEL_DATA — RPC payload on an open channel. Bidirectional.
 *
 * `payload` is the wire-encoded message produced/consumed by a {@link DxLinkMessageCodec}
 * (a JSON value for `dxlink-ws-json`, a `google.protobuf.Any` for `dxlink-ws-protobuf`); the
 * frame codec treats it opaquely.
 */
export interface DxLinkChannelDataFrame extends DxLinkFrameBase {
  readonly type: typeof DXLINK_FRAME_TYPES.CHANNEL_DATA
  readonly payload: unknown
}

/**
 * Any dxLink v1.0 frame, subprotocol-independent.
 */
export type DxLinkFrame =
  | DxLinkSetupFrame
  | DxLinkAuthFrame
  | DxLinkAuthStateFrame
  | DxLinkKeepaliveFrame
  | DxLinkErrorFrame
  | DxLinkChannelRequestFrame
  | DxLinkChannelOpenedFrame
  | DxLinkChannelCancelFrame
  | DxLinkChannelClosedFrame
  | DxLinkChannelDataFrame
