import {
  type DXLinkChannel,
  type DXLinkChannelMessage,
  type DXLinkChannelMessageListener,
  DXLinkChannelState,
  type DXLinkChannelStateChangeListener,
  type DXLinkClient,
  type DXLinkError,
  type DXLinkErrorListener,
} from '@dxfeed/dxlink-core'
import { expect, test } from 'vitest'

import { DXLinkDeepBook, DXLinkDeepBookState, type DeepBookLevel } from './'

interface MockChannel extends DXLinkChannel {
  simulateOpen(): void
  simulateMessage(message: DXLinkChannelMessage): void
  simulateClose(): void
  simulateError(error: DXLinkError): void
  readonly sentMessages: DXLinkChannelMessage[]
}

function createMockChannel(
  id: number,
  service: string,
  parameters: Record<string, unknown>
): MockChannel {
  let state = DXLinkChannelState.REQUESTED
  const messageListeners = new Set<DXLinkChannelMessageListener>()
  const stateListeners = new Set<DXLinkChannelStateChangeListener>()
  const errorListeners = new Set<DXLinkErrorListener>()
  const sentMessages: DXLinkChannelMessage[] = []

  const setState = (newState: DXLinkChannelState) => {
    const prev = state
    state = newState
    for (const listener of stateListeners) listener(newState, prev)
  }

  return {
    id,
    service,
    parameters,
    get sentMessages() {
      return sentMessages
    },
    send(message: DXLinkChannelMessage) {
      sentMessages.push(message)
    },
    addMessageListener: (l) => messageListeners.add(l),
    removeMessageListener: (l) => messageListeners.delete(l),
    getState: () => state,
    addStateChangeListener: (l) => stateListeners.add(l),
    removeStateChangeListener: (l) => stateListeners.delete(l),
    addErrorListener: (l) => errorListeners.add(l),
    removeErrorListener: (l) => errorListeners.delete(l),
    close() {
      setState(DXLinkChannelState.CLOSED)
    },
    simulateOpen() {
      setState(DXLinkChannelState.OPENED)
    },
    simulateMessage(message: DXLinkChannelMessage) {
      for (const listener of messageListeners) listener(message)
    },
    simulateClose() {
      setState(DXLinkChannelState.CLOSED)
    },
    simulateError(error: DXLinkError) {
      for (const listener of errorListeners) listener(error)
    },
  }
}

function createMockClient(): { client: DXLinkClient; lastChannel: () => MockChannel | undefined } {
  let last: MockChannel | undefined
  const client = {
    openChannel(service: string, parameters: Record<string, unknown>): DXLinkChannel {
      last = createMockChannel(1, service, parameters)
      return last
    },
  } as DXLinkClient
  return { client, lastChannel: () => last }
}

const PARAMS = { symbol: 'AAPL', source: 'NTV', granularity: '10m', fromTime: 1_700_000_000_000 }

test('opens the DeepBook RPC channel and sends the request on open', () => {
  const mock = createMockClient()
  const deepBook = new DXLinkDeepBook(mock.client, PARAMS)

  const channel = mock.lastChannel()!
  expect(channel.service).toBe('dxfeed.marketdata.v1alpha.DeepBookService')
  expect(channel.parameters['methodName']).toBe('streamDeepBookLevels')

  channel.simulateOpen()
  expect(channel.sentMessages).toHaveLength(1)
  expect(channel.sentMessages[0]!.type).toBe('CHANNEL_DATA')
  expect(channel.sentMessages[0]!['payload']).toEqual(PARAMS)

  deepBook.close()
})

test('delivers history (pending=true) then live (pending=false) with state transitions', () => {
  const mock = createMockClient()
  const deepBook = new DXLinkDeepBook(mock.client, PARAMS)
  const channel = mock.lastChannel()!

  const batches: Array<{ levels: DeepBookLevel[]; pending: boolean }> = []
  deepBook.addOrdersListener((levels, pending) => batches.push({ levels, pending }))
  const states: DXLinkDeepBookState[] = []
  deepBook.addStateChangeListener((state) => states.push(state))

  channel.simulateOpen()
  expect(deepBook.getState()).toBe(DXLinkDeepBookState.CONNECTING)

  const historyLevel: DeepBookLevel = { price: 150, size: 100, side: 'SIDE_BUY', time: 1 }
  channel.simulateMessage({
    type: 'CHANNEL_DATA',
    payload: { levels: [historyLevel], pending: true },
  })
  // Marker frame: protobuf JSON omits default values, so it can be an empty object.
  channel.simulateMessage({ type: 'CHANNEL_DATA', payload: {} })
  const liveLevel: DeepBookLevel = { price: 151, size: 0, side: 'SIDE_SELL', time: 2 }
  channel.simulateMessage({
    type: 'CHANNEL_DATA',
    payload: { levels: [liveLevel], pending: false },
  })

  expect(batches).toEqual([
    { levels: [historyLevel], pending: true },
    { levels: [], pending: false },
    { levels: [liveLevel], pending: false },
  ])
  expect(states).toEqual([DXLinkDeepBookState.HISTORY, DXLinkDeepBookState.LIVE])
  expect(deepBook.getState()).toBe(DXLinkDeepBookState.LIVE)

  deepBook.close()
})

test('transitions to CLOSED when the server closes the channel', () => {
  const mock = createMockClient()
  const deepBook = new DXLinkDeepBook(mock.client, PARAMS)
  const channel = mock.lastChannel()!

  channel.simulateOpen()
  channel.simulateClose()

  expect(deepBook.getState()).toBe(DXLinkDeepBookState.CLOSED)
})
