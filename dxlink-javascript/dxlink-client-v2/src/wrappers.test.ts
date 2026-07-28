import { describe, expect, it } from 'vitest'

import type { DxLinkCall, DxLinkCallOptions } from './call'
import type { DxLinkClient } from './client'
import { DxLinkRpcError } from './error'
import type { DxLinkInteractionModel, DxLinkMethodDescriptor } from './method'
import { bidiStream, clientStream, serverStream, unary, unaryCall } from './wrappers'

/**
 * Context handed to a mock call handler. Mirrors a server: read `requests`, push responses to
 * `controller`, and observe `canceled` when the client cancels the call.
 */
interface MockCallContext {
  readonly requests: ReadableStream<unknown>
  readonly controller: ReadableStreamDefaultController<unknown>
  readonly canceled: AbortSignal
}

type MockCallHandler = (ctx: MockCallContext) => void | Promise<void>

/** The wrappers only need `createCall`; the mock exposes that plus a call counter. */
interface MockClient {
  createCall: DxLinkClient['createCall']
  createCallCount(): number
}

/**
 * A call factory whose `createCall` runs `handler` as the server side of the call. The handler
 * reads from a `requests` readable and enqueues onto the `responses` controller; when it returns,
 * the response stream is closed.
 */
const mockClient = (handler: MockCallHandler): MockClient => {
  let createCalls = 0
  return {
    createCallCount: () => createCalls,
    createCall<I, O>(
      _method: DxLinkMethodDescriptor<I, O>,
      _options?: DxLinkCallOptions
    ): DxLinkCall<I, O> {
      createCalls++
      const inbound = new TransformStream<I, I>()
      const canceled = new AbortController()
      const responses = new ReadableStream<O>({
        async start(controller) {
          try {
            await handler({
              requests: inbound.readable as ReadableStream<unknown>,
              controller: controller as ReadableStreamDefaultController<unknown>,
              canceled: canceled.signal,
            })
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
        cancel(reason) {
          canceled.abort(reason)
        },
      })
      return { requests: inbound.writable, responses }
    },
  }
}

const descriptor = <I, O>(
  model: DxLinkInteractionModel,
  name = 'test'
): DxLinkMethodDescriptor<I, O> => ({
  service: 'test.Service',
  name,
  model,
  input: { typeName: 'test.In' },
  output: { typeName: 'test.Out' },
})

/** Drain a readable stream into an array. */
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

/** A promise that resolves once `signal` aborts (used to model an open-ended server). */
const untilAborted = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))

describe('unary', () => {
  it('sends one request and resolves with one response', async () => {
    const client = mockClient(async ({ requests, controller }) => {
      const [req = ''] = await collect<string>(requests as ReadableStream<string>)
      controller.enqueue(req.toUpperCase())
    })

    const result = await unary<string, string>(client, descriptor('REQUEST_RESPONSE'), 'hi')

    expect(result).toBe('HI')
  })

  it('rejects when the server closes without a response', async () => {
    const client = mockClient(async ({ requests }) => {
      await collect(requests)
    })

    await expect(
      unary<string, string>(client, descriptor('REQUEST_RESPONSE'), 'x')
    ).rejects.toBeInstanceOf(DxLinkRpcError)
  })

  it('rejects immediately without opening a call when the signal is already aborted', async () => {
    const client = mockClient(async () => {})
    const signal = AbortSignal.abort()

    await expect(
      unary<string, string>(client, descriptor('REQUEST_RESPONSE'), 'x', { signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(client.createCallCount()).toBe(0)
  })

  it('rejects with AbortError when aborted in flight', async () => {
    const client = mockClient(async ({ canceled }) => {
      await untilAborted(canceled)
    })
    const controller = new AbortController()

    const pending = unary<string, string>(client, descriptor('REQUEST_RESPONSE'), 'x', {
      signal: controller.signal,
    })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('serverStream', () => {
  it('sends one request and yields a stream of responses', async () => {
    const client = mockClient(async ({ requests, controller }) => {
      const [count = 0] = await collect<number>(requests as ReadableStream<number>)
      for (let i = 0; i < count; i++) controller.enqueue(i)
    })

    const stream = serverStream<number, number>(client, descriptor('REQUEST_STREAM'), 3)

    expect(await collect(stream)).toEqual([0, 1, 2])
  })

  it('errors the stream and cancels the source when aborted mid-stream', async () => {
    let sawCancel = false
    const client = mockClient(async ({ requests, controller, canceled }) => {
      await collect(requests)
      controller.enqueue('a')
      canceled.addEventListener('abort', () => (sawCancel = true), { once: true })
      await untilAborted(canceled)
    })
    const controller = new AbortController()

    const stream = serverStream<number, string>(client, descriptor('REQUEST_STREAM'), 0, {
      signal: controller.signal,
    })
    const reader = stream.getReader()

    expect(await reader.read()).toEqual({ value: 'a', done: false })
    controller.abort()

    await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' })
    expect(sawCancel).toBe(true)
  })
})

describe('clientStream', () => {
  it('sends a stream of requests and resolves with one response', async () => {
    const client = mockClient(async ({ requests, controller }) => {
      const all = await collect<number>(requests as ReadableStream<number>)
      controller.enqueue(all.reduce((sum, value) => sum + value, 0))
    })

    async function* values() {
      yield 1
      yield 2
      yield 3
    }

    const result = await clientStream<number, number>(
      client,
      descriptor('STREAM_RESPONSE'),
      values()
    )

    expect(result).toBe(6)
  })
})

describe('bidiStream', () => {
  it('streams requests and responses concurrently', async () => {
    const client = mockClient(async ({ requests, controller }) => {
      const reader = (requests as ReadableStream<string>).getReader()
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        controller.enqueue(`echo:${value}`)
      }
    })

    const input = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a')
        controller.enqueue('b')
        controller.close()
      },
    })

    const stream = bidiStream<string, string>(client, descriptor('STREAM_STREAM'), input)

    expect(await collect(stream)).toEqual(['echo:a', 'echo:b'])
  })
})

describe('unaryCall', () => {
  it('exposes an explicit cancel that rejects the response', async () => {
    const client = mockClient(async ({ canceled }) => {
      await untilAborted(canceled)
    })

    const call = unaryCall<string, string>(client, descriptor('REQUEST_RESPONSE'), 'x')
    call.cancel()

    await expect(call.response).rejects.toMatchObject({ name: 'AbortError' })
  })
})
