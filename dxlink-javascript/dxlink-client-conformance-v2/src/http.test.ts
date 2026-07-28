import { DxLinkHttpClient, type DxLinkFetch } from '@dxfeed/dxlink-client-http-v2'
import { DxLinkRpcError } from '@dxfeed/dxlink-client-v2'
import { describe, expect, it } from 'vitest'

import { QuoteService } from './gen/dxlink/test/quote_service_pb'
import { TestService } from './gen/dxlink/test/test_service_pb'

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

describe('DxLinkHttpClient.createService (generated service, HTTP/JSON)', () => {
  it('round-trips a unary RPC as canonical protobuf-JSON over the transcoding binding', async () => {
    const { fn, calls } = mockFetch(JSON.stringify({ symbol: 'IBM', bid: 100.5, ask: 100.6 }))
    const client = new DxLinkHttpClient({
      baseUrl: 'https://host/api',
      fetch: fn,
      authToken: 'tok',
    })
    client.connect()

    const quotes = client.createService(QuoteService)
    const res = await quotes.getQuote({ symbol: 'IBM' })

    // Response decoded from proto3-JSON into a real generated message.
    expect(res).toMatchObject({ symbol: 'IBM', bid: 100.5, ask: 100.6 })

    const call = calls[0]
    if (call === undefined) throw new Error('fetch was not called')
    expect(call.url).toBe('https://host/api/dxlink.test.quoteservice/getquote')
    expect(call.init?.method).toBe('POST')
    // Request body is canonical protobuf-JSON of the generated request message.
    expect(call.init?.body).toBe('{"symbol":"IBM"}')
    const headers = call.init?.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers.authorization).toBe('Bearer tok')
  })

  it('rejects a generated service that requires streaming models', () => {
    const client = new DxLinkHttpClient({ baseUrl: 'https://host' })
    // TestService has server-, client-, and bidi-streaming RPCs; HTTP/JSON supports unary only.
    expect(() => client.createService(TestService)).toThrow(DxLinkRpcError)
  })
})
