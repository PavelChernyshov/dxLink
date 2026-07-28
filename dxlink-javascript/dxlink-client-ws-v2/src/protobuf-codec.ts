import { create, type MessageInitShape, fromBinary, toBinary } from '@bufbuild/protobuf'
import type { Any } from '@bufbuild/protobuf/wkt'
import type { DxLinkErrorType } from '@dxfeed/dxlink-client-v2'

import type { DxLinkFrameCodec, DxLinkWsData } from './codec'
import { DxlinkAuthState } from './gen/dxlink/ws/v1/dxlink_auth_state_message_pb'
import { DxlinkError } from './gen/dxlink/ws/v1/dxlink_error_message_pb'
import { DxLinkWsFrameSchema } from './gen/dxlink/ws/v1/dxlink_ws_frame_pb'
import {
  DXLINK_FRAME_TYPES,
  DXLINK_WS_SUBPROTOCOLS,
  type DxLinkFrame,
  type DxLinkWireAuthState,
} from './protocol'

type FrameInit = MessageInitShape<typeof DxLinkWsFrameSchema>
type MessageInit = FrameInit['message']

const errorToProto = (error: DxLinkErrorType): DxlinkError =>
  DxlinkError[error] ?? DxlinkError.UNKNOWN

const errorFromProto = (error: DxlinkError): DxLinkErrorType =>
  (DxlinkError[error] as DxLinkErrorType | undefined) ?? 'UNKNOWN'

const authStateToProto = (state: DxLinkWireAuthState): DxlinkAuthState =>
  state === 'AUTHORIZED' ? DxlinkAuthState.AUTHORIZED : DxlinkAuthState.UNAUTHORIZED

const authStateFromProto = (state: DxlinkAuthState): DxLinkWireAuthState =>
  state === DxlinkAuthState.AUTHORIZED ? 'AUTHORIZED' : 'UNAUTHORIZED'

/** Map a subprotocol-independent frame to the `DxLinkWsFrame` oneof `message` init. */
const toMessageInit = (frame: DxLinkFrame): MessageInit => {
  switch (frame.type) {
    case DXLINK_FRAME_TYPES.SETUP:
      return {
        case: 'setup',
        value: {
          version: frame.version,
          keepaliveTimeout: frame.keepaliveTimeout,
          acceptKeepaliveTimeout: frame.acceptKeepaliveTimeout,
        },
      }
    case DXLINK_FRAME_TYPES.AUTH:
      return { case: 'auth', value: { token: frame.token } }
    case DXLINK_FRAME_TYPES.AUTH_STATE:
      return { case: 'authState', value: { state: authStateToProto(frame.state) } }
    case DXLINK_FRAME_TYPES.KEEPALIVE:
      return { case: 'keepalive', value: {} }
    case DXLINK_FRAME_TYPES.ERROR:
      return { case: 'error', value: { error: errorToProto(frame.error), message: frame.message } }
    case DXLINK_FRAME_TYPES.CHANNEL_REQUEST:
      return {
        case: 'channelRequest',
        value: { service: frame.service, methodName: frame.method },
      }
    case DXLINK_FRAME_TYPES.CHANNEL_OPENED:
      return {
        case: 'channelOpened',
        value: { service: frame.service, methodName: frame.method },
      }
    case DXLINK_FRAME_TYPES.CHANNEL_CANCEL:
      return { case: 'channelCancel', value: {} }
    case DXLINK_FRAME_TYPES.CHANNEL_CLOSED:
      return { case: 'channelClosed', value: {} }
    case DXLINK_FRAME_TYPES.CHANNEL_DATA:
      return { case: 'channelData', value: { payload: frame.payload as Any } }
  }
}

/**
 * Frame codec for the `dxlink-ws-protobuf` subprotocol.
 *
 * Each WebSocket binary message carries exactly one serialized `DxLinkWsFrame` (no length prefix —
 * the WebSocket frame delimits it), faithful to `dxlink-java`'s `ProtobufFrameCodec`. The frame
 * envelope (`channel`, `header.time`, oneof `message`) is mapped here; the RPC payload in
 * `CHANNEL_DATA` is a `google.protobuf.Any` produced/consumed by the base `protobufMessageCodec`
 * and treated opaquely.
 */
export const createProtobufFrameCodec = (): DxLinkFrameCodec => ({
  subprotocol: DXLINK_WS_SUBPROTOCOLS.protobuf,

  encode(frame: DxLinkFrame): Uint8Array {
    const init: FrameInit = { channel: frame.channel, message: toMessageInit(frame) }
    if (frame.time !== undefined) init.header = { time: BigInt(frame.time) }
    return toBinary(DxLinkWsFrameSchema, create(DxLinkWsFrameSchema, init))
  },

  decode(data: DxLinkWsData): DxLinkFrame {
    if (typeof data === 'string') {
      throw new Error('dxlink-ws-protobuf frame codec expected binary data, got text')
    }
    const frame = fromBinary(DxLinkWsFrameSchema, data)
    const { channel } = frame
    const time = frame.header?.time !== undefined ? Number(frame.header.time) : undefined
    const message = frame.message

    switch (message.case) {
      case 'setup':
        return {
          type: DXLINK_FRAME_TYPES.SETUP,
          channel,
          time,
          version: message.value.version,
          keepaliveTimeout: message.value.keepaliveTimeout,
          acceptKeepaliveTimeout: message.value.acceptKeepaliveTimeout,
        }
      case 'auth':
        return { type: DXLINK_FRAME_TYPES.AUTH, channel, time, token: message.value.token }
      case 'authState':
        return {
          type: DXLINK_FRAME_TYPES.AUTH_STATE,
          channel,
          time,
          state: authStateFromProto(message.value.state),
        }
      case 'keepalive':
        return { type: DXLINK_FRAME_TYPES.KEEPALIVE, channel, time }
      case 'error':
        return {
          type: DXLINK_FRAME_TYPES.ERROR,
          channel,
          time,
          error: errorFromProto(message.value.error),
          message: message.value.message,
        }
      case 'channelRequest':
        return {
          type: DXLINK_FRAME_TYPES.CHANNEL_REQUEST,
          channel,
          time,
          service: message.value.service,
          method: message.value.methodName,
        }
      case 'channelOpened':
        return {
          type: DXLINK_FRAME_TYPES.CHANNEL_OPENED,
          channel,
          time,
          service: message.value.service,
          method: message.value.methodName,
        }
      case 'channelCancel':
        return { type: DXLINK_FRAME_TYPES.CHANNEL_CANCEL, channel, time }
      case 'channelClosed':
        return { type: DXLINK_FRAME_TYPES.CHANNEL_CLOSED, channel, time }
      case 'channelData':
        return {
          type: DXLINK_FRAME_TYPES.CHANNEL_DATA,
          channel,
          time,
          payload: message.value.payload,
        }
      case undefined:
        throw new Error('dxLink protobuf frame has no message set')
    }
  },
})
