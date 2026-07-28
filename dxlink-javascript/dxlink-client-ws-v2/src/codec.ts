import type { DxLinkErrorType } from '@dxfeed/dxlink-client-v2'

import {
  DXLINK_FRAME_TYPES,
  DXLINK_WS_SUBPROTOCOLS,
  type DxLinkFrame,
  type DxLinkWsSubprotocol,
} from './protocol'

/**
 * A single WebSocket message payload: text for `dxlink-ws-json`, binary for `dxlink-ws-protobuf`.
 */
export type DxLinkWsData = string | Uint8Array

/**
 * Encodes and decodes whole frames to/from a WebSocket message payload.
 *
 * The codec handles only the frame envelope; RPC message payloads (`CHANNEL_DATA.payload`) are
 * pre-encoded by a `DxLinkMessageCodec` (from the base package) and treated opaquely here.
 */
export interface DxLinkFrameCodec {
  /** The subprotocol this codec speaks (negotiated on the WebSocket). */
  readonly subprotocol: DxLinkWsSubprotocol
  encode(frame: DxLinkFrame): DxLinkWsData
  decode(data: DxLinkWsData): DxLinkFrame
}

interface JsonEnvelope {
  type?: string
  channel?: number
  time?: number
  version?: string
  keepaliveTimeout?: number
  acceptKeepaliveTimeout?: number
  token?: string
  state?: string
  error?: string
  message?: string
  service?: string
  parameters?: { methodName?: string } | null
  payload?: unknown
}

const decoder = new TextDecoder()

const readMethod = (envelope: JsonEnvelope): string => envelope.parameters?.methodName ?? ''

/**
 * Frame codec for the `dxlink-ws-json` subprotocol.
 *
 * Frames are flat JSON objects `{ type, channel, time?, ... }`. Per the v1.0 JSON mapping the RPC
 * method is carried in `parameters.methodName` (the protobuf frame uses an explicit `method_name`
 * field instead). Payloads are inlined as-is — a {@link DxLinkMessageCodec} produces the canonical
 * protobuf-JSON value beforehand.
 */
export const createJsonFrameCodec = (): DxLinkFrameCodec => ({
  subprotocol: DXLINK_WS_SUBPROTOCOLS.json,

  encode(frame: DxLinkFrame): string {
    const envelope: JsonEnvelope = { type: frame.type, channel: frame.channel }
    if (frame.time !== undefined) envelope.time = frame.time

    switch (frame.type) {
      case DXLINK_FRAME_TYPES.SETUP:
        envelope.version = frame.version
        if (frame.keepaliveTimeout !== undefined) envelope.keepaliveTimeout = frame.keepaliveTimeout
        if (frame.acceptKeepaliveTimeout !== undefined) {
          envelope.acceptKeepaliveTimeout = frame.acceptKeepaliveTimeout
        }
        break
      case DXLINK_FRAME_TYPES.AUTH:
        envelope.token = frame.token
        break
      case DXLINK_FRAME_TYPES.AUTH_STATE:
        envelope.state = frame.state
        break
      case DXLINK_FRAME_TYPES.ERROR:
        envelope.error = frame.error
        envelope.message = frame.message
        break
      case DXLINK_FRAME_TYPES.CHANNEL_REQUEST:
      case DXLINK_FRAME_TYPES.CHANNEL_OPENED:
        envelope.service = frame.service
        envelope.parameters = { methodName: frame.method }
        break
      case DXLINK_FRAME_TYPES.CHANNEL_DATA:
        envelope.payload = frame.payload
        break
      // KEEPALIVE, CHANNEL_CANCEL, CHANNEL_CLOSED carry only the envelope.
    }

    return JSON.stringify(envelope)
  },

  decode(data: DxLinkWsData): DxLinkFrame {
    const text = typeof data === 'string' ? data : decoder.decode(data)
    const envelope = JSON.parse(text) as JsonEnvelope

    const { type } = envelope
    if (type === undefined) {
      throw new Error('dxLink JSON frame missing "type"')
    }
    if (typeof envelope.channel !== 'number') {
      throw new Error('dxLink JSON frame missing "channel"')
    }
    const channel = envelope.channel
    const time = envelope.time

    switch (type) {
      case DXLINK_FRAME_TYPES.SETUP:
        return {
          type,
          channel,
          time,
          version: envelope.version ?? '',
          keepaliveTimeout: envelope.keepaliveTimeout,
          acceptKeepaliveTimeout: envelope.acceptKeepaliveTimeout,
        }
      case DXLINK_FRAME_TYPES.AUTH:
        return { type, channel, time, token: envelope.token ?? '' }
      case DXLINK_FRAME_TYPES.AUTH_STATE:
        return {
          type,
          channel,
          time,
          state: envelope.state === 'AUTHORIZED' ? 'AUTHORIZED' : 'UNAUTHORIZED',
        }
      case DXLINK_FRAME_TYPES.KEEPALIVE:
        return { type, channel, time }
      case DXLINK_FRAME_TYPES.ERROR:
        return {
          type,
          channel,
          time,
          error: (envelope.error ?? 'UNKNOWN') as DxLinkErrorType,
          message: envelope.message ?? '',
        }
      case DXLINK_FRAME_TYPES.CHANNEL_REQUEST:
        return {
          type,
          channel,
          time,
          service: envelope.service ?? '',
          method: readMethod(envelope),
        }
      case DXLINK_FRAME_TYPES.CHANNEL_OPENED:
        return {
          type,
          channel,
          time,
          service: envelope.service ?? '',
          method: readMethod(envelope),
        }
      case DXLINK_FRAME_TYPES.CHANNEL_CANCEL:
        return { type, channel, time }
      case DXLINK_FRAME_TYPES.CHANNEL_CLOSED:
        return { type, channel, time }
      case DXLINK_FRAME_TYPES.CHANNEL_DATA:
        return { type, channel, time, payload: envelope.payload }
      default:
        throw new Error(`Unknown dxLink JSON frame type: ${type}`)
    }
  },
})
