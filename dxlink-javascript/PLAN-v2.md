# dxLink JS v2 — RPC-first client for protocol v1.0

> Status: **design locked, not yet scaffolded.** New packages carry a temporary `-v2` suffix so
> the old (`0.9.x`) and new generations install side by side during evaluation. When v2 is promoted
> to production baseline, drop the `-v2` suffix, cut a clean semver, and deprecate the `0.9.x` line.

## Goal & context

Bring the JS client to dxLink **protocol v1.0** (as implemented by the `dxlink-java` server), replacing
the old `0.1` FEED/DOM JSON-only client (`dxlink-specification/asyncapi.yml`).

Protocol v1.0 is **RPC-first**: every channel is one RPC call
(`CHANNEL_REQUEST{service, method}` → `CHANNEL_OPENED` → `CHANNEL_DATA`×N (either direction) →
`CHANNEL_CLOSED`), across four interaction models. It has **two subprotocols over one frame model**:

- `dxlink-ws-json` — text frames; RPC payloads are canonical **protobuf-JSON** (server: buffjson).
- `dxlink-ws-protobuf` — binary frames (`DxLinkWsFrame`); RPC payloads are `google.protobuf.Any`.

Server RPC handler contract (Reactor) maps 1:1 to our surface:

| Model | Server | Client sends → recv | Client surface |
|---|---|---|---|
| `REQUEST_RESPONSE` | `Mono<O> handle(IN)` | 1 → 1 | `Promise<O>` |
| `REQUEST_STREAM` | `Flux<O> handle(IN)` | 1 → N | `ReadableStream<O>` |
| `STREAM_RESPONSE` | `Mono<O> handle(Flux<IN>)` | N → 1 | `WritableStream<I>` + `Promise<O>` |
| `STREAM_STREAM` | `Flux<O> handle(Flux<IN>)` | N → N | `WritableStream<I>` + `ReadableStream<O>` |

## Locked decisions

1. **`dxlink-client` is the base package; everything else is an extension.** The base defines the
   `DxLinkClient` RPC abstraction + call/stream contracts + the four wrappers + codec seam. Concrete
   clients (WS now; HTTP/gRPC later) and the rxjs adapter are extension packages that depend on the base.
2. **`DxLinkClient` IS the RPC abstraction** — WS / HTTP / gRPC are interchangeable *implementations*.
3. **Two wire formats**, chosen per client instance (`format: 'protobuf' | 'json'`).
4. **Codegen: `protoc-gen-es` (@bufbuild/protobuf) via the protoc plugin pipeline — NOT `buf generate`.**
   Runs through the `com.google.protobuf` gradle plugin already used in `dxtrade-api-specs` (same pipeline
   as the Java codegen). Same generated types serialize to both binary (`toBinary`/`anyPack`) and canonical
   protobuf-JSON (`toJson`) — single source of truth, matches the server's dual codec.
5. **No custom plugin needed — reuse `protoc-gen-es` service descriptors.** protoc-gen-es (v2) emits a
   `GenService` descriptor per service (method name/kind/input/output schemas), so a generic
   `createDxLinkClient(service, dxlink)` builds a fully-typed client at runtime with no per-service codegen —
   exactly how Connect-ES v2 works (it removed its own `protoc-gen-connect-es` for this). A custom stub plugin
   (explicit `XxxServiceClient` classes, symmetric with the Java `dxlink-service-protobuf-plugin`) is
   **optional sugar, deferred** — not on the critical path. (See Codegen.)
6. **Native ES/WHATWG primitives only — no rxjs in core:** unary → `Promise`, streams → WHATWG
   `ReadableStream`/`WritableStream`, cancellation → `AbortSignal`.
7. **Future-proofing to WebTransport is the decider for #6.** The platform converged on WHATWG Streams
   + AbortSignal: a WebTransport bidi stream *is* `{ readable, writable }` (== `DxLinkCall`),
   `WebSocketStream.opened` → `{ readable, writable }`, `fetch` body is a `ReadableStream`.
   - Transport boundary = a byte duplex `{ readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array> }`.
   - Codec = composable `TransformStream`s (`pipeThrough`/`pipeTo`); gzip/json/protobuf = swap a transform.
   - `DxLinkCall` = `{ readable, writable }` → on WebTransport each call becomes a real QUIC bidi stream
     (native multiplexing, dropping manual channel-id framing); datagram mode is just another duplex.
8. **New parallel packages with temporary `-v2` suffix.**
9. **Public API naming: `DxLink` prefix** (e.g. `DxLinkClient`, `DxLinkMethodDescriptor`) — matching the
   `dxlink-java` side and the `dxLink` brand. Note this differs from the old `0.9.x` packages' `DXLink`
   spelling (see `AGENTS.md`); the two capitalizations coexist during the parallel period, and `DxLink`
   becomes the standard when v2 is promoted. Free functions stay verbs (`unary`, `serverStream`, …).

## Layering

```
Generic client from descriptors    createDxLinkClient(OrderEntryService, dxlink)   (no custom plugin)
        │ GenService descriptors from @dxtrade/dxtrade-api (protoc-gen-es) — transport-neutral
4 wrappers  (base)                 unary→Promise · serverStream→ReadableStream ·
        │                          clientStream→Promise · bidiStream→ReadableStream
DxLinkClient (base, RPC abstraction) createCall(method) → { requests: WritableStream, responses: ReadableStream }
        │                          + connect/auth/state · impls: WS (now), HTTP/gRPC (later)
Frame codec (per format)           TransformStream<Frame,bytes> / <bytes,Frame> · json | protobuf
        │
Byte duplex (transport)            { readable, writable }  ← WebSocket now; WebTransport/WebSocketStream later
```

## Packages

| Package (temporary) | Role | Deps | Promoted name |
|---|---|---|---|
| **`@dxfeed/dxlink-client-v2`** (base) | `DxLinkClient`, `DxLinkCall`, `DxLinkMethodDescriptor`, `DxLinkFrame`, `DxLinkFrameCodec`, `DxLinkByteDuplex` + 4 wrappers + generic `createDxLinkClient` + state/auth/error types | `@bufbuild/protobuf` | `@dxfeed/dxlink-client` |
| `@dxfeed/dxlink-client-ws-v2` (ext) | `DxLinkWebSocketClient`: json + protobuf frame codecs, channel mux, SETUP/AUTH/KEEPALIVE, reconnect | base, `@bufbuild/protobuf` | `@dxfeed/dxlink-client-ws` |
| `@dxfeed/dxlink-client-http-v2` *(later, ext)* | connect-es-backed impl | base | `@dxfeed/dxlink-client-http` |
| `@dxfeed/dxlink-rpc-rxjs-v2` *(optional, ext)* | rxjs adapter (`from(readableStream)`) | base, rxjs | `@dxfeed/dxlink-rpc-rxjs` |
| **`@dxtrade/dxtrade-api`** | generated messages + enums + service descriptors (`GenService`) — **transport-neutral, no dxlink dep**; **built inside `dxtrade-api-specs`** (no `-v2`; contract-versioned) | `@bufbuild/protobuf` | same |

Per-package tooling follows the existing convention: `tsup` (esm+cjs+dts), extends root `tsconfig.json`,
`DxLink`-prefixed public symbols, `UPPER_SNAKE_CASE` `as const` constants.

## Public API contracts

```ts
// ── @dxfeed/dxlink-client-v2 (base) ────────────────────────────────────────
interface DxLinkCall<I, O> {
  readonly requests: WritableStream<I>
  readonly responses: ReadableStream<O>
}

interface DxLinkClient {
  connect(): void
  disconnect(): void
  getState(): DxLinkConnectionState
  onStateChange(l: (state: DxLinkConnectionState, prev: DxLinkConnectionState) => void): DxLinkUnsubscribe

  setAuthToken(token: string | (() => string | Promise<string>)): void
  getAuthState(): DxLinkAuthState
  onAuthStateChange(l: (state: DxLinkAuthState) => void): DxLinkUnsubscribe
  onError(l: (error: DxLinkError) => void): DxLinkUnsubscribe

  createCall<I, O>(method: DxLinkMethodDescriptor<I, O>, options?: DxLinkCallOptions): DxLinkCall<I, O>
}

interface DxLinkCallOptions { signal?: AbortSignal }
type DxLinkUnsubscribe = () => void

// wrappers (free functions over createCall; generated stubs call these)
function unary<I, O>(c: DxLinkClient, m: DxLinkMethodDescriptor<I, O>, req: I, o?: DxLinkCallOptions): Promise<O>
function serverStream<I, O>(c: DxLinkClient, m: DxLinkMethodDescriptor<I, O>, req: I, o?: DxLinkCallOptions): ReadableStream<O>
function clientStream<I, O>(c: DxLinkClient, m: DxLinkMethodDescriptor<I, O>, reqs: ReadableStream<I> | AsyncIterable<I>, o?: DxLinkCallOptions): Promise<O>
function bidiStream<I, O>(c: DxLinkClient, m: DxLinkMethodDescriptor<I, O>, reqs: ReadableStream<I> | AsyncIterable<I>, o?: DxLinkCallOptions): ReadableStream<O>

interface DxLinkUnaryCall<O> { readonly response: Promise<O>; cancel(reason?: unknown): void }
function unaryCall<I, O>(c: DxLinkClient, m: DxLinkMethodDescriptor<I, O>, req: I): DxLinkUnaryCall<O>

// ── transport / codec seam (base) ──────────────────────────────────────────
interface DxLinkByteDuplex {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
}
interface DxLinkFrameCodec {
  readonly subprotocol: 'dxlink-ws-json' | 'dxlink-ws-protobuf'
  createEncoder(): TransformStream<DxLinkFrame, Uint8Array>
  createDecoder(): TransformStream<Uint8Array, DxLinkFrame>
}

// ── @dxfeed/dxlink-client-ws-v2 (extension) ────────────────────────────────
class DxLinkWebSocketClient implements DxLinkClient {
  constructor(config: {
    url: string
    format?: 'protobuf' | 'json'                 // default 'protobuf'
    authToken?: string | (() => string | Promise<string>)
    keepaliveInterval?: number
    keepaliveTimeout?: number
    maxReconnectAttempts?: number
    transport?: (url: string, subprotocol: string) => Promise<DxLinkByteDuplex>  // future: WebSocketStream/WebTransport
  })
}

// ── generic client from a protoc-gen-es descriptor (base; NO custom plugin) ─
function createDxLinkClient<S extends DescService>(service: GenService<S>, client: DxLinkClient): DxLinkServiceClient<S>
// DxLinkServiceClient<S> maps each method by its kind:
//   unary            → (req, o?)  => Promise<Res>
//   server_streaming → (req, o?)  => ReadableStream<Res>
//   client_streaming → (reqs, o?) => Promise<Res>
//   bidi_streaming   → (reqs, o?) => ReadableStream<Res>

// usage — OrderEntryService is the GenService generated into @dxtrade/dxtrade-api
const orders = createDxLinkClient(OrderEntryService, dxlink)
const res = await orders.issueOrder(req, { signal })      // fully typed, no generated stub class
```

## Wire-format mapping (handled entirely inside the frame codec)

| | Frame envelope | RPC payload |
|---|---|---|
| json | custom flat `{type, channel, time?, correlationId?, service?, version?, parameters?, payload?}` | `toJson(msg)` — canonical protobuf-JSON, bare (type known from method) |
| protobuf | `DxLinkWsFrame{channel, header, oneof message}` (from `dxlink/ws/v1/*.proto`) | `anyPack(msg)` → `google.protobuf.Any` |

Correlation stays **one channel per call** (identical for both formats; JSON-only `correlationId` unused).

## Codegen (protoc plugin pipeline, in `dxtrade-api-specs`)

Reuse the existing `com.google.protobuf` gradle pipeline; add **one** protoc plugin alongside the Java ones:

- **`protoc-gen-es`** — generates messages, enums, and service **descriptors** (`GenService`) into
  `@dxtrade/dxtrade-api`. That is all the codegen required: the generic `createDxLinkClient(service, dxlink)`
  in the base package consumes the `GenService` descriptor and produces a fully-typed client at runtime (the
  same model Connect-ES v2 uses — it removed `protoc-gen-connect-es` in favor of this). So `@dxtrade/dxtrade-api`
  stays **transport-neutral** (no dependency on `@dxfeed/dxlink-client-v2`).

`protoc-gen-es` is a Node executable → configure the gradle protobuf plugin
`plugins { id("es") { path = "…/node_modules/.bin/protoc-gen-es" } }` and run `npm ci` before `generateProto`.
**Frame protos** (`dxlink/ws/v1/*.proto`, from `dxlink-java/dxlink-websocket-api`) are generated with
`protoc-gen-es` into `dxlink-client-ws-v2` (vendor or a small published package).

**Optional, deferred:** a custom `@bufbuild/protoplugin` stub plugin (`protoc-gen-dxlink-es`) emitting explicit
`XxxServiceClient` classes for extra discoverability / symmetry with the Java plugin — sugar over the same
descriptors, added only if DX calls for it.

## Open items

1. **Half-close (protocol).** dxLink v1.0 wire has no dedicated half-close frame — only `CHANNEL_CANCEL`,
   which the server treats as a hard cancel (`ChannelClosedException`), not graceful input-complete. So
   `WritableStream.close()` can't be distinguished from `.abort()` on the wire → blocks clean
   `STREAM_RESPONSE`/`STREAM_STREAM`. **Unary + server-stream are unaffected**, and every real dxTrade
   service is unary (streaming only in `TestService`). Settle with `dxlink-java` owners before shipping the
   two client-streaming models. `WritableStream` stays the right (superset) abstraction.
2. **Dependency direction for stubs — RESOLVED.** Reusing `protoc-gen-es` descriptors + generic
   `createDxLinkClient` means `@dxtrade/dxtrade-api` carries only messages + descriptors and stays
   transport-neutral (no `@dxfeed/dxlink-client-v2` dependency). No cross-repo coupling.

## Phased roadmap

1. **Codegen spike** — wire `protoc-gen-es` into `dxtrade-api-specs` gradle; generate `TestService` (4 models)
   + frame protos; prove `toBinary`/`fromBinary` + `toJson` round-trip and that a `GenService` descriptor drives
   the generic `createDxLinkClient` with correct per-method types. Validate vs a live server (`wss://dxlink-md-ws-dev.dxkube.com`).
2. **`@dxfeed/dxlink-client-v2` (base)** — contracts + 4 wrappers + `AbortSignal` plumbing; unit tests with a mock `DxLinkClient`.
3. **`@dxfeed/dxlink-client-ws-v2`** — protobuf codec first (Any-based), then json; channel mux + SETUP/AUTH/KEEPALIVE
   + reconnect; interop-test both subprotocols against the server.
4. **Generic client + e2e** — `createDxLinkClient` binds a real unary service (`MarketDataSubscriptionService` /
   `OrderEntryService`) end to end in both formats.
5. **HTTP/gRPC client (later)** — second `DxLinkClient` impl over connect-es.
