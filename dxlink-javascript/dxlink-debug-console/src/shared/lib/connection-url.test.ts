import { describe, expect, it } from 'vitest'

import { DEV_WS_URL, deriveWsUrlFromLocation, getDefaultWsUrl } from './connection-url'

describe('deriveWsUrlFromLocation', () => {
  it('uses wss:// for https pages', () => {
    expect(
      deriveWsUrlFromLocation({ protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/' })
    ).toBe('wss://demo.dxfeed.com/')
  })

  it('uses ws:// for http pages', () => {
    expect(
      deriveWsUrlFromLocation({ protocol: 'http:', host: 'localhost:9959', pathname: '/' })
    ).toBe('ws://localhost:9959/')
  })

  it('strips a trailing /debug segment', () => {
    expect(
      deriveWsUrlFromLocation({ protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/debug' })
    ).toBe('wss://demo.dxfeed.com')
  })

  it('strips /debug and keeps the preceding path', () => {
    expect(
      deriveWsUrlFromLocation({
        protocol: 'https:',
        host: 'demo.dxfeed.com',
        pathname: '/relay/debug',
      })
    ).toBe('wss://demo.dxfeed.com/relay')
  })

  it('leaves the path untouched when there is no /debug segment', () => {
    expect(deriveWsUrlFromLocation({ protocol: 'wss:', host: 'host:443', pathname: '/path' })).toBe(
      'ws://host:443/path'
    )
  })
})

describe('getDefaultWsUrl', () => {
  it('derives from the page location in production', () => {
    expect(
      getDefaultWsUrl({ protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/debug' }, true)
    ).toBe('wss://demo.dxfeed.com')
  })

  it('returns the local dev server verbatim in development (ignores the page location)', () => {
    const location = { protocol: 'https:', host: 'demo.dxfeed.com', pathname: '/debug' }
    expect(getDefaultWsUrl(location, false)).toBe(DEV_WS_URL)
    // Pinned literally: the dxLink WebSocket server rides on Spring Boot's Netty port (server.port: 8080), so this
    // must track that, not the historical 9959.
    expect(getDefaultWsUrl(location, false)).toBe('ws://localhost:8080')
  })
})
