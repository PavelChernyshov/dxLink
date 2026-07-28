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
  type DxLinkMessageCodec,
  type DxLinkMethodDescriptor,
  DxLinkRpcError,
  type DxLinkServiceClient,
  type DxLinkUnsubscribe,
  type GenService,
  type GenServiceMethods,
  jsonMessageCodec,
  protobufMessageCodec,
  serverStream,
  unary,
} from '@dxfeed/dxlink-client-v2'

import { createJsonFrameCodec, type DxLinkFrameCodec } from './codec'
import { createProtobufFrameCodec } from './protobuf-codec'
import {
  DXLINK_CONNECTION_CHANNEL,
  DXLINK_FRAME_TYPES,
  DXLINK_WS_PROTOCOL_VERSION,
  type DxLinkFrame,
} from './protocol'
import { type DxLinkWsDuplex, type DxLinkWsTransportFactory, webSocketTransport } from './transport'

/**
 * Configuration for {@link DxLinkWebSocketClient}.
 */
export interface DxLinkWebSocketClientConfig {
  /** WebSocket endpoint URL. */
  readonly url: string
  /**
   * Wire format: `'protobuf'` (`dxlink-ws-protobuf`, binary `DxLinkWsFrame`) or `'json'`
   * (`dxlink-ws-json`, canonical protobuf-JSON). Selects the matching frame + message codecs
   * unless {@link DxLinkWebSocketClientConfig.frameCodec} / `messageCodec` override them.
   * @default 'protobuf'
   */
  readonly format?: 'json' | 'protobuf'
  /** Authorization token, or a factory resolving one. */
  readonly authToken?: DxLinkAuthToken
  /** Seconds between outbound KEEPALIVE messages. `0` disables. @default 30 */
  readonly keepaliveInterval?: number
  /** Seconds the client tolerates without server messages, advertised in SETUP. @default 60 */
  readonly keepaliveTimeout?: number
  /** Seconds between server KEEPALIVE messages the client prefers, advertised in SETUP. @default 10 */
  readonly acceptKeepaliveTimeout?: number
  /** Max reconnect attempts. `-1` unlimited, `0` disables. @default -1 */
  readonly maxReconnectAttempts?: number
  /** Delay in milliseconds between reconnect attempts. @default 1000 */
  readonly reconnectDelay?: number
  /** Milliseconds to await the server SETUP reply before failing. `0` disables. @default 10000 */
  readonly setupTimeout?: number
  /** Transport factory override (default {@link webSocketTransport}). */
  readonly transport?: DxLinkWsTransportFactory
  /** Frame codec override (default derived from {@link DxLinkWebSocketClientConfig.format}). */
  readonly frameCodec?: DxLinkFrameCodec
  /** RPC payload codec (default canonical protobuf-JSON `jsonMessageCodec` from the base). */
  readonly messageCodec?: DxLinkMessageCodec
}

type ChannelState = 'PENDING' | 'REQUESTED' | 'OPENED' | 'CLOSED'

interface ChannelEntry<I = unknown, O = unknown> {
  readonly id: number
  readonly descriptor: DxLinkMethodDescriptor<I, O>
  state: ChannelState
  readonly responses: ReadableStreamDefaultController<O>
  readonly outbound: I[]
  inputClosed: boolean
}

interface ResolvedConfig {
  url: string
  keepaliveInterval: number
  keepaliveTimeout: number
  acceptKeepaliveTimeout: number
  maxReconnectAttempts: number
  reconnectDelay: number
  setupTimeout: number
}

/**
 * WebSocket implementation of {@link DxLinkClient} for dxLink protocol v1.0.
 *
 * Owns the connection state machine (SETUP negotiation, AUTH, KEEPALIVE, reconnect) and the
 * channel multiplexer. Each {@link DxLinkWebSocketClient.createCall} allocates a channel and maps
 * it to a {@link DxLinkCall} duplex of WHATWG streams; {@link DxLinkWebSocketClient.createService}
 * builds typed service clients over it.
 *
 * The wire codec and transport are injectable seams, so the same state machine drives both
 * subprotocols and can be unit-tested with an in-memory transport.
 */
export class DxLinkWebSocketClient implements DxLinkClient {
  private readonly config: ResolvedConfig
  private readonly codec: DxLinkFrameCodec
  private readonly messageCodec: DxLinkMessageCodec
  private readonly transportFactory: DxLinkWsTransportFactory

  private connectionState: DxLinkConnectionState = DxLinkConnectionState.NOT_CONNECTED
  private authState: DxLinkAuthState = DxLinkAuthState.UNAUTHORIZED
  private authToken: DxLinkAuthToken | undefined

  private duplex: DxLinkWsDuplex | undefined
  private writer: WritableStreamDefaultWriter<string | Uint8Array> | undefined
  private reader: ReadableStreamDefaultReader<string | Uint8Array> | undefined

  private readonly channels = new Map<number, ChannelEntry>()
  private nextChannel = 1

  private keepaliveTimer: ReturnType<typeof setInterval> | undefined
  private setupTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private reconnectAttempts = 0
  private intentionalClose = false

  private readonly stateListeners = new Set<DxLinkConnectionStateChangeListener>()
  private readonly authListeners = new Set<DxLinkAuthStateChangeListener>()
  private readonly errorListeners = new Set<DxLinkErrorListener>()

  constructor(config: DxLinkWebSocketClientConfig) {
    this.config = {
      url: config.url,
      keepaliveInterval: config.keepaliveInterval ?? 30,
      keepaliveTimeout: config.keepaliveTimeout ?? 60,
      acceptKeepaliveTimeout: config.acceptKeepaliveTimeout ?? 10,
      maxReconnectAttempts: config.maxReconnectAttempts ?? -1,
      reconnectDelay: config.reconnectDelay ?? 1000,
      setupTimeout: config.setupTimeout ?? 10000,
    }
    this.authToken = config.authToken
    this.transportFactory = config.transport ?? webSocketTransport

    const format = config.format ?? 'protobuf'
    this.messageCodec =
      config.messageCodec ?? (format === 'protobuf' ? protobufMessageCodec : jsonMessageCodec)
    this.codec =
      config.frameCodec ??
      (format === 'protobuf' ? createProtobufFrameCodec() : createJsonFrameCodec())
  }

  connect(): void {
    if (this.connectionState !== DxLinkConnectionState.NOT_CONNECTED) return
    this.intentionalClose = false
    this.reconnectAttempts = 0
    this.setConnectionState(DxLinkConnectionState.CONNECTING)
    void this.openConnection()
  }

  disconnect(): void {
    this.intentionalClose = true
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.teardown('Disconnected by client')
    this.setConnectionState(DxLinkConnectionState.NOT_CONNECTED)
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
      void this.sendAuth()
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
    const id = this.allocateChannel()

    let controller!: ReadableStreamDefaultController<O>
    const responses = new ReadableStream<O>({
      start: (c) => {
        controller = c
      },
      cancel: (reason) => this.cancelChannel(id, reason),
    })

    const entry: ChannelEntry<I, O> = {
      id,
      descriptor: method,
      state: 'PENDING',
      responses: controller,
      outbound: [],
      inputClosed: false,
    }
    this.channels.set(id, entry as ChannelEntry)

    const requests = new WritableStream<I>({
      write: (value) => this.sendData(id, value),
      close: () => {
        entry.inputClosed = true
      },
      abort: (reason) => this.cancelChannel(id, reason),
    })

    const signal = options?.signal
    if (signal !== undefined) {
      if (signal.aborted) {
        this.cancelChannel(id, signal.reason)
      } else {
        signal.addEventListener('abort', () => this.cancelChannel(id, signal.reason), {
          once: true,
        })
      }
    }

    if (this.connectionState === DxLinkConnectionState.CONNECTED) {
      this.sendChannelRequest(entry as ChannelEntry)
    }

    return { requests, responses }
  }

  createService<S extends GenServiceMethods>(service: GenService<S>): DxLinkServiceClient<S> {
    const methods = service.method as Record<string, DescMethod>
    const api: Record<string, unknown> = {}

    // This transport carries unary and server-streaming RPCs only. Client-streaming and
    // bidi-streaming need a graceful request half-close, which the dxLink v1.0 wire does not yet
    // provide (see PLAN-v2.md); mapping them here would be unsound, so they are rejected.
    for (const [localName, method] of Object.entries(methods)) {
      const input = { typeName: method.input.typeName, schema: method.input }
      const output = { typeName: method.output.typeName, schema: method.output }

      switch (method.methodKind) {
        case 'unary': {
          const descriptor: DxLinkMethodDescriptor<unknown, unknown> = {
            service: service.typeName,
            name: method.name,
            model: 'REQUEST_RESPONSE',
            input,
            output,
          }
          api[localName] = (request: unknown, options?: DxLinkCallOptions) =>
            unary(this, descriptor, request, options)
          break
        }
        case 'server_streaming': {
          const descriptor: DxLinkMethodDescriptor<unknown, unknown> = {
            service: service.typeName,
            name: method.name,
            model: 'REQUEST_STREAM',
            input,
            output,
          }
          api[localName] = (request: unknown, options?: DxLinkCallOptions) =>
            serverStream(this, descriptor, request, options)
          break
        }
        default:
          throw new DxLinkRpcError(
            `DxLinkWebSocketClient does not support the ${method.methodKind} interaction model ` +
              `required by ${service.typeName}/${method.name}`
          )
      }
    }

    return api as DxLinkServiceClient<S>
  }

  // ── connection lifecycle ───────────────────────────────────────────────────

  private async openConnection(): Promise<void> {
    let duplex: DxLinkWsDuplex
    try {
      duplex = await this.transportFactory(this.config.url, this.codec.subprotocol)
    } catch {
      this.handleTransportClosed('Failed to connect')
      return
    }

    if (this.intentionalClose) {
      void duplex.writable.close().catch(() => {})
      void duplex.readable.cancel().catch(() => {})
      return
    }

    this.duplex = duplex
    this.writer = duplex.writable.getWriter()
    this.startReadLoop(duplex.readable)

    this.send({
      type: DXLINK_FRAME_TYPES.SETUP,
      channel: DXLINK_CONNECTION_CHANNEL,
      version: DXLINK_WS_PROTOCOL_VERSION,
      keepaliveTimeout: this.config.keepaliveTimeout,
      acceptKeepaliveTimeout: this.config.acceptKeepaliveTimeout,
    })
    this.startSetupTimeout()
  }

  private startReadLoop(readable: ReadableStream<string | Uint8Array>): void {
    const reader = readable.getReader()
    this.reader = reader

    const loop = async (): Promise<void> => {
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          let frame: DxLinkFrame
          try {
            frame = this.codec.decode(value)
          } catch (error) {
            this.emitError({ type: 'INVALID_MESSAGE', message: String(error) })
            continue
          }
          this.handleFrame(frame)
        }
      } catch {
        // read error — fall through to teardown
      }
      if (this.reader === reader) {
        this.handleTransportClosed('Connection closed')
      }
    }

    void loop()
  }

  private handleFrame(frame: DxLinkFrame): void {
    switch (frame.type) {
      case DXLINK_FRAME_TYPES.SETUP:
        this.onServerSetup()
        break
      case DXLINK_FRAME_TYPES.AUTH_STATE:
        this.onAuthState(frame.state === 'AUTHORIZED')
        break
      case DXLINK_FRAME_TYPES.KEEPALIVE:
        break
      case DXLINK_FRAME_TYPES.ERROR:
        this.onErrorFrame(frame.channel, { type: frame.error, message: frame.message })
        break
      case DXLINK_FRAME_TYPES.CHANNEL_OPENED:
        this.onChannelOpened(frame.channel)
        break
      case DXLINK_FRAME_TYPES.CHANNEL_DATA:
        this.onChannelData(frame.channel, frame.payload)
        break
      case DXLINK_FRAME_TYPES.CHANNEL_CLOSED:
        this.onChannelClosed(frame.channel)
        break
      // AUTH / CHANNEL_REQUEST / CHANNEL_CANCEL are client-to-server; ignore if echoed.
    }
  }

  private onServerSetup(): void {
    this.clearSetupTimeout()
    if (this.connectionState === DxLinkConnectionState.CONNECTED) return
    this.setConnectionState(DxLinkConnectionState.CONNECTED)
    this.reconnectAttempts = 0
    this.startKeepalive()
    if (this.authToken !== undefined) {
      void this.sendAuth()
    } else {
      this.flushPendingChannels()
    }
  }

  private async sendAuth(): Promise<void> {
    const token = this.authToken
    if (token === undefined) return
    this.setAuthState(DxLinkAuthState.AUTHORIZING)
    let resolved: string
    try {
      resolved = typeof token === 'function' ? await token() : token
    } catch {
      this.emitError({ type: 'UNAUTHORIZED', message: 'Failed to resolve auth token' })
      return
    }
    if (this.connectionState !== DxLinkConnectionState.CONNECTED) return
    this.send({
      type: DXLINK_FRAME_TYPES.AUTH,
      channel: DXLINK_CONNECTION_CHANNEL,
      token: resolved,
    })
  }

  private onAuthState(authorized: boolean): void {
    this.setAuthState(authorized ? DxLinkAuthState.AUTHORIZED : DxLinkAuthState.UNAUTHORIZED)
    // Flush pending channels once auth resolves either way — services that don't require auth
    // proceed; those that do will be rejected per-channel with an ERROR frame.
    this.flushPendingChannels()
  }

  // ── channel handling ────────────────────────────────────────────────────────

  private onChannelOpened(id: number): void {
    const entry = this.channels.get(id)
    if (entry === undefined) return
    entry.state = 'OPENED'
    this.flushOutbound(entry)
  }

  private onChannelData(id: number, payload: unknown): void {
    const entry = this.channels.get(id)
    if (entry === undefined) return
    try {
      entry.responses.enqueue(this.messageCodec.decode(entry.descriptor.output, payload))
    } catch (error) {
      this.failChannel(id, error)
    }
  }

  private onChannelClosed(id: number): void {
    const entry = this.channels.get(id)
    if (entry === undefined) return
    this.channels.delete(id)
    entry.state = 'CLOSED'
    try {
      entry.responses.close()
    } catch {
      // consumer already canceled/closed
    }
  }

  private onErrorFrame(channel: number, error: DxLinkError): void {
    this.emitError(error)
    if (channel !== DXLINK_CONNECTION_CHANNEL) {
      this.failChannel(channel, error)
    }
  }

  private sendChannelRequest(entry: ChannelEntry): void {
    this.send({
      type: DXLINK_FRAME_TYPES.CHANNEL_REQUEST,
      channel: entry.id,
      service: entry.descriptor.service,
      method: entry.descriptor.name,
    })
    entry.state = 'REQUESTED'
  }

  private flushPendingChannels(): void {
    for (const entry of this.channels.values()) {
      if (entry.state === 'PENDING') this.sendChannelRequest(entry)
    }
  }

  private sendData(id: number, value: unknown): void {
    const entry = this.channels.get(id)
    if (entry === undefined || entry.state === 'CLOSED') return
    if (entry.state === 'OPENED') {
      this.send({
        type: DXLINK_FRAME_TYPES.CHANNEL_DATA,
        channel: id,
        payload: this.messageCodec.encode(entry.descriptor.input, value),
      })
    } else {
      entry.outbound.push(value)
    }
  }

  private flushOutbound(entry: ChannelEntry): void {
    if (entry.outbound.length === 0) return
    const pending = entry.outbound.splice(0)
    for (const value of pending) {
      this.send({
        type: DXLINK_FRAME_TYPES.CHANNEL_DATA,
        channel: entry.id,
        payload: this.messageCodec.encode(entry.descriptor.input, value),
      })
    }
  }

  private cancelChannel(id: number, reason?: unknown): void {
    const entry = this.channels.get(id)
    if (entry === undefined) return
    this.channels.delete(id)
    const serverKnows = entry.state === 'REQUESTED' || entry.state === 'OPENED'
    entry.state = 'CLOSED'
    if (serverKnows && this.connectionState === DxLinkConnectionState.CONNECTED) {
      this.send({ type: DXLINK_FRAME_TYPES.CHANNEL_CANCEL, channel: id })
    }
    try {
      entry.responses.error(reason ?? new DxLinkRpcError('Call canceled'))
    } catch {
      // consumer canceled the response stream itself
    }
  }

  private failChannel(id: number, error: unknown): void {
    const entry = this.channels.get(id)
    if (entry === undefined) return
    this.channels.delete(id)
    entry.state = 'CLOSED'
    try {
      entry.responses.error(error)
    } catch {
      // consumer already canceled/closed
    }
  }

  private allocateChannel(): number {
    let id = this.nextChannel
    while (id === DXLINK_CONNECTION_CHANNEL || this.channels.has(id)) id++
    this.nextChannel = id + 1
    return id
  }

  // ── transport teardown & reconnect ──────────────────────────────────────────

  private handleTransportClosed(reason: string): void {
    if (this.duplex === undefined && this.connectionState === DxLinkConnectionState.NOT_CONNECTED) {
      return
    }
    this.teardown(reason)
    if (this.intentionalClose || !this.canReconnect()) {
      this.setConnectionState(DxLinkConnectionState.NOT_CONNECTED)
      return
    }
    this.setConnectionState(DxLinkConnectionState.CONNECTING)
    this.scheduleReconnect()
  }

  private teardown(reason: string): void {
    this.stopKeepalive()
    this.clearSetupTimeout()

    const error: DxLinkError = { type: 'UNKNOWN', message: reason }
    for (const id of [...this.channels.keys()]) {
      this.failChannel(id, error)
    }

    const { reader, writer } = this
    this.reader = undefined
    this.writer = undefined
    this.duplex = undefined
    void reader?.cancel().catch(() => {})
    void writer?.abort().catch(() => {})
  }

  private canReconnect(): boolean {
    const max = this.config.maxReconnectAttempts
    if (max === 0) return false
    if (max < 0) return true
    return this.reconnectAttempts < max
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.openConnection()
    }, this.config.reconnectDelay)
  }

  // ── timers ───────────────────────────────────────────────────────────────────

  private startKeepalive(): void {
    const interval = this.config.keepaliveInterval
    if (interval <= 0) return
    this.keepaliveTimer = setInterval(() => {
      if (this.connectionState === DxLinkConnectionState.CONNECTED) {
        this.send({ type: DXLINK_FRAME_TYPES.KEEPALIVE, channel: DXLINK_CONNECTION_CHANNEL })
      }
    }, interval * 1000)
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== undefined) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = undefined
    }
  }

  private startSetupTimeout(): void {
    const timeout = this.config.setupTimeout
    if (timeout <= 0) return
    this.setupTimer = setTimeout(() => {
      this.setupTimer = undefined
      this.emitError({ type: 'TIMEOUT', message: 'Timed out waiting for server SETUP' })
      this.handleTransportClosed('SETUP timeout')
    }, timeout)
  }

  private clearSetupTimeout(): void {
    if (this.setupTimer !== undefined) {
      clearTimeout(this.setupTimer)
      this.setupTimer = undefined
    }
  }

  // ── outbound framing & listeners ──────────────────────────────────────────────

  private send(frame: DxLinkFrame): void {
    const writer = this.writer
    if (writer === undefined) return
    let data: string | Uint8Array
    try {
      data = this.codec.encode(frame)
    } catch (error) {
      this.emitError({ type: 'INVALID_MESSAGE', message: String(error) })
      return
    }
    writer.write(data).catch(() => this.handleTransportClosed('Write failed'))
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
