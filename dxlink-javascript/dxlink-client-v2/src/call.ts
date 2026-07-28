/**
 * Removes a previously registered listener.
 * @see {@link DxLinkClient.onStateChange}
 * @see {@link DxLinkClient.onAuthStateChange}
 * @see {@link DxLinkClient.onError}
 */
export type DxLinkUnsubscribe = () => void

/**
 * Per-call options for {@link DxLinkClient.createCall} and the RPC wrappers.
 */
export interface DxLinkCallOptions {
  /**
   * Aborts the call: cancels the response stream and aborts the request stream.
   * When already aborted, the call fails immediately.
   */
  readonly signal?: AbortSignal
}

/**
 * A single in-flight RPC call, modeled as a typed duplex.
 *
 * Write request messages to {@link DxLinkCall.requests} and read response messages from
 * {@link DxLinkCall.responses}. This `{ readable, writable }` shape mirrors a WebTransport
 * bidirectional stream, so the same abstraction maps onto future transports unchanged.
 *
 * Prefer the higher-level wrappers ({@link unary}, {@link serverStream}, {@link clientStream},
 * {@link bidiStream}) over consuming a `DxLinkCall` directly.
 */
export interface DxLinkCall<I, O> {
  /**
   * Outbound request stream. Closing it half-closes the request side; aborting it cancels the call.
   */
  readonly requests: WritableStream<I>
  /**
   * Inbound response stream. Cancelling it cancels the call.
   */
  readonly responses: ReadableStream<O>
}
