import {
  type DescMethod,
  DxLinkAuthState,
  DxLinkConnectionState,
  type DxLinkInteractionModel,
  type DxLinkMethodDescriptor,
  DxLinkRpcError,
  type GenService,
  passthroughMessageCodec,
  serverStream,
  unary,
} from '@dxfeed/dxlink-client-v2'
import { beforeEach, describe, expect, it } from 'vitest'

import { DxLinkWebSocketClient, type DxLinkWebSocketClientConfig } from './client'
import { createJsonFrameCodec, type DxLinkWsData } from './codec'
import { type DxLinkFrame } from './protocol'
import { type DxLinkWsTransportFactory } from './transport'

/** In-memory transport that lets the test act as the dxLink server. */
interface Harness {
  readonly transport: DxLinkWsTransportFactory
  /** Next frame the client sent to the server. */
  nextClientFrame(): Promise<DxLinkFrame>
  /** Push a server frame to the client. */
  sendServerFrame(frame: DxLinkFrame): Promise<void>
}

const makeHarness = (): Harness => {
  const codec = createJsonFrameCodec()
  const clientToServer = new TransformStream<DxLinkWsData, DxLinkWsData>()
  const serverToClient = new TransformStream<DxLinkWsData, DxLinkWsData>()
  const clientReader = clientToServer.readable.getReader()
  const serverWriter = serverToClient.writable.getWriter()

  return {
    transport: () =>
      Promise.resolve({ readable: serverToClient.readable, writable: clientToServer.writable }),
    async nextClientFrame() {
      const { value, done } = await clientReader.read()
      if (done || value === undefined) throw new Error('client stream ended')
      return codec.decode(value)
    },
    sendServerFrame: (frame) => serverWriter.write(codec.encode(frame)),
  }
}

const descriptor = <I, O>(
  model: DxLinkInteractionModel,
  name: string
): DxLinkMethodDescriptor<I, O> => ({
  service: 'test.Service',
  name,
  model,
  input: { typeName: 'test.In' },
  output: { typeName: 'test.Out' },
})

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await tick()
  }
  throw new Error('condition not met in time')
}

const collect = async <T>(stream: ReadableStream<T>): Promise<T[]> => {
  const out: T[] = []
  const reader = stream.getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      out.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return out
}

/** Construct a client, run the SETUP handshake, and return it CONNECTED. */
const connectClient = async (
  harness: Harness,
  config: Partial<DxLinkWebSocketClientConfig> = {}
): Promise<DxLinkWebSocketClient> => {
  const client = new DxLinkWebSocketClient({
    url: 'ws://test',
    transport: harness.transport,
    format: 'json',
    keepaliveInterval: 0,
    setupTimeout: 0,
    maxReconnectAttempts: 0,
    ...config,
  })
  client.connect()
  const setup = await harness.nextClientFrame()
  expect(setup.type).toBe('SETUP')
  await harness.sendServerFrame({ type: 'SETUP', channel: 0, version: '1.0' })
  return client
}

describe('DxLinkWebSocketClient connection', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  it('performs the SETUP handshake and reaches CONNECTED', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)
    expect(client.getState()).toBe(DxLinkConnectionState.CONNECTED)
  })

  it('advertises protocol version and keepalive params in SETUP', async () => {
    const client = new DxLinkWebSocketClient({
      url: 'ws://test',
      transport: harness.transport,
      format: 'json',
      keepaliveInterval: 0,
      setupTimeout: 0,
      keepaliveTimeout: 42,
      acceptKeepaliveTimeout: 7,
    })
    client.connect()
    const setup = await harness.nextClientFrame()
    expect(setup).toMatchObject({
      type: 'SETUP',
      channel: 0,
      version: '1.0',
      keepaliveTimeout: 42,
      acceptKeepaliveTimeout: 7,
    })
  })

  it('authenticates and transitions auth state', async () => {
    const authStates: DxLinkAuthState[] = []
    const client = new DxLinkWebSocketClient({
      url: 'ws://test',
      transport: harness.transport,
      format: 'json',
      keepaliveInterval: 0,
      setupTimeout: 0,
      authToken: 'the-token',
    })
    client.onAuthStateChange((state) => authStates.push(state))
    client.connect()

    await harness.nextClientFrame() // SETUP
    await harness.sendServerFrame({ type: 'SETUP', channel: 0, version: '1.0' })

    const auth = await harness.nextClientFrame()
    expect(auth).toMatchObject({ type: 'AUTH', channel: 0, token: 'the-token' })

    await harness.sendServerFrame({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED' })
    await waitFor(() => client.getAuthState() === DxLinkAuthState.AUTHORIZED)

    expect(authStates).toEqual([DxLinkAuthState.AUTHORIZING, DxLinkAuthState.AUTHORIZED])
  })
})

describe('DxLinkWebSocketClient channel authorization', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  /**
   * A server announces `AUTH_STATE: UNAUTHORIZED` as its initial state, before it has processed the
   * client's `AUTH`. Opening a channel in that window is answered with a connection-level
   * `BAD_ACTION: AUTH step missing`, which fails the channel with nothing to re-request it — so the
   * call hangs for good. `DXLinkWebSocketClient` never had this problem because it gates channel
   * requests on the authorized state; this client must do the same.
   */
  it('withholds the channel request until the authorized state arrives', async () => {
    const client = new DxLinkWebSocketClient({
      url: 'ws://test',
      transport: harness.transport,
      format: 'json',
      keepaliveInterval: 0,
      setupTimeout: 0,
      maxReconnectAttempts: 0,
      authToken: 'the-token',
    })
    client.connect()

    await harness.nextClientFrame() // SETUP
    await harness.sendServerFrame({ type: 'SETUP', channel: 0, version: '1.0' })
    await harness.nextClientFrame() // AUTH

    // The server's opening position: not authorized yet.
    await harness.sendServerFrame({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' })
    await waitFor(() => client.getAuthState() === DxLinkAuthState.UNAUTHORIZED)

    let nextFrame: DxLinkFrame | undefined
    const pendingFrame = harness.nextClientFrame()
    void pendingFrame.then((frame) => {
      nextFrame = frame
    })

    const stream = serverStream<{ sym: string }, { p: number }>(
      client,
      descriptor('REQUEST_STREAM', 'feed'),
      { sym: 'AAPL' }
    )
    void collect(stream).catch(() => undefined)

    await tick()
    await tick()

    expect(nextFrame).toBeUndefined()

    // Authorization lands: now the channel may be requested.
    await harness.sendServerFrame({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED' })

    expect(await pendingFrame).toMatchObject({
      type: 'CHANNEL_REQUEST',
      service: 'test.Service',
      method: 'feed',
    })
  })

  it('requests a channel opened after authorization immediately', async () => {
    const client = new DxLinkWebSocketClient({
      url: 'ws://test',
      transport: harness.transport,
      format: 'json',
      keepaliveInterval: 0,
      setupTimeout: 0,
      maxReconnectAttempts: 0,
      authToken: 'the-token',
    })
    client.connect()

    await harness.nextClientFrame() // SETUP
    await harness.sendServerFrame({ type: 'SETUP', channel: 0, version: '1.0' })
    await harness.nextClientFrame() // AUTH
    await harness.sendServerFrame({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED' })
    await waitFor(() => client.getAuthState() === DxLinkAuthState.AUTHORIZED)

    const stream = serverStream<{ sym: string }, { p: number }>(
      client,
      descriptor('REQUEST_STREAM', 'feed'),
      { sym: 'AAPL' }
    )
    void collect(stream).catch(() => undefined)

    expect(await harness.nextClientFrame()).toMatchObject({ type: 'CHANNEL_REQUEST' })
  })

  it('requests channels without waiting for auth when no token is configured', async () => {
    // An unauthenticated connection never produces an AUTH_STATE, so gating on it would hang.
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const stream = serverStream<{ sym: string }, { p: number }>(
      client,
      descriptor('REQUEST_STREAM', 'feed'),
      { sym: 'AAPL' }
    )
    void collect(stream).catch(() => undefined)

    expect(await harness.nextClientFrame()).toMatchObject({ type: 'CHANNEL_REQUEST' })
  })
})

describe('DxLinkWebSocketClient channel ids', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  /**
   * Channel 0 is the connection and even ids are reserved for server-initiated channels, so a
   * client-initiated even id is a protocol violation. dxLink-java answers
   * `BAD_ACTION: "Protocol violation with an even channel usage."` on the *connection* channel, so the
   * failure does not name the channel it killed — stepping by one made every second call fail with an
   * error that looked unrelated.
   */
  it('allocates only odd channel ids', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      void collect(
        serverStream<{ sym: string }, { p: number }>(client, descriptor('REQUEST_STREAM', 'feed'), {
          sym: 'AAPL',
        })
      ).catch(() => undefined)
      ids.push((await harness.nextClientFrame()).channel)
    }

    expect(ids).toEqual([1, 3, 5])
    expect(ids.every((id) => id % 2 === 1)).toBe(true)
  })

  it('keeps ids odd when reusing the range after a call is cancelled', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const controller = new AbortController()
    void collect(
      serverStream<{ sym: string }, { p: number }>(
        client,
        descriptor('REQUEST_STREAM', 'feed'),
        { sym: 'AAPL' },
        { signal: controller.signal }
      )
    ).catch(() => undefined)
    const first = (await harness.nextClientFrame()).channel
    controller.abort()
    await harness.nextClientFrame() // CHANNEL_CANCEL

    void collect(
      serverStream<{ sym: string }, { p: number }>(client, descriptor('REQUEST_STREAM', 'feed'), {
        sym: 'MSFT',
      })
    ).catch(() => undefined)
    const second = (await harness.nextClientFrame()).channel

    expect(first % 2).toBe(1)
    expect(second % 2).toBe(1)
    expect(second).not.toBe(first)
  })
})

describe('DxLinkWebSocketClient RPC', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  it('runs a unary call end to end', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const response = unary<{ hello: string }, { echoed: string }>(
      client,
      descriptor('REQUEST_RESPONSE', 'echo'),
      { hello: 'world' }
    )

    const request = await harness.nextClientFrame()
    expect(request).toMatchObject({
      type: 'CHANNEL_REQUEST',
      service: 'test.Service',
      method: 'echo',
    })
    const channel = request.channel

    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.Service',
      method: 'echo',
    })

    const data = await harness.nextClientFrame()
    expect(data).toMatchObject({ type: 'CHANNEL_DATA', channel, payload: { hello: 'world' } })

    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { echoed: 'world' } })
    await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

    expect(await response).toEqual({ echoed: 'world' })
  })

  it('runs a server-streaming call end to end', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const stream = serverStream<{ sym: string }, { p: number }>(
      client,
      descriptor('REQUEST_STREAM', 'feed'),
      { sym: 'AAPL' }
    )

    const request = await harness.nextClientFrame()
    const channel = request.channel
    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.Service',
      method: 'feed',
    })
    await harness.nextClientFrame() // CHANNEL_DATA (request)

    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { p: 1 } })
    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { p: 2 } })
    await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

    expect(await collect(stream)).toEqual([{ p: 1 }, { p: 2 }])
  })

  it('sends CHANNEL_CANCEL when the call is aborted', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const controller = new AbortController()
    const stream = serverStream<Record<string, never>, { p: number }>(
      client,
      descriptor('REQUEST_STREAM', 'feed'),
      {},
      { signal: controller.signal }
    )

    const request = await harness.nextClientFrame()
    const channel = request.channel
    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.Service',
      method: 'feed',
    })
    await harness.nextClientFrame() // CHANNEL_DATA (request)
    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { p: 1 } })

    const reader = stream.getReader()
    expect((await reader.read()).value).toEqual({ p: 1 })

    controller.abort()

    const cancel = await harness.nextClientFrame()
    expect(cancel).toMatchObject({ type: 'CHANNEL_CANCEL', channel })
  })

  it('fails the call when the server sends an ERROR frame', async () => {
    const client = await connectClient(harness)
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const response = unary(client, descriptor('REQUEST_RESPONSE', 'boom'), {})
    const request = await harness.nextClientFrame()

    await harness.sendServerFrame({
      type: 'ERROR',
      channel: request.channel,
      error: 'BAD_ACTION',
      message: 'not allowed',
    })

    await expect(response).rejects.toMatchObject({ type: 'BAD_ACTION', message: 'not allowed' })
  })
})

describe('DxLinkWebSocketClient.createService', () => {
  let harness: Harness

  beforeEach(() => {
    harness = makeHarness()
  })

  type UnaryMethods = {
    echo: { input: DescMethod['input']; output: DescMethod['output']; methodKind: 'unary' }
  }
  const echoService = {
    typeName: 'test.EchoService',
    method: {
      echo: {
        name: 'Echo',
        methodKind: 'unary',
        input: { typeName: 'test.In' },
        output: { typeName: 'test.Out' },
      },
    },
  } as unknown as GenService<UnaryMethods>

  type BidiMethods = {
    chat: { input: DescMethod['input']; output: DescMethod['output']; methodKind: 'bidi_streaming' }
  }
  const bidiService = {
    typeName: 'test.ChatService',
    method: {
      chat: {
        name: 'Chat',
        methodKind: 'bidi_streaming',
        input: { typeName: 'test.In' },
        output: { typeName: 'test.Out' },
      },
    },
  } as unknown as GenService<BidiMethods>

  type ClientStreamMethods = {
    upload: {
      input: DescMethod['input']
      output: DescMethod['output']
      methodKind: 'client_streaming'
    }
  }
  const uploadService = {
    typeName: 'test.UploadService',
    method: {
      upload: {
        name: 'Upload',
        methodKind: 'client_streaming',
        input: { typeName: 'test.In' },
        output: { typeName: 'test.Out' },
      },
    },
  } as unknown as GenService<ClientStreamMethods>

  it('rejects client-streaming, which needs a request half-close the wire cannot express', () => {
    // "N requests then one response" requires telling the server the requests ended. Bidi does not
    // need that signal, which is why it is bound below rather than rejected here.
    const client = new DxLinkWebSocketClient({ url: 'ws://test', transport: harness.transport })
    expect(() => client.createService(uploadService)).toThrow(DxLinkRpcError)
  })

  it('binds a bidi service method end to end', async () => {
    const client = await connectClient(harness, { messageCodec: passthroughMessageCodec })
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const svc = client.createService(bidiService)
    const requests = new ReadableStream<{ say: string }>({
      start: (controller) => {
        controller.enqueue({ say: 'one' })
        controller.enqueue({ say: 'two' })
        // Left open: a subscription lives as long as the consumer wants it.
      },
    })
    const responses = svc.chat(requests)

    const request = await harness.nextClientFrame()
    expect(request).toMatchObject({
      type: 'CHANNEL_REQUEST',
      service: 'test.ChatService',
      method: 'Chat',
    })
    const channel = request.channel

    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.ChatService',
      method: 'Chat',
    })

    // Both queued requests reach the server, not just the first.
    expect(await harness.nextClientFrame()).toMatchObject({
      type: 'CHANNEL_DATA',
      channel,
      payload: { say: 'one' },
    })
    expect(await harness.nextClientFrame()).toMatchObject({
      type: 'CHANNEL_DATA',
      channel,
      payload: { say: 'two' },
    })

    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { heard: 'one' } })
    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { heard: 'two' } })
    await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

    expect(await collect(responses)).toEqual([{ heard: 'one' }, { heard: 'two' }])
  })

  it('does not send CHANNEL_CANCEL when the request stream simply ends', async () => {
    // The half-close gap only matters if closing the request side looked like a cancel. It does not:
    // it sets inputClosed and puts nothing on the wire, so the subscription keeps streaming.
    const client = await connectClient(harness, { messageCodec: passthroughMessageCodec })
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const svc = client.createService(bidiService)
    const responses = svc.chat(
      new ReadableStream<{ say: string }>({
        start: (controller) => {
          controller.enqueue({ say: 'only' })
          controller.close()
        },
      })
    )

    const request = await harness.nextClientFrame()
    const channel = request.channel
    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.ChatService',
      method: 'Chat',
    })
    expect(await harness.nextClientFrame()).toMatchObject({ type: 'CHANNEL_DATA', channel })

    // The server still answers after the request stream closed.
    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { heard: 'only' } })
    await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

    expect(await collect(responses)).toEqual([{ heard: 'only' }])
  })

  it('binds a unary service method end to end', async () => {
    const client = await connectClient(harness, { messageCodec: passthroughMessageCodec })
    await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)

    const svc = client.createService(echoService)
    const response = svc.echo({ hello: 'x' })

    const request = await harness.nextClientFrame()
    expect(request).toMatchObject({
      type: 'CHANNEL_REQUEST',
      service: 'test.EchoService',
      method: 'Echo',
    })
    const channel = request.channel

    await harness.sendServerFrame({
      type: 'CHANNEL_OPENED',
      channel,
      service: 'test.EchoService',
      method: 'Echo',
    })
    const data = await harness.nextClientFrame()
    expect(data).toMatchObject({ type: 'CHANNEL_DATA', channel, payload: { hello: 'x' } })

    await harness.sendServerFrame({ type: 'CHANNEL_DATA', channel, payload: { echoed: 'x' } })
    await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

    expect(await response).toEqual({ echoed: 'x' })
  })
})

describe('createJsonFrameCodec', () => {
  const codec = createJsonFrameCodec()

  it('round-trips a CHANNEL_REQUEST via parameters.methodName', () => {
    const encoded = codec.encode({
      type: 'CHANNEL_REQUEST',
      channel: 3,
      service: 'test.Service',
      method: 'subscribe',
    })
    expect(JSON.parse(encoded as string)).toMatchObject({
      type: 'CHANNEL_REQUEST',
      channel: 3,
      service: 'test.Service',
      parameters: { methodName: 'subscribe' },
    })
    expect(codec.decode(encoded)).toMatchObject({
      type: 'CHANNEL_REQUEST',
      channel: 3,
      service: 'test.Service',
      method: 'subscribe',
    })
  })

  it('round-trips CHANNEL_DATA payloads', () => {
    const encoded = codec.encode({ type: 'CHANNEL_DATA', channel: 5, payload: { a: 1, b: 'two' } })
    expect(codec.decode(encoded)).toMatchObject({
      type: 'CHANNEL_DATA',
      channel: 5,
      payload: { a: 1, b: 'two' },
    })
  })
})
