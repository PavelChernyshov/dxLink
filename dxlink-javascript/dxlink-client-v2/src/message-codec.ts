import { create, fromJson, type JsonValue, type MessageInitShape, toJson } from '@bufbuild/protobuf'
import { type Any, anyPack, anyUnpack } from '@bufbuild/protobuf/wkt'

import type { DxLinkMessageType } from './method'

/**
 * Serializes RPC message payloads between typed domain messages and the wire payload a transport
 * carries (a JSON value for `dxlink-ws-json`, a `google.protobuf.Any` for `dxlink-ws-protobuf`).
 *
 * A concrete client's frame/transport layer calls this to turn `createCall` messages into wire
 * payloads and back. See {@link passthroughMessageCodec} and {@link jsonMessageCodec}.
 */
export interface DxLinkMessageCodec {
  encode<T>(type: DxLinkMessageType<T>, value: T): unknown
  decode<T>(type: DxLinkMessageType<T>, raw: unknown): T
}

/**
 * A message codec that passes values through unchanged.
 *
 * For messages that are already plain JSON-serializable objects, and for tests. Ignores
 * {@link DxLinkMessageType.schema}.
 */
export const passthroughMessageCodec: DxLinkMessageCodec = {
  encode: (_type, value) => value,
  decode: (_type, raw) => raw as never,
}

/**
 * Canonical protobuf-JSON codec backed by `@bufbuild/protobuf`.
 *
 * Encodes with `toJson` and decodes with `fromJson` using the descriptor in
 * {@link DxLinkMessageType.schema} — matching the server's buffjson serialization for the
 * `dxlink-ws-json` subprotocol. Accepts message init shapes on encode (via `create`). Falls back
 * to passthrough for schemaless descriptors, so plain-object usage and tests keep working.
 */
export const jsonMessageCodec: DxLinkMessageCodec = {
  encode(type, value) {
    const { schema } = type
    if (schema === undefined) return value
    return toJson(schema, create(schema, value as MessageInitShape<typeof schema>))
  },
  decode(type, raw) {
    const { schema } = type
    if (schema === undefined) return raw as never
    return fromJson(schema, raw as JsonValue) as never
  },
}

/**
 * Binary protobuf codec backed by `@bufbuild/protobuf`.
 *
 * Encodes each message as a `google.protobuf.Any` (`anyPack`) and decodes it back with the
 * descriptor in {@link DxLinkMessageType.schema} (`anyUnpack`) — matching the `Any` payload the
 * server carries in `DxLinkChannelDataMessage` for the `dxlink-ws-protobuf` subprotocol. Accepts
 * message init shapes on encode (via `create`). Falls back to passthrough for schemaless
 * descriptors, so plain-object usage and tests keep working.
 */
export const protobufMessageCodec: DxLinkMessageCodec = {
  encode(type, value) {
    const { schema } = type
    if (schema === undefined) return value
    return anyPack(schema, create(schema, value as MessageInitShape<typeof schema>))
  },
  decode(type, raw) {
    const { schema } = type
    if (schema === undefined) return raw as never
    const message = anyUnpack(raw as Any, schema)
    if (message === undefined) {
      throw new Error(`Failed to unpack protobuf payload as ${type.typeName}`)
    }
    return message as never
  },
}
