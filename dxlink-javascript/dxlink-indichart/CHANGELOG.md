# @dxfeed/dxlink-indichart

## 0.9.0

### Minor Changes

- Add missing `DXLinkIndiChartCalculationResult` series and point types to match the server output. The result now types the `shape`, `backgroundColor`, and `barColor` series in addition to `output` and `spline`, with new `DXLinkIndiChartShapePoint` and `DXLinkIndiChartColorPoint` types and the `DXLinkIndiChartSplineStyle`, `DXLinkIndiChartShapeStyle`, and `DXLinkIndiChartShapeLocation` unions (each with a `(string & {})` fallback so clients can handle future server values while keeping autocomplete). Series arrays are now index-aligned with the candles and may contain `null` padding entries. The spline point's `type` field was corrected to `style` to match the wire format.

### Patch Changes

- @dxfeed/dxlink-core@0.9.0

## 0.8.1

### Patch Changes

- feat(core): add `DXLinkChannelOptions` with `reconnect` flag to control channel behavior on connection drop
  feat(rpc): add `DxLinkRpcCallOptions` with `retry` flag for `requestResponse` and `requestStream`
  feat(rpc): refactor RPC internals — input subscription deferred to OPENED state with ReplaySubject support
  feat(indichart): update indicator parameter types to strict per-type interfaces (DOUBLE, STRING, BOOL, COLOR, SOURCE, SESSION, ENUM)
  feat(indichart): add support for timezone in session input parameter
  chore(rpc): remove redundant code
- Updated dependencies
  - @dxfeed/dxlink-core@0.8.1

## 0.8.0

### Patch Changes

- @dxfeed/dxlink-core@0.8.0

## 0.7.0

### Minor Changes

- Update API of Indichart to latest server version

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.7.0

## 0.6.1

### Patch Changes

- @dxfeed/dxlink-core@0.6.1

## 0.6.0

### Minor Changes

- b8c71bd: Indichart API client was adapted to latest version of the protocol. Now we can receive first candle snapshot before indicators snapshot.

### Patch Changes

- @dxfeed/dxlink-core@0.6.0

## 0.5.1

### Patch Changes

- aa44de4: Indichart: provide `getSubscription` method for latest setted subscription state
  - @dxfeed/dxlink-core@0.5.1

## 0.5.0

### Patch Changes

- @dxfeed/dxlink-core@0.5.0

## 0.4.0

### Minor Changes

- Finalize Indichart API and Improve protocol selection for the WebSocket Client

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.4.0
