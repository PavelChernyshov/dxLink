import type { DescMessage } from '@bufbuild/protobuf'

/**
 * dxLink protocol v1.0 interaction models, mirroring the server-side handler shapes.
 *
 * | Model              | Requests → Responses | Client surface                       |
 * | ------------------ | -------------------- | ------------------------------------ |
 * | `REQUEST_RESPONSE` | 1 → 1                | `Promise<O>`                         |
 * | `REQUEST_STREAM`   | 1 → N                | `ReadableStream<O>`                  |
 * | `STREAM_RESPONSE`  | N → 1                | `WritableStream<I>` + `Promise<O>`   |
 * | `STREAM_STREAM`    | N → N                | `WritableStream<I>` + `ReadableStream<O>` |
 */
export const DXLINK_INTERACTION_MODELS = [
  'REQUEST_RESPONSE',
  'REQUEST_STREAM',
  'STREAM_RESPONSE',
  'STREAM_STREAM',
] as const

/**
 * Interaction model of an RPC method.
 * @see {@link DXLINK_INTERACTION_MODELS}
 */
export type DxLinkInteractionModel = (typeof DXLINK_INTERACTION_MODELS)[number]

/**
 * Opaque codec schema handle for messages of type `T`.
 *
 * The base package and the RPC wrappers treat it as opaque — only a concrete
 * {@link DxLinkClient} implementation's frame codec interprets it (for example, as a
 * `@bufbuild/protobuf` message descriptor to serialize as protobuf-JSON or binary).
 * The phantom `T` keeps {@link DxLinkMethodDescriptor}s end-to-end typed without the
 * base depending on a specific codec runtime.
 */
export interface DxLinkMessageType<T> {
  /**
   * Fully-qualified protobuf message name.
   * @example 'dxtrade.api.IssueOrderRequest'
   */
  readonly typeName: string
  /**
   * `@bufbuild/protobuf` message descriptor used by a schema-aware {@link DxLinkMessageCodec}
   * (canonical protobuf-JSON, or protobuf `Any`). Populated by {@link createDxLinkClient} from a
   * generated service descriptor. When absent, codecs fall back to passthrough.
   */
  readonly schema?: DescMessage
  /**
   * @internal Phantom marker carrying `T` for type inference. Never present at runtime.
   */
  readonly _output?: T
}

/**
 * Describes a single RPC method: how to route it (`service` + `name`), which interaction
 * `model` it uses, and the codec schemas for its request/response messages.
 *
 * Descriptors are the currency of {@link DxLinkClient.createCall} and the RPC wrappers.
 * They are usually produced from generated service descriptors rather than written by hand.
 */
export interface DxLinkMethodDescriptor<I, O> {
  /**
   * Fully-qualified service name used by the server to route the call.
   * @example 'dxtrade.api.OrderEntryService'
   */
  readonly service: string
  /**
   * Method name used by the server to select the handler.
   * @example 'issueOrder'
   */
  readonly name: string
  /**
   * Interaction model of the method.
   */
  readonly model: DxLinkInteractionModel
  /**
   * Codec schema for the request message.
   */
  readonly input: DxLinkMessageType<I>
  /**
   * Codec schema for the response message.
   */
  readonly output: DxLinkMessageType<O>
}
