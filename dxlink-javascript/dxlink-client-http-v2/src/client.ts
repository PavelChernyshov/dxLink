import {
  type DescMethod,
  type DxLinkAuthStateChangeListener,
  type DxLinkAuthToken,
  DxLinkAuthState,
  type DxLinkCall,
  type DxLinkCallOptions,
  type DxLinkClient,
  type DxLinkConnectionStateChangeListener,
  DxLinkConnectionState,
  type DxLinkError,
  type DxLinkErrorListener,
  type DxLinkErrorType,
  type DxLinkMessageCodec,
  type DxLinkMethodDescriptor,
  DxLinkRpcError,
  type DxLinkServiceClient,
  type DxLinkUnsubscribe,
  type GenService,
  type GenServiceMethods,
  jsonMessageCodec,
  unary,
} from '@dxfeed/dxlink-client-v2'

/** Minimal `fetch` signature the client relies on, so callers can inject a stub. */
export type DxLinkFetch = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Configuration for {@link DxLinkHttpClient}.
 */
export interface DxLinkHttpClientConfig {
  /**
   * Base URL of the dxLink HTTP endpoint, e.g. `https://host` or `https://host/api`. The RPC path
   * `/{service}/{method}` (lower-cased) is appended per method.
   */
  readonly baseUrl: string
  /** Authorization token, or a factory resolving one. Sent as `Authorization: Bearer <token>`. */
  readonly authToken?: DxLinkAuthToken
  /** `fetch` implementation (default: global `fetch`). Injectable for tests / custom agents. */
  readonly fetch?: DxLinkFetch
  /** Extra headers merged into every request (after the defaults, before `Authorization`). */
  readonly headers?: Readonly<Record<string, string>>
  /** RPC payload codec (default canonical protobuf-JSON `jsonMessageCodec` from the base). */
  readonly messageCodec?: DxLinkMessageCodec
}

const DEFAULT_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  accept: 'application/json',
}

/**
 * Map an HTTP status from `dxlink-http-framework` to a {@link DxLinkErrorType}.
 * Mirrors the server's status mapping (see `DxLinkRpcReqRespMethodHandler`).
 */
const httpStatusToErrorType = (status: number): DxLinkErrorType => {
  switch (status) {
    case 400:
    case 415:
      return 'INVALID_MESSAGE'
    case 401:
    case 403:
      return 'UNAUTHORIZED'
    case 404:
      return 'BAD_ACTION'
    case 504:
      return 'TIMEOUT'
    case 505:
      return 'UNSUPPORTED_PROTOCOL'
    default:
      return 'UNKNOWN'
  }
}

const withBearer = (token: string): string =>
  token.startsWith('Bearer ') ? token : `Bearer ${token}`

/**
 * HTTP implementation of {@link DxLinkClient} for dxLink protocol v1.0.
 *
 * Speaks the `dxlink-http-framework` HTTP/JSON transcoding binding: each unary RPC is a
 * `POST /{service}/{method}` (path lower-cased) with a canonical protobuf-JSON body and a
 * protobuf-JSON response, `Authorization: Bearer <token>` for auth. HTTP is connectionless, so
 * {@link DxLinkHttpClient.connect} just flips state to `CONNECTED`; there is no SETUP/KEEPALIVE.
 *
 * Only the `REQUEST_RESPONSE` interaction model is supported — the transcoding binding returns
 * `505` for streaming, so {@link DxLinkHttpClient.createService} rejects streaming methods.
 */
export class DxLinkHttpClient implements DxLinkClient {
  private readonly baseUrl: string
  private readonly fetchFn: DxLinkFetch | undefined
  private readonly headers: Record<string, string>
  private readonly messageCodec: DxLinkMessageCodec

  private authToken: DxLinkAuthToken | undefined
  private connectionState: DxLinkConnectionState = DxLinkConnectionState.NOT_CONNECTED
  private authState: DxLinkAuthState = DxLinkAuthState.UNAUTHORIZED

  private readonly stateListeners = new Set<DxLinkConnectionStateChangeListener>()
  private readonly authListeners = new Set<DxLinkAuthStateChangeListener>()
  private readonly errorListeners = new Set<DxLinkErrorListener>()

  constructor(config: DxLinkHttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.fetchFn = config.fetch ?? globalThis.fetch?.bind(globalThis)
    this.headers = { ...DEFAULT_HEADERS, ...config.headers }
    this.messageCodec = config.messageCodec ?? jsonMessageCodec
    this.authToken = config.authToken
  }

  connect(): void {
    if (this.connectionState !== DxLinkConnectionState.NOT_CONNECTED) return
    // HTTP is connectionless — there is no handshake, so we are immediately ready. Authorization
    // is validated per request; reflect an optimistic auth state from whether a token is set.
    this.setConnectionState(DxLinkConnectionState.CONNECTED)
    this.setAuthState(
      this.authToken !== undefined ? DxLinkAuthState.AUTHORIZED : DxLinkAuthState.UNAUTHORIZED
    )
  }

  disconnect(): void {
    this.setConnectionState(DxLinkConnectionState.NOT_CONNECTED)
    this.setAuthState(DxLinkAuthState.UNAUTHORIZED)
  }

  getState(): DxLinkConnectionState {
    return this.connectionState
  }

  onStateChange(listener: DxLinkConnectionStateChangeListener): DxLinkUnsubscribe {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  setAuthToken(token: DxLinkAuthToken): void {
    this.authToken = token
    if (this.connectionState === DxLinkConnectionState.CONNECTED) {
      this.setAuthState(DxLinkAuthState.AUTHORIZED)
    }
  }

  getAuthState(): DxLinkAuthState {
    return this.authState
  }

  onAuthStateChange(listener: DxLinkAuthStateChangeListener): DxLinkUnsubscribe {
    this.authListeners.add(listener)
    return () => this.authListeners.delete(listener)
  }

  onError(listener: DxLinkErrorListener): DxLinkUnsubscribe {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  createCall<I, O>(
    method: DxLinkMethodDescriptor<I, O>,
    options?: DxLinkCallOptions
  ): DxLinkCall<I, O> {
    let controller!: ReadableStreamDefaultController<O>
    const responses = new ReadableStream<O>({
      start: (c) => {
        controller = c
      },
    })

    let dispatched = false
    const requests = new WritableStream<I>({
      write: (value) => {
        // Unary: the single request drives one HTTP round-trip; extra writes are ignored.
        if (dispatched) return
        dispatched = true
        return this.dispatch(method, value, controller, options)
      },
    })

    return { requests, responses }
  }

  createService<S extends GenServiceMethods>(service: GenService<S>): DxLinkServiceClient<S> {
    const methods = service.method as Record<string, DescMethod>
    const api: Record<string, unknown> = {}

    // The HTTP/JSON transcoding binding supports only REQUEST_RESPONSE; the server returns 505 for
    // any streaming model, so those are rejected here rather than mapped to a broken call.
    for (const [localName, method] of Object.entries(methods)) {
      if (method.methodKind !== 'unary') {
        throw new DxLinkRpcError(
          `DxLinkHttpClient does not support the ${method.methodKind} interaction model ` +
            `required by ${service.typeName}/${method.name} (HTTP supports REQUEST_RESPONSE only)`
        )
      }
      const descriptor: DxLinkMethodDescriptor<unknown, unknown> = {
        service: service.typeName,
        name: method.name,
        model: 'REQUEST_RESPONSE',
        input: { typeName: method.input.typeName, schema: method.input },
        output: { typeName: method.output.typeName, schema: method.output },
      }
      api[localName] = (request: unknown, options?: DxLinkCallOptions) =>
        unary(this, descriptor, request, options)
    }

    return api as DxLinkServiceClient<S>
  }

  // ── request dispatch ─────────────────────────────────────────────────────────

  private async dispatch<I, O>(
    method: DxLinkMethodDescriptor<I, O>,
    value: I,
    controller: ReadableStreamDefaultController<O>,
    options: DxLinkCallOptions | undefined
  ): Promise<void> {
    if (this.connectionState !== DxLinkConnectionState.CONNECTED) {
      controller.error(new DxLinkRpcError('DxLinkHttpClient is not connected'))
      return
    }
    const fetchFn = this.fetchFn
    if (fetchFn === undefined) {
      controller.error(new DxLinkRpcError('No fetch implementation available'))
      return
    }

    let body: string
    try {
      body = JSON.stringify(this.messageCodec.encode(method.input, value))
    } catch (error) {
      controller.error(
        new DxLinkRpcError(`Failed to encode ${method.service}/${method.name}`, error)
      )
      return
    }

    const headers: Record<string, string> = { ...this.headers }
    try {
      const token = await this.resolveToken()
      if (token !== undefined) headers.authorization = withBearer(token)
    } catch (error) {
      controller.error(new DxLinkRpcError('Failed to resolve auth token', error))
      return
    }

    const url = this.baseUrl + `/${method.service}/${method.name}`.toLowerCase()

    let response: Response
    try {
      response = await fetchFn(url, { method: 'POST', headers, body, signal: options?.signal })
    } catch (error) {
      controller.error(
        new DxLinkRpcError(`HTTP request to ${method.service}/${method.name} failed`, error)
      )
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      if (response.status === 401 || response.status === 403) {
        this.setAuthState(DxLinkAuthState.UNAUTHORIZED)
      }
      const error: DxLinkError = {
        type: httpStatusToErrorType(response.status),
        message: text.length > 0 ? text : `HTTP ${response.status}`,
      }
      this.emitError(error)
      controller.error(error)
      return
    }

    let decoded: O
    try {
      const text = await response.text()
      const json: unknown = text.length > 0 ? JSON.parse(text) : {}
      decoded = this.messageCodec.decode(method.output, json)
    } catch (error) {
      controller.error(
        new DxLinkRpcError(`Failed to decode ${method.service}/${method.name} response`, error)
      )
      return
    }

    controller.enqueue(decoded)
    controller.close()
  }

  private async resolveToken(): Promise<string | undefined> {
    const token = this.authToken
    if (token === undefined) return undefined
    return typeof token === 'function' ? token() : token
  }

  private setConnectionState(next: DxLinkConnectionState): void {
    if (next === this.connectionState) return
    const prev = this.connectionState
    this.connectionState = next
    for (const listener of this.stateListeners) listener(next, prev)
  }

  private setAuthState(next: DxLinkAuthState): void {
    if (next === this.authState) return
    this.authState = next
    for (const listener of this.authListeners) listener(next)
  }

  private emitError(error: DxLinkError): void {
    for (const listener of this.errorListeners) listener(error)
  }
}
