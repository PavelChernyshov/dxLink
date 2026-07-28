import type { DxLinkCallOptions } from './call'
import type { DxLinkClient } from './client'
import { DxLinkRpcError } from './error'
import type { DxLinkMethodDescriptor } from './method'

/** The part of a {@link DxLinkClient} the wrappers need: the ability to open a call. */
type DxLinkCaller = Pick<DxLinkClient, 'createCall'>

/**
 * A cancelable unary call: the pending response plus an explicit {@link DxLinkUnaryCall.cancel}.
 * Use this instead of {@link unary} when you need to cancel without threading an
 * {@link AbortSignal} through the call site.
 */
export interface DxLinkUnaryCall<O> {
  /**
   * Resolves with the single response, or rejects if the call is canceled or fails.
   */
  readonly response: Promise<O>
  /**
   * Cancel the call. No-op once the response has settled.
   */
  cancel(reason?: unknown): void
}

const isReadableStream = <T>(
  source: ReadableStream<T> | AsyncIterable<T>
): source is ReadableStream<T> =>
  typeof (source as Partial<ReadableStream<T>>).getReader === 'function'

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw abortReason(signal)
  }
}

/**
 * Wrap a source stream so that aborting `signal` errors the returned stream (and cancels the
 * source). Returns the source unchanged when no signal is given.
 */
const abortable = <O>(
  source: ReadableStream<O>,
  signal: AbortSignal | undefined
): ReadableStream<O> => {
  if (signal === undefined) {
    return source
  }
  // Relaying through a TransformStream lets `pipeTo({ signal })` translate an abort into an
  // errored readable for the consumer while canceling the source (→ CHANNEL_CANCEL on the wire).
  const relay = new TransformStream<O, O>()
  source.pipeTo(relay.writable, { signal }).catch(() => {
    // Abort and source errors surface on `relay.readable`; nothing to handle here.
  })
  return relay.readable
}

/** Send exactly one request and half-close the outbound side. */
const sendSingle = async <I>(requests: WritableStream<I>, request: I): Promise<void> => {
  const writer = requests.getWriter()
  try {
    await writer.write(request)
    await writer.close()
  } finally {
    writer.releaseLock()
  }
}

/** Drain a request source into the outbound side, then half-close it. */
const pumpRequests = async <I>(
  source: ReadableStream<I> | AsyncIterable<I>,
  requests: WritableStream<I>,
  signal: AbortSignal | undefined
): Promise<void> => {
  if (isReadableStream(source)) {
    await source.pipeTo(requests, { signal })
    return
  }
  const writer = requests.getWriter()
  try {
    for await (const value of source) {
      throwIfAborted(signal)
      await writer.write(value)
    }
    await writer.close()
  } catch (error) {
    await writer.abort(error).catch(() => {})
    throw error
  } finally {
    writer.releaseLock()
  }
}

/**
 * Unary RPC (`REQUEST_RESPONSE`): send one request, resolve with one response.
 */
export const unary = async <I, O>(
  client: DxLinkCaller,
  method: DxLinkMethodDescriptor<I, O>,
  request: I,
  options?: DxLinkCallOptions
): Promise<O> => {
  const signal = options?.signal
  throwIfAborted(signal)

  const call = client.createCall(method, options)
  const writer = call.requests.getWriter()
  const reader = call.responses.getReader()

  const onAbort = () => {
    const reason = abortReason(signal!)
    void reader.cancel(reason).catch(() => {})
    void writer.abort(reason).catch(() => {})
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await writer.write(request)
    await writer.close()

    const result = await reader.read()
    throwIfAborted(signal)
    if (result.done) {
      throw new DxLinkRpcError(`RPC ${method.service}/${method.name} closed without a response`)
    }
    return result.value
  } finally {
    signal?.removeEventListener('abort', onAbort)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
    writer.releaseLock()
  }
}

/**
 * Server-streaming RPC (`REQUEST_STREAM`): send one request, receive a stream of responses.
 */
export const serverStream = <I, O>(
  client: DxLinkCaller,
  method: DxLinkMethodDescriptor<I, O>,
  request: I,
  options?: DxLinkCallOptions
): ReadableStream<O> => {
  const call = client.createCall(method, options)
  // The response stream is the source of truth; a failed send surfaces there as a closed/errored
  // channel, so send failures are intentionally not thrown from this synchronous function.
  void sendSingle(call.requests, request).catch(() => {})
  return abortable(call.responses, options?.signal)
}

/**
 * Client-streaming RPC (`STREAM_RESPONSE`): send a stream of requests, resolve with one response.
 *
 * Note: graceful request half-close is an open dxLink v1.0 protocol item — see PLAN-v2.md.
 */
export const clientStream = async <I, O>(
  client: DxLinkCaller,
  method: DxLinkMethodDescriptor<I, O>,
  requests: ReadableStream<I> | AsyncIterable<I>,
  options?: DxLinkCallOptions
): Promise<O> => {
  const signal = options?.signal
  throwIfAborted(signal)

  const call = client.createCall(method, options)
  const reader = call.responses.getReader()

  const onAbort = () => void reader.cancel(abortReason(signal!)).catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })

  const pumping = pumpRequests(requests, call.requests, signal).catch((error) => {
    // A request-side failure must also fail the response side.
    void reader.cancel(error).catch(() => {})
    throw error
  })

  try {
    const result = await reader.read()
    throwIfAborted(signal)
    // Surface a request-pump error if it lost the race with the response.
    await pumping.catch(() => {})
    if (result.done) {
      throw new DxLinkRpcError(`RPC ${method.service}/${method.name} closed without a response`)
    }
    return result.value
  } finally {
    signal?.removeEventListener('abort', onAbort)
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/**
 * Bidirectional-streaming RPC (`STREAM_STREAM`): send a stream of requests, receive a stream of
 * responses.
 *
 * Note: graceful request half-close is an open dxLink v1.0 protocol item — see PLAN-v2.md.
 */
export const bidiStream = <I, O>(
  client: DxLinkCaller,
  method: DxLinkMethodDescriptor<I, O>,
  requests: ReadableStream<I> | AsyncIterable<I>,
  options?: DxLinkCallOptions
): ReadableStream<O> => {
  const call = client.createCall(method, options)
  // Request-side errors surface on the server and thus on the response stream.
  void pumpRequests(requests, call.requests, options?.signal).catch(() => {})
  return abortable(call.responses, options?.signal)
}

/**
 * Unary RPC with an explicit cancel handle (see {@link DxLinkUnaryCall}).
 */
export const unaryCall = <I, O>(
  client: DxLinkCaller,
  method: DxLinkMethodDescriptor<I, O>,
  request: I
): DxLinkUnaryCall<O> => {
  const controller = new AbortController()
  return {
    response: unary(client, method, request, { signal: controller.signal }),
    cancel: (reason) => controller.abort(reason),
  }
}
