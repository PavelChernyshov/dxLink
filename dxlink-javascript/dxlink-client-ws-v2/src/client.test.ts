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

  it('rejects a service using an unsupported interaction model', () => {
    const client = new DxLinkWebSocketClient({ url: 'ws://test', transport: harness.transport })
    expect(() => client.createService(bidiService)).toThrow(DxLinkRpcError)
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
