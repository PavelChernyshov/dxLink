import type { DxLinkWsData } from './codec'
import type { DxLinkWsSubprotocol } from './protocol'

/**
 * A WebSocket message duplex: discrete frame payloads in each direction.
 *
 * WebSocket already frames messages, so this is message-oriented (one chunk = one frame),
 * unlike a raw byte duplex. Text chunks are used for `dxlink-ws-json`, binary for
 * `dxlink-ws-protobuf`.
 */
export interface DxLinkWsDuplex {
  readonly readable: ReadableStream<DxLinkWsData>
  readonly writable: WritableStream<DxLinkWsData>
}

/**
 * Opens a transport for the given URL and negotiated subprotocol.
 *
 * Injectable via {@link DxLinkWebSocketClientConfig.transport} — the default is
 * {@link webSocketTransport}; tests and alternative environments can supply their own.
 */
export type DxLinkWsTransportFactory = (
  url: string,
  subprotocol: DxLinkWsSubprotocol
) => Promise<DxLinkWsDuplex>

/**
 * Default transport: a browser/Node `WebSocket` adapted to a {@link DxLinkWsDuplex}.
 *
 * Resolves once the socket is open. Inbound text arrives as `string`, binary as `Uint8Array`.
 */
export const webSocketTransport: DxLinkWsTransportFactory = (url, subprotocol) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url, subprotocol)
    socket.binaryType = 'arraybuffer'

    const onOpenError = () => reject(new Error(`dxLink WebSocket failed to connect: ${url}`))
    socket.addEventListener('error', onOpenError, { once: true })

    socket.addEventListener(
      'open',
      () => {
        socket.removeEventListener('error', onOpenError)

        const readable = new ReadableStream<DxLinkWsData>({
          start(controller) {
            socket.addEventListener('message', (event: MessageEvent) => {
              const data: unknown = event.data
              controller.enqueue(
                typeof data === 'string' ? data : new Uint8Array(data as ArrayBuffer)
              )
            })
            socket.addEventListener('close', () => {
              try {
                controller.close()
              } catch {
                // already closed
              }
            })
            socket.addEventListener('error', () => {
              try {
                controller.error(new Error('dxLink WebSocket error'))
              } catch {
                // already errored
              }
            })
          },
          cancel() {
            socket.close()
          },
        })

        const writable = new WritableStream<DxLinkWsData>({
          write(chunk) {
            socket.send(chunk)
          },
          close() {
            socket.close()
          },
          abort() {
            socket.close()
          },
        })

        resolve({ readable, writable })
      },
      { once: true }
    )
  })
