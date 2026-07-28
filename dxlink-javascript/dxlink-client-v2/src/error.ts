/**
 * Type of a {@link DxLinkError} reported by the remote endpoint.
 */
export type DxLinkErrorType =
  'UNKNOWN' | 'UNSUPPORTED_PROTOCOL' | 'TIMEOUT' | 'UNAUTHORIZED' | 'INVALID_MESSAGE' | 'BAD_ACTION'

/**
 * Unified error reported by the remote endpoint (connection- or protocol-level).
 * @see {@link DxLinkClient.onError}
 */
export interface DxLinkError {
  /**
   * Type of the error.
   * @example 'TIMEOUT'
   */
  readonly type: DxLinkErrorType
  /**
   * Human-readable message with details.
   * @example 'Timeout exceeded'
   */
  readonly message: string
}

/**
 * Listener for {@link DxLinkError}s from the remote endpoint.
 * @see {@link DxLinkClient.onError}
 */
export type DxLinkErrorListener = (error: DxLinkError) => void

/**
 * Error thrown by the RPC wrappers when a call ends abnormally on the client side —
 * for example when the server closes the channel without producing the expected response.
 */
export class DxLinkRpcError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'DxLinkRpcError'
    if (cause !== undefined) {
      // `Error.cause` (ES2022) assigned defensively to stay within the ES2020 lib target.
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}
