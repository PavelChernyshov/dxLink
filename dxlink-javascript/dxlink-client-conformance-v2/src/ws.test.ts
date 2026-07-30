import type { DescMessage } from '@bufbuild/protobuf'
import {
  DxLinkConnectionState,
  type DxLinkMessageCodec,
  type DxLinkMessageType,
  DxLinkRpcError,
  jsonMessageCodec,
  protobufMessageCodec,
} from '@dxfeed/dxlink-client-v2'
import {
  createJsonFrameCodec,
  createProtobufFrameCodec,
  DxLinkWebSocketClient,
  type DxLinkFrame,
  type DxLinkFrameCodec,
  type DxLinkWsData,
} from '@dxfeed/dxlink-client-ws-v2'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  EchoRequestSchema,
  type EchoResponse,
  EchoResponseSchema,
  EchoService,
} from './gen/dxlink/test/echo_service_pb'
import { TestService } from './gen/dxlink/test/test_service_pb'

type Format = 'json' | 'protobuf'

const msgType = (schema: DescMessage): DxLinkMessageType<unknown> => ({
  typeName: schema.typeName,
  schema,
})

/** In-memory transport for a given wire format; the test acts as the dxLink server. */
const makeHarness = (format: Format) => {
  const frameCodec: DxLinkFrameCodec =
    format === 'protobuf' ? createProtobufFrameCodec() : createJsonFrameCodec()
  const messageCodec: DxLinkMessageCodec =
    format === 'protobuf' ? protobufMessageCodec : jsonMessageCodec

  const clientToServer = new TransformStream<DxLinkWsData, DxLinkWsData>()
  const serverToClient = new TransformStream<DxLinkWsData, DxLinkWsData>()
  const clientReader = clientToServer.readable.getReader()
  const serverWriter = serverToClient.writable.getWriter()

  let lastClientRaw: DxLinkWsData | undefined

  return {
    frameCodec,
    transport: () =>
      Promise.resolve({ readable: serverToClient.readable, writable: clientToServer.writable }),
    get lastClientRaw() {
      return lastClientRaw
    },
    async nextClientFrame(): Promise<DxLinkFrame> {
      const { value, done } = await clientReader.read()
      if (done || value === undefined) throw new Error('client stream ended')
      lastClientRaw = value
      return frameCodec.decode(value)
    },
    sendServerFrame: (frame: DxLinkFrame) => serverWriter.write(frameCodec.encode(frame)),
    encodePayload: (schema: DescMessage, value: unknown) =>
      messageCodec.encode(msgType(schema), value),
    decodePayload: (schema: DescMessage, raw: unknown) => messageCodec.decode(msgType(schema), raw),
  }
}

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

const connect = async (harness: ReturnType<typeof makeHarness>, format: Format) => {
  const client = new DxLinkWebSocketClient({
    url: 'ws://test',
    transport: harness.transport,
    format,
    keepaliveInterval: 0,
    setupTimeout: 0,
    maxReconnectAttempts: 0,
  })
  client.connect()
  const setup = await harness.nextClientFrame()
  expect(setup.type).toBe('SETUP')
  await harness.sendServerFrame({ type: 'SETUP', channel: 0, version: '1.0' })
  await waitFor(() => client.getState() === DxLinkConnectionState.CONNECTED)
  return client
}

describe.each<Format>(['json', 'protobuf'])(
  'DxLinkWebSocketClient.createService over %s',
  (format) => {
    let harness: ReturnType<typeof makeHarness>

    beforeEach(() => {
      harness = makeHarness(format)
    })

    it('binds a unary RPC of a generated service', async () => {
      const client = await connect(harness, format)
      const echo = client.createService(EchoService)

      const response = echo.echo({ message: 'ping', count: 2 })

      const request = await harness.nextClientFrame()
      expect(request).toMatchObject({
        type: 'CHANNEL_REQUEST',
        service: 'dxlink.test.EchoService',
        method: 'Echo',
      })
      const channel = request.channel

      await harness.sendServerFrame({
        type: 'CHANNEL_OPENED',
        channel,
        service: 'dxlink.test.EchoService',
        method: 'Echo',
      })

      const data = await harness.nextClientFrame()
      expect(data.type).toBe('CHANNEL_DATA')
      // The request payload is really encoded in the negotiated wire format.
      expect(typeof harness.lastClientRaw).toBe(format === 'json' ? 'string' : 'object')
      if (format === 'protobuf') expect(harness.lastClientRaw).toBeInstanceOf(Uint8Array)
      if (data.type === 'CHANNEL_DATA') {
        expect(harness.decodePayload(EchoRequestSchema, data.payload)).toMatchObject({
          message: 'ping',
          count: 2,
        })
      }

      await harness.sendServerFrame({
        type: 'CHANNEL_DATA',
        channel,
        payload: harness.encodePayload(EchoResponseSchema, { message: 'PING', sequence: 7n }),
      })
      await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

      const result = (await response) as EchoResponse
      expect(result).toMatchObject({ message: 'PING', sequence: 7n })
    })

    it('binds a server-streaming RPC of a generated service', async () => {
      const client = await connect(harness, format)
      const echo = client.createService(EchoService)

      const stream = echo.subscribe({ message: 'feed', count: 0 })

      const request = await harness.nextClientFrame()
      expect(request).toMatchObject({
        type: 'CHANNEL_REQUEST',
        service: 'dxlink.test.EchoService',
        method: 'Subscribe',
      })
      const channel = request.channel

      await harness.sendServerFrame({
        type: 'CHANNEL_OPENED',
        channel,
        service: 'dxlink.test.EchoService',
        method: 'Subscribe',
      })
      await harness.nextClientFrame() // CHANNEL_DATA (request)

      await harness.sendServerFrame({
        type: 'CHANNEL_DATA',
        channel,
        payload: harness.encodePayload(EchoResponseSchema, { message: 'a', sequence: 1n }),
      })
      await harness.sendServerFrame({
        type: 'CHANNEL_DATA',
        channel,
        payload: harness.encodePayload(EchoResponseSchema, { message: 'b', sequence: 2n }),
      })
      await harness.sendServerFrame({ type: 'CHANNEL_CLOSED', channel })

      const results = (await collect(stream)) as EchoResponse[]
      expect(results.map((r) => `${r.message}:${r.sequence}`)).toEqual(['a:1', 'b:2'])
    })
  }
)

describe('DxLinkWebSocketClient.createService interaction-model validation', () => {
  it('rejects a generated service that requires client-streaming', () => {
    const harness = makeHarness('protobuf')
    const client = new DxLinkWebSocketClient({ url: 'ws://test', transport: harness.transport })
    // TestService has a client-streaming RPC, whose "N requests then one response" contract needs the
    // request half-close the dxLink v1.0 wire cannot express (see PLAN-v2.md). Its bidi RPC is fine —
    // a duplex subscription never waits for input completion — so bidi alone no longer throws.
    expect(() => client.createService(TestService)).toThrow(DxLinkRpcError)
  })
})
