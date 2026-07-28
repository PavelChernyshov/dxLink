# dxLink JS v2 — RPC-first client for protocol v1.0

> Status: **base + WebSocket client implemented (both wire formats), HTTP client in progress.** New
> packages carry a temporary `-v2` suffix so the old (`0.9.x`) and new generations install side by
> side during evaluation. When v2 is promoted to production baseline, drop the `-v2` suffix, cut a
> clean semver, and deprecate the `0.9.x` line. See the phased roadmap for per-phase status.

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
   `GenService` descriptor per service (method name/kind/input/output schemas), so `dxlink.createService(Service)`
   builds a fully-typed client at runtime with no per-service codegen —
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
Typed service client (base)        dxlink.createService(OrderEntryService)         (no custom plugin)
        │ GenService descriptors from @dxtrade/dxtrade-api (protoc-gen-es) — transport-neutral
4 wrappers  (base)                 unary→Promise · serverStream→ReadableStream ·
        │                          clientStream→Promise · bidiStream→ReadableStream
DxLinkClient (base, RPC abstraction) createCall(method) → { requests: WritableStream, responses: ReadableStream }
        │                          + connect/auth/state · impls: WS + HTTP (now), gRPC (later)
Frame codec (per format)           TransformStream<Frame,bytes> / <bytes,Frame> · json | protobuf
        │
Byte duplex (transport)            { readable, writable }  ← WebSocket now; WebTransport/WebSocketStream later
```

## Packages

| Package (temporary) | Role | Deps | Promoted name |
|---|---|---|---|
| **`@dxfeed/dxlink-client-v2`** (base) | `DxLinkClient` (incl. `createService`), `DxLinkCall`, `DxLinkMethodDescriptor`, `DxLinkServiceClient`, `DxLinkByteDuplex` + 4 wrappers + `DxLinkMessageCodec`/`jsonMessageCodec` + state/auth/error types (`createService` is implemented per transport, not in the base) | `@bufbuild/protobuf` | `@dxfeed/dxlink-client` |
| `@dxfeed/dxlink-client-ws-v2` (ext) | `DxLinkWebSocketClient`: json + protobuf frame codecs, channel mux, SETUP/AUTH/KEEPALIVE, reconnect | base, `@bufbuild/protobuf` | `@dxfeed/dxlink-client-ws` |
| **`@dxfeed/dxlink-client-http-v2`** (ext) | `DxLinkHttpClient`: `fetch` over the `dxlink-http-framework` HTTP/JSON transcoding binding (`POST /{service}/{method}`, canonical protobuf-JSON, `Bearer` auth). **Unary only** (server returns `505` for streaming) | base, `@bufbuild/protobuf` | `@dxfeed/dxlink-client-http` |
| `@dxfeed/dxlink-rpc-rxjs-v2` *(optional, ext)* | rxjs adapter (`from(readableStream)`) | base, rxjs | `@dxfeed/dxlink-rpc-rxjs` |
| **`@dxfeed/dxlink-client-conformance-v2`** *(private, not published)* | Conformance suite: owns the RPC **service `.proto` fixtures** (`TestService`/`EchoService`/`QuoteService`) + their `protoc-gen-es` codegen, and validates every client against the **generated** services via `createService` in both wire formats. Resolves the sibling packages to their `src` (vitest alias + tsconfig `paths`) so it needs no prior build | base, ws, http, `@bufbuild/protobuf` | — (never published) |
| **`@dxtrade/dxtrade-api`** | generated messages + enums + service descriptors (`GenService`) — **transport-neutral, no dxlink dep**; **built inside `dxtrade-api-specs`** (no `-v2`; contract-versioned) | `@bufbuild/protobuf` | same |

The client packages ship no service fixtures. **`dxlink-client-ws-v2` keeps only its production frame-proto codegen** (`dxlink/ws/v1/*.proto` → `src/gen`, required by `createProtobufFrameCodec`); **`dxlink-client-http-v2` has no codegen at all**. All RPC-service fixtures + their codegen live in the conformance package.

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

// ── typed service client from a protoc-gen-es descriptor (base; NO custom plugin) ─
// The ONLY entry point — a method on the client. Each transport implements it itself (no shared
// builder, no abstract base): it maps each method to the wrapper for its kind, and validates that
// the transport actually supports that interaction model (throwing DxLinkRpcError otherwise), so
// every impl has precise control over what it exposes.
interface DxLinkClient {
  createService<S extends GenServiceMethods>(service: GenService<S>): DxLinkServiceClient<S>
}
// DxLinkServiceClient<S> maps each method by its kind:
//   unary            → (req, o?)  => Promise<Res>
//   server_streaming → (req, o?)  => ReadableStream<Res>
//   client_streaming → (reqs, o?) => Promise<Res>
//   bidi_streaming   → (reqs, o?) => ReadableStream<Res>
// The 4 wrappers (unary/serverStream/clientStream/bidiStream) stay in the base as shared building
// blocks; they accept anything with `createCall` (Pick<DxLinkClient,'createCall'>).

// usage — OrderEntryService is the GenService generated into @dxtrade/dxtrade-api
const orders = dxlink.createService(OrderEntryService)
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
  `@dxtrade/dxtrade-api`. That is all the codegen required: `dxlink.createService(Service)`
  in the base package consumes the `GenService` descriptor and produces a fully-typed client at runtime (the
  same model Connect-ES v2 uses — it removed `protoc-gen-connect-es` in favor of this). So `@dxtrade/dxtrade-api`
  stays **transport-neutral** (no dependency on `@dxfeed/dxlink-client-v2`).

`protoc-gen-es` is a Node executable → configure the gradle protobuf plugin
`plugins { id("es") { path = "…/node_modules/.bin/protoc-gen-es" } }` and run `npm ci` before `generateProto`.

**Frame protos** (`dxlink/ws/v1/*.proto`, from `dxlink-java/dxlink-websocket-api`) are **vendored into
`dxlink-client-ws-v2/proto/` and generated to `src/gen/` via `buf generate`** (see `buf.gen.yaml`:
`protoc-gen-es`, `target=ts`, `import_extension=none`; `pnpm gen`). The generated `DxLinkWsFrameSchema`
drives `createProtobufFrameCodec()` and is **production** code shipped with the WS package. `buf` (already
installed) compiles the protos — no `protoc` needed; `@bufbuild/protoc-gen-es` is a devDependency.

**RPC-service fixtures** (`TestService` 4-model, `EchoService` unary/server-stream, `QuoteService` unary)
live in the **`dxlink-client-conformance-v2`** package (`proto/dxlink/test/*.proto` → `src/gen/`, same
`buf generate` setup). That private package validates the `createService` pipeline end-to-end against the
generated descriptors, keeping the shippable client packages free of test-only codegen.

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
2. **Dependency direction for stubs — RESOLVED.** Reusing `protoc-gen-es` descriptors +
   `dxlink.createService(...)` means `@dxtrade/dxtrade-api` carries only messages + descriptors and stays
   transport-neutral (no `@dxfeed/dxlink-client-v2` dependency). No cross-repo coupling.

## Phased roadmap

Status legend: ✅ done · 🟡 partial (bufbuild/server-blocked remainder) · ⛔ blocked in this env · ⬜ not started.

1. ✅ **Codegen spike** — done in the JS repo: `dxlink/ws/v1/*.proto` (frame protos) + `TestService` (4 models) +
   `EchoService` (unary/server-stream) vendored into `dxlink-client-ws-v2/proto/` and generated with `protoc-gen-es`
   via `buf generate` (`pnpm gen`). Proven: `toBinary`/`fromBinary` frame round-trip, `anyPack`/`anyUnpack` payloads,
   `toJson`/`fromJson`, and a `GenService` descriptor driving `createService(...)` with correct per-method types
   (`dual-format.test.ts`, `protobuf-codec.test.ts`). *(Still pending: wiring the same `protoc-gen-es` step into the
   `dxtrade-api-specs` gradle pipeline so the real business API ships as `@dxtrade/dxtrade-api` — that repo + gradle
   are out of this workspace. Live-server validation against `wss://dxlink-md-ws-dev.dxkube.com` also pending.)*
2. ✅ **`@dxfeed/dxlink-client-v2` (base)** — contracts + 4 wrappers (over `Pick<DxLinkClient,'createCall'>`) +
   `AbortSignal` plumbing + the `DxLinkClient.createService` **contract** and `DxLinkServiceClient<S>` mapped type
   (each transport implements `createService` itself — no shared builder, no abstract base) + `DxLinkMessageCodec` seam
   with a canonical protobuf-JSON impl (`jsonMessageCodec`, `toJson`/`fromJson`) and `passthroughMessageCodec`. Dep
   `@bufbuild/protobuf` (2.13.0) installed. 13 vitest tests (wrappers + canonical-JSON round-trip vs a real WKT schema),
   tsup esm+cjs+dts + tsc + eslint green.
3. ✅ **`@dxfeed/dxlink-client-ws-v2`** — `DxLinkWebSocketClient` state machine (SETUP/AUTH/KEEPALIVE/reconnect),
   channel mux, `createCall`→`DxLinkCall`, and its **own `createService`** that maps each method to the unary/server-stream
   wrapper and **rejects unsupported models** (client-/bidi-streaming throw `DxLinkRpcError`, pending the half-close item).
   **Both frame codecs implemented**: JSON (envelope faithful to `dxlink-java`, RPC method via `parameters.methodName`) and
   **protobuf** (`createProtobufFrameCodec` — one `DxLinkWsFrame` per binary message, `google.protobuf.Any` payload,
   faithful to `dxlink-java`'s `ProtobufFrameCodec`). `format` selects the matching frame + message codec; **`'protobuf'`
   is the default**. 21 vitest tests (mock transport driving full RPC lifecycle + frame-codec round-trips in both formats +
   `createService` model-rejection) + tsc + build + lint green. Live-server interop still pending. The generated-service
   e2e now lives in the conformance package (Phase 4).
4. ✅ **Generic client + e2e (in-memory, both formats)** — validated in **`@dxfeed/dxlink-client-conformance-v2`** (private):
   `createService(EchoService)` binds unary + server-stream over an in-memory transport in **both `json` and `protobuf`**,
   with real `protoc-gen-es` messages + wire-format assertions, and `createService(QuoteService)` round-trips over the HTTP
   client; `createService(TestService)` rejects the streaming-input models on both transports. **Remaining:** bind the real
   generated business service against the **live server** in both formats. *(Blocked on the `dxtrade-api-specs` codegen
   output + a reachable live server / auth token — network + credentials this sandbox lacks.)*
5. ✅ **HTTP client** — `@dxfeed/dxlink-client-http-v2`: `DxLinkHttpClient` implements `DxLinkClient` over
   `fetch` against the `dxlink-http-framework` **HTTP/JSON transcoding** binding (confirmed by reading the
   Java server): each unary RPC is a `POST /{service}/{method}` (path lower-cased) with a **canonical
   protobuf-JSON** body/response (reuses the base `jsonMessageCodec`, no `Any`), `Authorization: Bearer`,
   and status→`DxLinkErrorType` mapping. HTTP is connectionless (`connect()` flips to CONNECTED; no
   SETUP/KEEPALIVE). **Unary only** — the server returns `505` for streaming, so `createService` rejects
   every non-`REQUEST_RESPONSE` model. 6 in-package vitest tests (mock `fetch`, transport mechanics via hand-built
   descriptors + inline model-rejection); the real generated-service round-trip is in the conformance package (Phase 4).
   tsc + build + lint green. *(Note: the binding is Google-API JSON transcoding,
   **not** connect-es/gRPC-web as originally sketched — corrected in the packages table.)*
