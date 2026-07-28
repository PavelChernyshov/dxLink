/**
 * A raw byte duplex — the transport boundary a concrete {@link DxLinkClient} implementation
 * reads and writes encoded frames over.
 *
 * The modern platform converged on this `{ readable, writable }` shape: a WebSocket connection
 * is adapted to it today, and a WebTransport session or `WebSocketStream` exposes it natively
 * later. The frame codec sits between this duplex and the client as composable
 * `TransformStream`s.
 */
export interface DxLinkByteDuplex {
  /**
   * Inbound bytes from the remote endpoint.
   */
  readonly readable: ReadableStream<Uint8Array>
  /**
   * Outbound bytes to the remote endpoint.
   */
  readonly writable: WritableStream<Uint8Array>
}
