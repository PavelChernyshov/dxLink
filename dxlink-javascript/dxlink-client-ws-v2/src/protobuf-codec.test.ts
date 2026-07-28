import { create } from '@bufbuild/protobuf'
import { anyPack, StringValueSchema } from '@bufbuild/protobuf/wkt'
import { describe, expect, it } from 'vitest'

import { createProtobufFrameCodec } from './protobuf-codec'
import { type DxLinkFrame } from './protocol'

const codec = createProtobufFrameCodec()

const roundTrip = (frame: DxLinkFrame): DxLinkFrame => {
  const bytes = codec.encode(frame)
  expect(bytes).toBeInstanceOf(Uint8Array)
  return codec.decode(bytes)
}

describe('createProtobufFrameCodec', () => {
  it('advertises the protobuf subprotocol', () => {
    expect(codec.subprotocol).toBe('dxlink-ws-protobuf')
  })

  it('round-trips SETUP with header time and keepalive params', () => {
    expect(
      roundTrip({
        type: 'SETUP',
        channel: 0,
        time: 1_700_000_000_000,
        version: '1.0',
        keepaliveTimeout: 60,
        acceptKeepaliveTimeout: 10,
      })
    ).toEqual({
      type: 'SETUP',
      channel: 0,
      time: 1_700_000_000_000,
      version: '1.0',
      keepaliveTimeout: 60,
      acceptKeepaliveTimeout: 10,
    })
  })

  it('round-trips AUTH', () => {
    expect(roundTrip({ type: 'AUTH', channel: 0, token: 'secret' })).toMatchObject({
      type: 'AUTH',
      channel: 0,
      token: 'secret',
    })
  })

  it('round-trips AUTH_STATE for both states', () => {
    expect(roundTrip({ type: 'AUTH_STATE', channel: 0, state: 'AUTHORIZED' })).toMatchObject({
      type: 'AUTH_STATE',
      state: 'AUTHORIZED',
    })
    expect(roundTrip({ type: 'AUTH_STATE', channel: 0, state: 'UNAUTHORIZED' })).toMatchObject({
      type: 'AUTH_STATE',
      state: 'UNAUTHORIZED',
    })
  })

  it('round-trips KEEPALIVE', () => {
    expect(roundTrip({ type: 'KEEPALIVE', channel: 0 })).toMatchObject({ type: 'KEEPALIVE' })
  })

  it('round-trips ERROR preserving the error code', () => {
    for (const error of [
      'BAD_ACTION',
      'UNAUTHORIZED',
      'TIMEOUT',
      'UNSUPPORTED_PROTOCOL',
    ] as const) {
      expect(roundTrip({ type: 'ERROR', channel: 3, error, message: 'boom' })).toMatchObject({
        type: 'ERROR',
        channel: 3,
        error,
        message: 'boom',
      })
    }
  })

  it('round-trips CHANNEL_REQUEST / CHANNEL_OPENED with service + method', () => {
    expect(
      roundTrip({
        type: 'CHANNEL_REQUEST',
        channel: 5,
        service: 'dxlink.test.EchoService',
        method: 'Echo',
      })
    ).toMatchObject({
      type: 'CHANNEL_REQUEST',
      channel: 5,
      service: 'dxlink.test.EchoService',
      method: 'Echo',
    })
    expect(
      roundTrip({
        type: 'CHANNEL_OPENED',
        channel: 5,
        service: 'dxlink.test.EchoService',
        method: 'Echo',
      })
    ).toMatchObject({
      type: 'CHANNEL_OPENED',
      channel: 5,
      service: 'dxlink.test.EchoService',
      method: 'Echo',
    })
  })

  it('round-trips CHANNEL_CANCEL / CHANNEL_CLOSED', () => {
    expect(roundTrip({ type: 'CHANNEL_CANCEL', channel: 9 })).toMatchObject({
      type: 'CHANNEL_CANCEL',
      channel: 9,
    })
    expect(roundTrip({ type: 'CHANNEL_CLOSED', channel: 9 })).toMatchObject({
      type: 'CHANNEL_CLOSED',
      channel: 9,
    })
  })

  it('round-trips CHANNEL_DATA carrying a google.protobuf.Any payload', () => {
    const any = anyPack(StringValueSchema, create(StringValueSchema, { value: 'hi' }))
    const decoded = roundTrip({ type: 'CHANNEL_DATA', channel: 5, payload: any })
    expect(decoded.type).toBe('CHANNEL_DATA')
    if (decoded.type === 'CHANNEL_DATA') {
      const payload = decoded.payload as typeof any
      expect(payload.typeUrl).toBe('type.googleapis.com/google.protobuf.StringValue')
      expect(payload.value).toEqual(any.value)
    }
  })

  it('rejects a text payload', () => {
    expect(() => codec.decode('not binary')).toThrow(/expected binary/)
  })
})
