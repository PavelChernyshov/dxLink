import {
  type DescMethod,
  type DxLinkError,
  type DxLinkMethodDescriptor,
  DxLinkAuthState,
  DxLinkConnectionState,
  DxLinkRpcError,
  type GenService,
  unary,
} from '@dxfeed/dxlink-client-v2'
import { describe, expect, it } from 'vitest'

import { DxLinkHttpClient, type DxLinkFetch } from './client'

// These are transport-mechanics unit tests that use hand-built descriptors / inline service
// descriptors — no protoc-gen-es output. The generated-service integration (real proto3-JSON
// round-trips via createService) is validated in @dxfeed/dxlink-client-conformance-v2.

interface Captured {
  url: string
  init?: RequestInit
}

const mockFetch = (body: string, status = 200) => {
  const calls: Captured[] = []
  const fn: DxLinkFetch = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(new Response(body, { status }))
  }
  return { fn, calls }
}

const firstCall = (calls: Captured[]): Captured => {
  const call = calls[0]
  if (call === undefined) throw new Error('fetch was not called')
  return call
}

const quoteMethod: DxLinkMethodDescriptor<{ symbol: string }, { symbol: string; bid: number }> = {
  service: 'dxlink.test.QuoteService',
  name: 'GetQuote',
  model: 'REQUEST_RESPONSE',
  input: { typeName: 'dxlink.test.QuoteRequest' },
  output: { typeName: 'dxlink.test.QuoteResponse' },
}

describe('DxLinkHttpClient lifecycle', () => {
  it('connects immediately (connectionless) and reflects auth from the token', () => {
    const states: DxLinkConnectionState[] = []
    const client = new DxLinkHttpClient({ baseUrl: 'https://host', authToken: 'tok' })
    client.onStateChange((state) => states.push(state))

    expect(client.getState()).toBe(DxLinkConnectionState.NOT_CONNECTED)
    client.connect()
    expect(client.getState()).toBe(DxLinkConnectionState.CONNECTED)
    expect(client.getAuthState()).toBe(DxLinkAuthState.AUTHORIZED)

    client.disconnect()
    expect(client.getState()).toBe(DxLinkConnectionState.NOT_CONNECTED)
    expect(client.getAuthState()).toBe(DxLinkAuthState.UNAUTHORIZED)
    expect(states).toEqual([DxLinkConnectionState.CONNECTED, DxLinkConnectionState.NOT_CONNECTED])
  })
})

describe('DxLinkHttpClient unary transport mechanics', () => {
  it('POSTs to the lower-cased RPC path with the JSON body and decodes the response', async () => {
    const { fn, calls } = mockFetch(JSON.stringify({ symbol: 'IBM', bid: 100.5 }))
    const client = new DxLinkHttpClient({
      baseUrl: 'https://host/api',
      fetch: fn,
      authToken: 'tok',
    })
    client.connect()

    const res = await unary(client, quoteMethod, { symbol: 'IBM' })
    expect(res).toEqual({ symbol: 'IBM', bid: 100.5 })

    const call = firstCall(calls)
    expect(call.url).toBe('https://host/api/dxlink.test.quoteservice/getquote')
    expect(call.init?.method).toBe('POST')
    expect(call.init?.body).toBe('{"symbol":"IBM"}')
    const headers = call.init?.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers.accept).toBe('application/json')
    expect(headers.authorization).toBe('Bearer tok')
  })

  it('resolves the auth token from a factory and does not double-prefix Bearer', async () => {
    const { fn, calls } = mockFetch('{}')
    const client = new DxLinkHttpClient({
      baseUrl: 'https://host',
      fetch: fn,
      authToken: () => Promise.resolve('Bearer already'),
    })
    client.connect()

    await unary(client, quoteMethod, { symbol: 'X' })
    const headers = firstCall(calls).init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer already')
  })

  it('maps a non-2xx response to a typed error and flips auth state on 403', async () => {
    const { fn } = mockFetch('forbidden', 403)
    const errors: DxLinkError[] = []
    const client = new DxLinkHttpClient({ baseUrl: 'https://host', fetch: fn, authToken: 'tok' })
    client.connect()
    client.onError((error) => errors.push(error))

    await expect(unary(client, quoteMethod, { symbol: 'X' })).rejects.toMatchObject({
      type: 'UNAUTHORIZED',
      message: 'forbidden',
    })
    expect(errors).toEqual([{ type: 'UNAUTHORIZED', message: 'forbidden' }])
    expect(client.getAuthState()).toBe(DxLinkAuthState.UNAUTHORIZED)
  })

  it('fails the call when not connected', async () => {
    const { fn, calls } = mockFetch('{}')
    const client = new DxLinkHttpClient({ baseUrl: 'https://host', fetch: fn })
    await expect(unary(client, quoteMethod, { symbol: 'X' })).rejects.toThrow(/not connected/)
    expect(calls).toHaveLength(0)
  })
})

describe('DxLinkHttpClient.createService validation', () => {
  type StreamingMethods = {
    watch: {
      input: DescMethod['input']
      output: DescMethod['output']
      methodKind: 'server_streaming'
    }
  }
  const streamingService = {
    typeName: 'dxlink.test.Streamer',
    method: {
      watch: {
        name: 'Watch',
        methodKind: 'server_streaming',
        input: { typeName: 'dxlink.test.In' },
        output: { typeName: 'dxlink.test.Out' },
      },
    },
  } as unknown as GenService<StreamingMethods>

  it('rejects a service that requires a streaming model (HTTP supports unary only)', () => {
    const client = new DxLinkHttpClient({ baseUrl: 'https://host' })
    expect(() => client.createService(streamingService)).toThrow(DxLinkRpcError)
  })
})
