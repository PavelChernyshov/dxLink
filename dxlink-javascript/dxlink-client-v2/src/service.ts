import type { DescMethod, MessageInitShape, MessageShape } from '@bufbuild/protobuf'
import type { GenServiceMethods } from '@bufbuild/protobuf/codegenv2'

import type { DxLinkCallOptions } from './call'

// Re-exported so extension packages (and consumers) reference generated service descriptors
// without a direct `@bufbuild/protobuf` dependency.
export type { GenService, GenServiceMethods } from '@bufbuild/protobuf/codegenv2'
export type { DescMethod } from '@bufbuild/protobuf'

/** A stream of request messages accepted by client-streaming and bidi methods. */
export type DxLinkRequestSource<I> = ReadableStream<I> | AsyncIterable<I>

type MethodShape = Pick<DescMethod, 'input' | 'output' | 'methodKind'>

/**
 * Maps a single generated method to its client function, by interaction model:
 * unary → `Promise`, server-streaming → `ReadableStream`, client-streaming → `Promise`,
 * bidi-streaming → `ReadableStream`. Requests use `MessageInitShape`; responses `MessageShape`.
 */
type DxLinkServiceMethod<M extends MethodShape> = M extends { methodKind: 'unary' }
  ? (
      request: MessageInitShape<M['input']>,
      options?: DxLinkCallOptions
    ) => Promise<MessageShape<M['output']>>
  : M extends { methodKind: 'server_streaming' }
    ? (
        request: MessageInitShape<M['input']>,
        options?: DxLinkCallOptions
      ) => ReadableStream<MessageShape<M['output']>>
    : M extends { methodKind: 'client_streaming' }
      ? (
          requests: DxLinkRequestSource<MessageInitShape<M['input']>>,
          options?: DxLinkCallOptions
        ) => Promise<MessageShape<M['output']>>
      : (
          requests: DxLinkRequestSource<MessageInitShape<M['input']>>,
          options?: DxLinkCallOptions
        ) => ReadableStream<MessageShape<M['output']>>

/**
 * A fully-typed client for a generated service: one method per RPC, each with the return shape
 * dictated by its interaction model. Produced by {@link DxLinkClient.createService}.
 */
export type DxLinkServiceClient<S extends GenServiceMethods> = {
  [K in keyof S]: DxLinkServiceMethod<S[K]>
}
