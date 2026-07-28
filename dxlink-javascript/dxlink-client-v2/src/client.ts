import type { GenService, GenServiceMethods } from '@bufbuild/protobuf/codegenv2'

import type { DxLinkAuthState, DxLinkAuthStateChangeListener } from './auth'
import type { DxLinkCall, DxLinkCallOptions, DxLinkUnsubscribe } from './call'
import type { DxLinkConnectionState, DxLinkConnectionStateChangeListener } from './connection'
import type { DxLinkErrorListener } from './error'
import type { DxLinkMethodDescriptor } from './method'
import type { DxLinkServiceClient } from './service'

/**
 * Authorization token, or a factory that resolves one (sync or async) each time it is needed.
 */
export type DxLinkAuthToken = string | (() => string | Promise<string>)

/**
 * dxLink RPC client for protocol v1.0.
 *
 * `DxLinkClient` *is* the RPC abstraction: connection lifecycle, authorization and state,
 * plus the single polymorphic seam {@link DxLinkClient.createCall} that opens a typed
 * {@link DxLinkCall} duplex. WebSocket / HTTP / gRPC are interchangeable *implementations* of
 * this interface — the wrappers and generated service clients work against any of them.
 *
 * Prefer the wrappers ({@link unary}, {@link serverStream}, {@link clientStream},
 * {@link bidiStream}) over calling {@link DxLinkClient.createCall} directly.
 */
export interface DxLinkClient {
  /**
   * Connect to the remote endpoint. The state immediately becomes
   * {@link DxLinkConnectionState.CONNECTING}. Set an auth token via
   * {@link DxLinkClient.setAuthToken} beforehand for authorized connections.
   */
  connect(): void
  /**
   * Disconnect from the remote endpoint and release resources. The state immediately becomes
   * {@link DxLinkConnectionState.NOT_CONNECTED}.
   */
  disconnect(): void

  /**
   * Get the current connection state.
   */
  getState(): DxLinkConnectionState
  /**
   * Subscribe to connection state changes.
   * @returns an unsubscribe function.
   */
  onStateChange(listener: DxLinkConnectionStateChangeListener): DxLinkUnsubscribe

  /**
   * Set the authorization token (or token factory) used when connecting.
   */
  setAuthToken(token: DxLinkAuthToken): void
  /**
   * Get the current authentication state.
   */
  getAuthState(): DxLinkAuthState
  /**
   * Subscribe to authentication state changes.
   * @returns an unsubscribe function.
   */
  onAuthStateChange(listener: DxLinkAuthStateChangeListener): DxLinkUnsubscribe

  /**
   * Subscribe to errors reported by the remote endpoint.
   * @returns an unsubscribe function.
   */
  onError(listener: DxLinkErrorListener): DxLinkUnsubscribe

  /**
   * Open a typed RPC call to the method described by `method`.
   *
   * Each call is an isolated duplex (one protocol channel). The interaction model in the
   * descriptor governs how many messages flow in each direction.
   */
  createCall<I, O>(
    method: DxLinkMethodDescriptor<I, O>,
    options?: DxLinkCallOptions
  ): DxLinkCall<I, O>

  /**
   * Create a typed client for a generated service, bound to this connection.
   *
   * Each RPC becomes a method whose shape follows its interaction model (unary/client-streaming →
   * `Promise`, server-/bidi-streaming → `ReadableStream`). No per-service codegen — the client is
   * derived from the `protoc-gen-es` service descriptor at runtime.
   *
   * @example
   * const orders = dxlink.createService(OrderEntryService)
   * const res = await orders.issueOrder(req, { signal })
   */
  createService<S extends GenServiceMethods>(service: GenService<S>): DxLinkServiceClient<S>
}
