# @dxfeed/dxlink-core

## 0.9.0

## 0.8.1

### Patch Changes

- feat(core): add `DXLinkChannelOptions` with `reconnect` flag to control channel behavior on connection drop
  feat(rpc): add `DxLinkRpcCallOptions` with `retry` flag for `requestResponse` and `requestStream`
  feat(rpc): refactor RPC internals — input subscription deferred to OPENED state with ReplaySubject support
  feat(indichart): update indicator parameter types to strict per-type interfaces (DOUBLE, STRING, BOOL, COLOR, SOURCE, SESSION, ENUM)
  feat(indichart): add support for timezone in session input parameter
  chore(rpc): remove redundant code

## 0.8.0

## 0.7.0

### Minor Changes

- Add ability to override scheduler for the client

## 0.6.1

## 0.6.0

## 0.5.1

## 0.5.0

## 0.4.0

### Minor Changes

- Finalize Indichart API and Improve protocol selection for the WebSocket Client

## 0.3.0

## 0.2.0

### Minor Changes

- Depth Of Market API support

## 0.1.3

### Patch Changes

- Update descriptions

## 0.1.2

### Patch Changes

- Bugfix: scheduler should clear `timeoutId` after execute
- Bugfix: typo in listeners

## 0.1.1

### Patch Changes

- Add basic usage in readme

## 0.1.0

### Minor Changes

- Upgrade dxLink API to SDK level
  - Rework for better performance and stability
  - DXLinkFeed: add batching & splitting of the subscription requests
