import {
  DXLinkAuthState,
  DXLinkConnectionState,
  DXLinkLogLevel,
  DXLinkWebSocketClient,
} from '@dxfeed/dxlink-api'
import type { DXLinkClient, DXLinkConnectionDetails, DXLinkError } from '@dxfeed/dxlink-api'
import { createStore } from 'zustand/vanilla'

import type { ViewModel } from '../../shared/view-model'

/** Connection parameters entered in the form and passed to the client config. */
export interface ConnectionParams {
  keepaliveInterval: number
  keepaliveTimeout: number
  acceptKeepaliveTimeout: number
}

/** A connection-level error, timestamped for the error center. */
export interface ConnectionError {
  type: string
  message: string
  time: string
}

export interface ConnectionVMState {
  connection: DXLinkConnectionState
  /**
   * Tri-state auth gating: `undefined` until we know (not connected / connecting),
   * then the server-reported `DXLinkAuthState`. Never seeded to UNAUTHORIZED so a
   * no-auth server doesn't flash a token form.
   */
  auth: DXLinkAuthState | undefined
  details: DXLinkConnectionDetails | null
  errors: ConnectionError[]
}

const createInitialState = (): ConnectionVMState => ({
  connection: DXLinkConnectionState.NOT_CONNECTED,
  auth: undefined,
  details: null,
  errors: [],
})

/**
 * Page-scoped ViewModel wrapping a single {@link DXLinkWebSocketClient}. Owns the
 * client as a private field (kept off the store), wires its listeners once, and
 * maps connection / auth / error events into the store. Commands: connect,
 * reconnect, disconnect, setAuthToken, clearErrors.
 *
 * Debug-console client opts are preserved from the legacy console: `logLevel:
 * DEBUG` and `maxReconnectAttempts: 1` (a debug console deliberately limits
 * reconnect).
 */
export class ConnectionViewModel implements ViewModel<ConnectionVMState> {
  readonly store = createStore<ConnectionVMState>(() => createInitialState())

  private client: DXLinkWebSocketClient | null = null

  connect = (url: string, params: ConnectionParams): void => {
    this.teardownClient()
    // Reset errors from any previous connection attempt.
    this.store.setState({ errors: [] })

    const client = new DXLinkWebSocketClient({
      keepaliveInterval: params.keepaliveInterval,
      keepaliveTimeout: params.keepaliveTimeout,
      acceptKeepaliveTimeout: params.acceptKeepaliveTimeout,
      logLevel: DXLinkLogLevel.DEBUG,
      maxReconnectAttempts: 1,
    })
    client.addConnectionStateChangeListener(this.handleConnectionState)
    client.addAuthStateChangeListener(this.handleAuthState)
    client.addErrorListener(this.handleError)
    this.client = client

    client.connect(url)
    this.syncFromClient()
  }

  reconnect = (): void => {
    this.client?.reconnect()
  }

  disconnect = (): void => {
    this.teardownClient()
    this.store.setState({
      connection: DXLinkConnectionState.NOT_CONNECTED,
      auth: undefined,
      details: null,
    })
  }

  setAuthToken = (token: string): void => {
    this.client?.setAuthToken(token)
  }

  /**
   * The live client, for opening channels (e.g. building a FeedViewModel). Non-null
   * only while connected — channel views are gated behind the AUTHORIZED state.
   */
  getClient = (): DXLinkClient | null => this.client

  clearErrors = (): void => {
    this.store.setState({ errors: [] })
  }

  /**
   * Release the client + listeners. Idempotent and NON-permanent: after a dispose
   * (e.g. React StrictMode's setup→cleanup→setup, which reuses the same VM via
   * useState) the VM stays usable — the next `connect()` simply builds a fresh
   * client. A real page unmount disposes it for good because nothing calls it again.
   */
  dispose = (): void => {
    this.teardownClient()
  }

  private handleConnectionState = (state: DXLinkConnectionState): void => {
    this.store.setState({
      connection: state,
      details:
        state === DXLinkConnectionState.NOT_CONNECTED
          ? null
          : (this.client?.getConnectionDetails() ?? null),
      // Read the server-reported auth state once connected; clear it otherwise.
      auth: state === DXLinkConnectionState.CONNECTED ? this.client?.getAuthState() : undefined,
    })
  }

  private handleAuthState = (state: DXLinkAuthState): void => {
    this.store.setState({ auth: state })
  }

  private handleError = (error: DXLinkError): void => {
    const entry: ConnectionError = {
      type: error.type,
      message: error.message,
      time: new Date().toLocaleTimeString(),
    }
    this.store.setState((state) => ({ errors: [entry, ...state.errors] }))
  }

  /** Pull the current state straight off the client (e.g. right after connect()). */
  private syncFromClient = (): void => {
    const client = this.client
    if (client === null) return
    const connection = client.getConnectionState()
    this.store.setState({
      connection,
      details:
        connection === DXLinkConnectionState.NOT_CONNECTED ? null : client.getConnectionDetails(),
      auth: connection === DXLinkConnectionState.CONNECTED ? client.getAuthState() : undefined,
    })
  }

  private teardownClient = (): void => {
    const client = this.client
    if (client === null) return
    client.removeConnectionStateChangeListener(this.handleConnectionState)
    client.removeAuthStateChangeListener(this.handleAuthState)
    client.removeErrorListener(this.handleError)
    client.close()
    this.client = null
  }
}
