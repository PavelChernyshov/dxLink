import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  type DXLinkChannelMessageListener,
  DXLinkChannelState,
  type DXLinkChannelStateChangeListener,
  type DXLinkClient,
  type DXLinkErrorListener,
  type DXLinkScheduler,
} from '@dxfeed/dxlink-api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type DeepBookHeatmap, DeepBookViewModel } from './deepbook-view-model'

const PARAMS = {
  symbol: 'AAPL',
  source: 'NTV',
  granularity: '1s',
  candlePeriod: '1m',
  fromTime: 1_000,
}

interface MockChannel extends DXLinkChannel {
  simulateOpen(): void
  simulateMessage(message: DXLinkChannelMessage): void
}

const createMockChannel = (id: number, service: string): MockChannel => {
  let state = DXLinkChannelState.REQUESTED
  const messageListeners = new Set<DXLinkChannelMessageListener>()
  const stateListeners = new Set<DXLinkChannelStateChangeListener>()
  const errorListeners = new Set<DXLinkErrorListener>()

  return {
    id,
    service,
    parameters: {},
    send: () => {},
    addMessageListener: (l) => messageListeners.add(l),
    removeMessageListener: (l) => messageListeners.delete(l),
    getState: () => state,
    addStateChangeListener: (l) => stateListeners.add(l),
    removeStateChangeListener: (l) => stateListeners.delete(l),
    addErrorListener: (l) => errorListeners.add(l),
    removeErrorListener: (l) => errorListeners.delete(l),
    close: () => {
      state = DXLinkChannelState.CLOSED
    },
    simulateOpen: () => {
      const prev = state
      state = DXLinkChannelState.OPENED
      for (const listener of stateListeners) listener(state, prev)
    },
    simulateMessage: (message) => {
      for (const listener of messageListeners) listener(message)
    },
  }
}

/**
 * Client that hands out a mock channel per `openChannel`. The ViewModel opens two — the DeepBook RPC stream and the
 * reference candle FEED — so the DeepBook one is looked up by service name.
 */
const createMockClient = (): { client: DXLinkClient; deepBookChannel: () => MockChannel } => {
  const channels: MockChannel[] = []
  let nextId = 1
  const scheduler: DXLinkScheduler = {
    schedule: (_cb, _timeout, key) => key,
    cancel: () => {},
    clear: () => {},
    has: () => false,
  }
  const client = {
    openChannel: (service: string) => {
      const channel = createMockChannel(nextId++, service)
      channels.push(channel)
      return channel
    },
    getScheduler: () => scheduler,
    addConnectionStateChangeListener: () => {},
    removeConnectionStateChangeListener: () => {},
  } as unknown as DXLinkClient

  return {
    client,
    deepBookChannel: () => {
      const channel = channels.find((c) => c.service.includes('DeepBookService'))
      if (channel === undefined) throw new Error('DeepBook channel was not opened')
      return channel
    },
  }
}

describe('DeepBookViewModel reconstruction', () => {
  let vm: DeepBookViewModel
  let mock: ReturnType<typeof createMockClient>
  let frames: DeepBookHeatmap[]

  beforeEach(() => {
    vi.useFakeTimers()
    mock = createMockClient()
    vm = new DeepBookViewModel(mock.client, PARAMS)
    frames = []
    vm.start()
    vm.setHeatmapListener((heatmap) => frames.push(heatmap))
    mock.deepBookChannel().simulateOpen()
  })

  afterEach(() => {
    vm.stop()
    vi.useRealTimers()
  })

  /** Feeds one batch of levels as the server would frame it, then lets the coalesced repaint fire. */
  const send = (levels: Array<Record<string, unknown>>, pending: boolean): void => {
    mock.deepBookChannel().simulateMessage({ type: 'CHANNEL_DATA', payload: { levels, pending } })
    vi.advanceTimersByTime(200)
  }

  /** The snapshot-complete marker: protobuf JSON omits both defaults, so it arrives as an empty object. */
  const sendMarker = (): void => {
    mock.deepBookChannel().simulateMessage({ type: 'CHANNEL_DATA', payload: {} })
    vi.advanceTimersByTime(200)
  }

  const lastFrame = (): DeepBookHeatmap => {
    const frame = frames[frames.length - 1]
    if (frame === undefined) throw new Error('no heatmap frame was painted')
    return frame
  }

  it('does not write the store once per batch while backfilling', () => {
    // The store is bound to React, so a write per batch means a re-render per batch. On a ~1.4M-level backfill that made
    // rendering the delivery bottleneck (and, by not draining the socket, throttled the server too). The counter must
    // therefore be published on a throttle, not per batch.
    let storeWrites = 0
    const unsubscribe = vm.store.subscribe(() => {
      storeWrites++
    })

    const channel = mock.deepBookChannel()
    for (let i = 0; i < 50; i++) {
      channel.simulateMessage({
        type: 'CHANNEL_DATA',
        payload: {
          levels: [{ time: 1_000 + i, price: 100 + i, size: 5, side: 'SIDE_BUY' }],
          pending: true,
        },
      })
    }

    // Only the CONNECTING -> HISTORY transition may have touched the store; the 50 batches must not have.
    expect(storeWrites).toBeLessThanOrEqual(1)
    expect(vm.store.getState().totalOrders).toBe(0)

    // The throttled tick then publishes the whole accumulated count in a single write (300ms > BACKFILL_PROGRESS_MS).
    vi.advanceTimersByTime(300)
    expect(vm.store.getState().totalOrders).toBe(50)
    expect(storeWrites).toBeLessThanOrEqual(2)

    unsubscribe()
  })

  it('treats an order with no size field as a removal', () => {
    // The compact wire message omits default-valued fields, so `size === 0` — the delta-encoded tombstone — reaches the
    // client as an order with NO size key at all. Previously the server sent an explicit "size":0.
    send([{ time: 1_000, price: 100, size: 5, side: 'SIDE_BUY' }], true)
    sendMarker()
    expect(lastFrame().segments).toHaveLength(1)

    send([{ time: 2_000, price: 100, side: 'SIDE_BUY' }], false)

    // The level is gone: only the closed band for the span it was actually resting remains, and nothing is extended to
    // the right edge. A size key treated as "missing data" rather than 0 would leave the level resting forever.
    expect(lastFrame().segments).toEqual([
      { price: 100, side: 'SIDE_BUY', size: 5, tStart: 1_000, tEnd: 2_000 },
    ])
  })

  it('closes the vacated side when a price flips side', () => {
    // Regression test: keying the book by (price, side) split one physical price row into two entries, so the old side
    // was never closed and lingered as a phantom band extended to the right edge on the same row.
    send([{ time: 1_000, price: 100, size: 5, side: 'SIDE_BUY' }], true)
    sendMarker()

    // The resting bid at 100 becomes an ask at 100.
    send([{ time: 2_000, price: 100, size: 7, side: 'SIDE_SELL' }], false)
    // Advance the stream past the flip on an unrelated price. This is what makes the bug observable: a still-resting
    // level is extended to the latest event time, so while the flip is the newest event both the correctly-closed bid
    // band and the buggy phantom one end at the same instant and the frames are identical.
    send([{ time: 3_000, price: 101, size: 1, side: 'SIDE_SELL' }], false)

    expect(lastFrame().segments).toEqual([
      // The bid is CLOSED at the flip instant — it must not follow the right edge to 3000.
      { price: 100, side: 'SIDE_BUY', size: 5, tStart: 1_000, tEnd: 2_000 },
      // Exactly one level rests at price 100 afterwards: the new ask, extended to now.
      { price: 100, side: 'SIDE_SELL', size: 7, tStart: 2_000, tEnd: 3_000 },
      { price: 101, side: 'SIDE_SELL', size: 1, tStart: 3_000, tEnd: 3_000 },
    ])
  })
})
