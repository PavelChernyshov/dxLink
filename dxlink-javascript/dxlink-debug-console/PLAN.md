# dxlink-debug-console — Rebuild Plan

A ground-up rebuild of `@dxfeed/dxlink-docs`'s debug console as a new package,
`@dxfeed/dxlink-debug-console`, on a modern stack with cleaner architecture and
improved UX. Full feature parity, delivered in shippable phases.

> **Design / architecture lives in [ARCHITECTURE.md](./ARCHITECTURE.md).** This document
> covers scope, decisions, phases, and risks only.

---

## 1. Goals & non-goals

**Goals**
- Recreate every capability of the current debug console (connection, auth, Feed,
  DOM, Candles, Script/IndiChart, error handling, AsyncAPI protocol viewer).
- Replace the proprietary/aging stack (`@dxfeed/ui-kit`, `styled-components`) with a
  modern, open-source, well-maintained foundation.
- Collapse the ad-hoc listener wiring into a clean, reactive architecture (see ARCHITECTURE.md).
- Improve UX: dark/light themes, persisted presets, virtualized live tables,
  a real error center, shareable state, accessibility, responsive layout.
- **Keep UI customization minimal**: use stock MUI components and the default theme as much
  as possible; avoid bespoke wrappers and heavy restyling. Only add a custom component where
  MUI genuinely has no equivalent.

**Non-goals**
- Changing `@dxfeed/dxlink-api` itself (consumed as `workspace:*`).
- Building a general-purpose trading UI — this stays a *protocol debug console*.
- Reimplementing the dxScript language engine or the candle/indicator chart renderer
  (we keep the first-party chart package).

---

## 2. Locked decisions

| Area | Decision | Rationale |
|---|---|---|
| Package | `@dxfeed/dxlink-debug-console` at `dxlink-javascript/dxlink-debug-console` | Sibling **app** package: `private: true`, deploy-only (mirrors dxlink-docs), added to changeset `ignore` (monorepo uses `fixed: [["**"]]`), not npm-published. `dxlink-docs` kept until parity, then deprecated |
| Framework | **React 19** + **Vite** (SPA, no SSR) | Client-only WebSocket app; Vite already standard in this monorepo |
| Language | TypeScript, `strict` | — |
| UI kit | **MUI (Material UI) v9** + **MUI X v9** (latest) | Per decision. ⚠️ Phase-0 gate: React-19 peers + the `minimumReleaseAge: 1440` cooldown must be verified on install (risk #1). v8 LTS is the documented fallback if v9 blocks |
| Styling | MUI's styling (`sx` / `styled` from `@mui/system`) + theme | Drops `styled-components` (maintenance mode since 2024) |
| Theme mode | **System-defined by default** (`prefers-color-scheme`), with in-app override: System / Light / Dark, persisted | MUI `colorSchemes` + `useColorScheme()` hook, `defaultMode: 'system'`; `InitColorSchemeScript` to avoid flash |
| UI approach | **Stock MUI components + default theme**; minimal custom UI / minimal restyling | Build custom only where MUI has no equivalent (e.g. JSON view); faster, consistent, less to maintain |
| State / architecture | **MVVM**: one ViewModel per concern (connection + per channel); **no global store** | Clean separation; the connection VM is page-scoped, channel VMs are per-channel. Design in ARCHITECTURE.md |
| VM reactivity | **Zustand vanilla store *inside each VM*** (`createStore`), bound with `useStore(vm.store, selector)` | Per-VM, local — not global. Minimal boilerplate; live dxlink objects stay off the store as VM fields |
| Forms | **react-hook-form** + **zod** | Many typed config/param forms; schema-driven dynamic forms for indicator params |
| Live tables | **MUI X DataGrid** — keyed upsert (one row per symbol) + throttled `setState` (~10–20 fps) | Feed is a *low-row keyed grid*, not an append stream → DataGrid suffices. Real high-throughput concern is the chart push path (Phase 5/6), not the grid. TanStack Virtual only a contingency |
| Charts | **Keep `@dxscript/dxlink-dxcharts-lite`** (IndiChart) — *for now* | First-party candle + indicator renderer; peers `react >=18` (React 19 OK). Used in Candles (Phase 5) and Script/IndiChart (Phase 6). Revisit alongside dxlink-api peer-range updates (risk #5) |
| Code editor | **Replace dxScript editor with CodeMirror 6** (now) | OSS, tiny, Lezer parser. Baseline JS highlighting for `dxscript-js` + custom samples + server `ScriptError` decorations. **Accepted downgrade:** loses first-party dxScript completion/diagnostics (non-parity) |
| Protocol tab | **Include**, on latest `@asyncapi/react-component` (3.1.0) | Standalone web-component bundle as fallback if React 19 peer conflict |
| Routing | **React Router v7 + HashRouter**, Vite `base: ''` | Preserves current sub-path/static hosting (dxlink-docs uses HashRouter); BrowserRouter would 404 on deep-link/refresh |
| Testing | **Vitest** + Testing Library (unit) · **Playwright** (E2E smoke) | E2E targets dev WS `wss://dxlink-md-ws-dev.dxkube.com` |
| Lint/format | ESLint flat config (reuse workspace `eslint.config.mjs`) + Prettier | Consistent with monorepo |
| Monorepo | pnpm workspace + Turbo + Changesets | Already in place |

### Compatibility — to verify at Phase 0 (NOT yet installed)
> Correction: the current lockfile pins **react 18** (48 refs, 0 for react@19). React 19 is **not installed**;
> the react@19 dirs in the pnpm store are orphaned artifacts from a prior abandoned experiment (they
> reference `@mantine/core`, `react-ace`, `@tabler/icons` — none used by the current app). Treat the items
> below as **declared-peer-compatible but unverified** until we install React 19 in the new package.
- `@dxscript/dxlink-dxcharts-lite@1.11.4` — declares peers `react >=18` and `@dxfeed/dxlink-api ^0.6.1` (works today against workspace 0.8.1 via the pnpm link). Verify the install against React 19.
- `@asyncapi/react-component` — 2.5.0 declares `react >=18` (known-working); target latest **3.1.0**; the **`/browser` standalone bundle is the current working import**, not a fallback.
- **Phase 0 must:** add `react`/`react-dom@19`, run `pnpm install`, and record the resolved peer graph for MUI v9, MUI X v9, dxcharts-lite, asyncapi, CodeMirror. Confirm `minimumReleaseAge: 1440` does not hold back MUI.

---

## 3. Feature parity map (old → new)

Module/file names below refer to the structure defined in [ARCHITECTURE.md](./ARCHITECTURE.md).

| Current (`dxlink-docs`) | New home | Notes |
|---|---|---|
| `connection.tsx` | `features/connection` + `connection-view-model` | RHF+zod, presets, status badge; **+ default-URL auto-detection from `window.location`** (strip `/debug`, ws/wss by protocol; dev = `ws://localhost:9959`) |
| `authorization.tsx` | `features/auth` + auth state in `ConnectionViewModel` | **Tri-state gating:** `undefined` → no form/no channels; `UNAUTHORIZED` → token form; `AUTHORIZED` → channels. Don't init to `UNAUTHORIZED` (would flash a token form on no-auth servers). `AUTHORIZING` progress |
| `channels-manager.tsx`, `channel-widget.tsx` | `features/channels` | Channel registry + generic widget |
| `feed-*.tsx`, `feed-event-type.ts`, `feed-order-source.ts` | `features/feed` + `feed-view-model` | DataGrid + coalescing; 36 sources; event-type list |
| `dom-*.tsx` | `features/dom` + `dom-view-model` | Bid/ask ladder, config panel |
| `candles/*`, `candles-*.tsx`, `chart-wrapper.ts` (candles path) | `features/candles` + `candles-view-model` | Port `DXLinkCandles` + `SortedList`; keep dxcharts-lite |
| `script-candles-*.tsx`, `parameter-field*.tsx`, `chart-wrapper.ts` (ChartHolder) | `features/indichart` + `indichart-view-model` | CodeMirror editor; schema-driven param forms; script errors |
| `errors.tsx` | `features/errors` | Error center |
| `protocol/asyncapi.tsx` | `pages/protocol-page.tsx` (page-only, no VM) | Latest `@asyncapi/react-component`; loads `dxlink-specification/asyncapi.yml` |
| `layout/*`, `page.tsx` | `app/` (shell) + `pages/console-page.tsx` | MUI theme + router shell; console page composes features |

### Behaviors easy to miss (must port — found in code review)
- **Default-URL auto-detection** from `window.location` (strip `/debug`, ws/wss by protocol); dev default `ws://localhost:9959`. Migrate `process.env.NODE_ENV` → `import.meta.env` (Vite). Extract as a unit-tested `shared/lib` function.
- **Hardcoded client opts** in the debug console: `logLevel: DEBUG`, `maxReconnectAttempts: 1` — preserve (a debug console deliberately limits reconnect); consider exposing them in the form.
- **Feed event-fields normalization**: the UI always re-prepends `['eventType','eventSymbol']` and strips them from user input before `configure`.
- **Feed "unknown event" bucket**: events lacking `eventType`/`eventSymbol` go to a separate `unknown` group/table.
- **Candles default symbol** is `AAPL{=d}` (daily) with `fromTime` default `0` — not a generic `{=period}`.
- **DOM "Accept order fields"** is intentionally a disabled/"Not available" stub today — decide implement vs preserve-stub.
- **AsyncAPI**: import the `@asyncapi/react-component/browser` standalone bundle; recompute the `?url` import path for the spec (`dxlink-specification/asyncapi.yml`) at the new package depth, and configure Vite to treat `.yml` as an asset (or use an alias/copy).

---

## 4. Phases

Each phase is independently shippable, lint/test/build green, and demoable against the
dev WS endpoint.

### Phase 0 — Scaffold & foundations
- Create package as `private: true` (app, deploy-only); add to changeset `ignore`; add root `pnpm console` convenience script.
- **Install + verify the stack first:** add `react`/`react-dom@19`, MUI v9 + MUI X v9, zustand, RHF+zod, React Router v7, CodeMirror 6; `pnpm install`; record the resolved peer graph; confirm `minimumReleaseAge` doesn't block MUI (else pin/exclude, or fall back to v8 LTS).
- Scripts mirroring siblings: `dev`/`start` (vite), `build` (vite → `build/`), `lint` (eslint), `typecheck` (tsc `--noEmit`), `test` (`vitest run`). Wire into Turbo (note `test` `dependsOn: ["build"]` globally — fine for an app).
- Vite + TS strict; `base: ''`; **HashRouter**; `.yml` treated as asset; `import.meta.env` (not `process.env`).
- MUI v9 theme with `colorSchemes` (light + dark), **system default** via `useColorScheme` + in-app mode switcher (persisted), `InitColorSchemeScript` to prevent flash; CssBaseline.
- App shell with stock MUI: `AppBar`/`Toolbar`, `Tabs` nav, `Container`/`Box`, theme switcher. `useVM(vm, selector)` helper + page-scoped `VMProvider` (StrictMode-safe construction/disposal — see ARCHITECTURE.md §2). No custom UI beyond JSON view + CodeMirror wrapper.
- **Done when:** themed empty app boots; `pnpm lint && pnpm typecheck && pnpm build` green **and ≥1 smoke test passes** (e.g. the URL-derivation `lib` fn).

### Phase 1 — Connection & error center
- `connection-view-model` wrapping `DXLinkWebSocketClient` lifecycle + state + details. Connection-level errors aggregate here; channel errors stay on channel VMs.
- Default-URL auto-detection (`shared/lib`, unit-tested); preserve `maxReconnectAttempts: 1` + `logLevel` (optionally expose in form).
- Connection form (URL + keepalive interval/timeout/accept) with persisted presets; status badge (`Chip`); client/server version display; global error center.
- **Done when:** connect/disconnect to dev WS; states + versions + keepalive shown; errors surfaced; URL-derivation test passes.

### Phase 2 — Authorization
- Auth as `DXLinkAuthState | undefined` in `ConnectionViewModel`; tri-state gating (see §3); `AUTHORIZING` progress.
- **Done when:** token auth round-trips to `AUTHORIZED`; **no-auth server (`undefined`→`AUTHORIZED`) shows channels without a token form**; rejected token (`AUTHORIZING`→`UNAUTHORIZED`) re-shows the form. Unit tests for both paths.

### Phase 3 — Channels manager + Feed channel
- Channel registry + generic `ChannelWidget` (synthetic client-side id, service/params/state/close/errors).
- `feed-view-model`: config + subscriptions + throttled keyed-upsert events; event-fields normalization (re-prepend `eventType,eventSymbol`); **unknown-event bucket** (events lacking type/symbol → separate table).
- Feed config form (aggregation period, data format, event-fields editor); subscription form (event type, symbol, fromTime + order-source picker for HISTORY/AUTO behind a checkbox defaulting `DEFAULT`, the predefined order sources); per-event-type DataGrid (one row/symbol; pause/clear/copy-as-JSON).
- **Empirically validate** DataGrid + throttle against the dev WS with a busy symbol.
- **Done when:** open feed, configure, subscribe Quote/Trade/Candle, see live rows; add/remove/reset subs; unknown events bucketed.

### Phase 4 — DOM channel
- `dom-view-model`; open form (symbol + sources); config panel (agg period, depth limit);
  bid/ask ladder table with last-update timestamp.
- **Done when:** open DOM, live bid/ask ladder updates.

### Phase 5 — Candles channel + chart
- Port `DXLinkCandles` event-flag/snapshot logic + `SortedList` into `candles-view-model`.
- Integrate `@dxscript/dxlink-dxcharts-lite` IndiChart; subscription form (default symbol `AAPL{=d}`, `fromTime` default `0`).
- Backpressure: this push path is the real high-throughput case — batch/coalesce array pushes into the chart.
- **Done when:** open candles, chart renders and updates live.

### Phase 6 — Script / IndiChart channel
- Port `ChartHolder` into `indichart-view-model` (candles/indicators snapshot + update flow,
  error categorization, parameter metadata propagation). Use the VM's synthetic id for keys/close —
  `DXLinkIndiChart.id` is `undefined` until a subscription is set. Coalesce chart pushes (backpressure).
- CodeMirror 6 dxScript editor: JS-baseline highlighting, samples dropdown, syntax/runtime
  error decorations (from `ScriptError` line/column).
- Schema-driven typed parameter form (DOUBLE/BOOL/STRING/COLOR/SOURCE/SESSION/ENUM incl. SESSION dialog).
- Chart render; script error panel (syntax/runtime/timeout/limit/cancelled).
- **Done when:** write dxScript → run → chart shows candles + indicators; edit params & re-apply; errors shown.

### Phase 7 — Protocol (AsyncAPI) tab
- `pages/protocol-page.tsx` (page-only, no VM). Use the **`@asyncapi/react-component/browser`** standalone bundle (current working approach); recompute the spec `?url` path for the new package depth; download action.
- Lazy-load this route + the chart bundles (bundle-budget hygiene — see Phase 8).
- **Done when:** protocol spec renders on `/protocol`.

### Phase 8 — Polish, parity audit, docs, migration
- Side-by-side parity checklist vs `dxlink-docs` (incl. the "easy to miss" list in §3); dark-mode QA; responsive.
- **CI/CD + deploy** mirroring `dxlink-docs`'s pipeline; **bundle-size budget** + code-splitting (lazy `/protocol`, chart, CodeMirror).
- Playwright E2E green (connect → auth → feed → subscribe → rows). README + MPL-2.0 headers if siblings carry them.
- Decision + steps to deprecate/retire `dxlink-docs`.

> **Cross-cutting (not deferred to Phase 8):** accessibility is a per-phase checklist item (a11y is a headline goal); each phase adds its unit tests; deterministic tests use the mock connector (below).

---

## 5. Risks & open questions

| # | Risk / question | Mitigation |
|---|---|---|
| 1 | **React 19 not yet installed** (lockfile pins react 18) + MUI v9 freshness + `minimumReleaseAge: 1440` cooldown | **Decided: target v9.** Phase-0 gate: install React 19 + MUI v9, record peer graph, confirm cooldown doesn't block. Fall back to MUI v8 LTS if it does |
| 2 | Feed table re-render rate | Feed is a **low-row keyed-upsert grid** → DataGrid + throttled `setState` (~10–20 fps) suffices; validate empirically (Phase 3). Real backpressure is the **chart push path** (Phase 5/6) — coalesce array pushes. TanStack Virtual only a contingency |
| 3 | CodeMirror loses first-party dxScript tooling | **Decided: ship CM6 now**, accepting it as non-parity (no completion/inline diagnostics). Mitigate with JS-baseline highlighting, samples dropdown, and server `ScriptError` decorations |
| 4 | `@asyncapi/react-component` React 19 peer compat unconfirmed | The `/browser` standalone bundle is the **current working** approach (not a fallback); pin known-working 2.5.0 if 3.1.0 conflicts |
| 5 | dxcharts-lite peers `@dxfeed/dxlink-api ^0.6.1` vs workspace 0.8.1 | Works in `dxlink-docs` via pnpm link; verify against React 19 at Phase 0; monitor on upgrades |
| 6 | E2E determinism against a **live** dev WS (market-closed, auth, rate limits, CI egress) | Inject a **mock `DXLinkWebSocketConnector`** via the API's `connectorFactory` for deterministic unit/E2E; run the live-WS Playwright smoke as a **separate, non-blocking** job. Confirm dev-WS auth/token source |
| 7 | Connection lifecycle across tab nav (`/` → `/protocol`) | **Resolved: page-scoped** — page unmount closes the socket (exact current behavior); reconnect on return. Overlay/persist deferred as a future UX option |
| 8 | No CI/CD, deploy, or bundle budget defined yet | Mirror `dxlink-docs` deploy; set a bundle budget + code-splitting (Phase 8) — MUI + DataGrid + CodeMirror + dxcharts-lite + asyncapi is heavy |

---

## 6. Tooling & quality gates
- Scripts: `dev`/`start` (vite), `build` (vite → `build/`), `lint` (ESLint flat), `typecheck` (tsc `--noEmit`), `test` (`vitest run`), `test:e2e` (Playwright). Wire into Turbo (existing `test.dependsOn: ["build"]`).
- **Deterministic tests** via a mock `DXLinkWebSocketConnector` injected through the API's `connectorFactory`; live-WS Playwright is a separate non-blocking smoke job.
- Unit coverage focus: ViewModels (store/commands/coalescing), URL-derivation, zod schemas, formatters, `SortedList`, candle flag processing, session parse, color map, event-fields normalization.
- `private: true` (deploy-only) + added to changeset `ignore`; no npm publish. CI/CD + bundle budget defined in Phase 8.
