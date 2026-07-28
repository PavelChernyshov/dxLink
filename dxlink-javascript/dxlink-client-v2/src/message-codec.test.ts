import { create } from '@bufbuild/protobuf'
import { TimestampSchema } from '@bufbuild/protobuf/wkt'
import { describe, expect, it } from 'vitest'

import { jsonMessageCodec, passthroughMessageCodec } from './message-codec'
import type { DxLinkMessageType } from './method'

describe('jsonMessageCodec', () => {
  it('round-trips a message via canonical protobuf-JSON using its schema', () => {
    const type: DxLinkMessageType<unknown> = {
      typeName: TimestampSchema.typeName,
      schema: TimestampSchema,
    }
    const value = create(TimestampSchema, { seconds: 1000n, nanos: 0 })

    const wire = jsonMessageCodec.encode(type, value)
    // Canonical protobuf-JSON for google.protobuf.Timestamp is an RFC3339 string.
    expect(typeof wire).toBe('string')

    const roundTripped = jsonMessageCodec.encode(type, jsonMessageCodec.decode(type, wire))
    expect(roundTripped).toEqual(wire)
  })

  it('accepts message init shapes on encode (via create)', () => {
    const type: DxLinkMessageType<unknown> = {
      typeName: TimestampSchema.typeName,
      schema: TimestampSchema,
    }
    // Pass a plain init object rather than a created message.
    expect(jsonMessageCodec.encode(type, { seconds: 5n })).toBe('1970-01-01T00:00:05Z')
  })

  it('passes through when no schema is present', () => {
    const type: DxLinkMessageType<{ a: number }> = { typeName: 'plain.Message' }
    expect(jsonMessageCodec.encode(type, { a: 1 })).toEqual({ a: 1 })
    expect(jsonMessageCodec.decode(type, { a: 2 })).toEqual({ a: 2 })
  })
})

describe('passthroughMessageCodec', () => {
  it('returns values unchanged in both directions', () => {
    const type: DxLinkMessageType<{ v: string }> = { typeName: 'plain.Message' }
    expect(passthroughMessageCodec.encode(type, { v: 'x' })).toEqual({ v: 'x' })
    expect(passthroughMessageCodec.decode(type, { v: 'y' })).toEqual({ v: 'y' })
  })
})
