# @dxfeed/dxlink-api

## 0.9.0

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-indichart@0.9.0
  - @dxfeed/dxlink-core@0.9.0
  - @dxfeed/dxlink-dom@0.9.0
  - @dxfeed/dxlink-feed@0.9.0
  - @dxfeed/dxlink-rpc@0.9.0
  - @dxfeed/dxlink-websocket-client@0.9.0

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
  - @dxfeed/dxlink-websocket-client@0.8.1
  - @dxfeed/dxlink-rpc@0.8.1
  - @dxfeed/dxlink-indichart@0.8.1
  - @dxfeed/dxlink-feed@0.8.1
  - @dxfeed/dxlink-dom@0.8.1

## 0.8.0

### Minor Changes

- 185957f: feat(rpc): add rpc service support

### Patch Changes

- Updated dependencies [185957f]
  - @dxfeed/dxlink-rpc@0.8.0
  - @dxfeed/dxlink-core@0.8.0
  - @dxfeed/dxlink-dom@0.8.0
  - @dxfeed/dxlink-feed@0.8.0
  - @dxfeed/dxlink-indichart@0.8.0
  - @dxfeed/dxlink-websocket-client@0.8.0

## 0.7.0

### Minor Changes

- Update API of Indichart to latest server version
- Add ability to override scheduler for the client

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @dxfeed/dxlink-feed@0.7.0
  - @dxfeed/dxlink-indichart@0.7.0
  - @dxfeed/dxlink-core@0.7.0
  - @dxfeed/dxlink-websocket-client@0.7.0
  - @dxfeed/dxlink-dom@0.7.0

## 0.6.1

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-feed@0.6.1
  - @dxfeed/dxlink-dom@0.6.1
  - @dxfeed/dxlink-core@0.6.1
  - @dxfeed/dxlink-indichart@0.6.1
  - @dxfeed/dxlink-websocket-client@0.6.1

## 0.6.0

### Patch Changes

- Updated dependencies [b8c71bd]
  - @dxfeed/dxlink-indichart@0.6.0
  - @dxfeed/dxlink-core@0.6.0
  - @dxfeed/dxlink-dom@0.6.0
  - @dxfeed/dxlink-feed@0.6.0
  - @dxfeed/dxlink-websocket-client@0.6.0

## 0.5.1

### Patch Changes

- aa44de4: Indichart: provide `getSubscription` method for latest setted subscription state
- Updated dependencies [aa44de4]
  - @dxfeed/dxlink-indichart@0.5.1
  - @dxfeed/dxlink-core@0.5.1
  - @dxfeed/dxlink-dom@0.5.1
  - @dxfeed/dxlink-feed@0.5.1
  - @dxfeed/dxlink-websocket-client@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-feed@0.5.0
  - @dxfeed/dxlink-core@0.5.0
  - @dxfeed/dxlink-dom@0.5.0
  - @dxfeed/dxlink-indichart@0.5.0
  - @dxfeed/dxlink-websocket-client@0.5.0

## 0.4.0

### Minor Changes

- Finalize Indichart API and Improve protocol selection for the WebSocket Client

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.4.0
  - @dxfeed/dxlink-dom@0.4.0
  - @dxfeed/dxlink-feed@0.4.0
  - @dxfeed/dxlink-indichart@0.4.0
  - @dxfeed/dxlink-websocket-client@0.4.0

## 0.3.0

### Minor Changes

- Updated dependencies
  - @dxfeed/dxlink-websocket-client@0.3.0
  - @dxfeed/dxlink-feed@0.3.0
  - @dxfeed/dxlink-dom@0.3.0
  - @dxfeed/dxlink-core@0.3.0

## 0.2.0

### Minor Changes

- Depth Of Market API support

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-core@0.2.0
  - @dxfeed/dxlink-feed@0.2.0
  - @dxfeed/dxlink-websocket-client@0.2.0

## 0.1.3

### Patch Changes

- Update descriptions
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @dxfeed/dxlink-websocket-client@0.1.3
  - @dxfeed/dxlink-core@0.1.3
  - @dxfeed/dxlink-feed@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @dxfeed/dxlink-core@0.1.2
  - @dxfeed/dxlink-feed@0.1.2
  - @dxfeed/dxlink-websocket-client@0.1.2

## 0.1.1

### Patch Changes

- Add basic usage in readme
- Updated dependencies
  - @dxfeed/dxlink-core@0.1.1
  - @dxfeed/dxlink-feed@0.1.1
  - @dxfeed/dxlink-websocket-client@0.1.1

## 0.1.0

### Minor Changes

- Upgrade dxLink API to SDK level
  - Rework for better performance and stability
  - DXLinkFeed: add batching & splitting of the subscription requests

### Patch Changes

- Updated dependencies
  - @dxfeed/dxlink-websocket-client@0.1.0
  - @dxfeed/dxlink-core@0.1.0
  - @dxfeed/dxlink-feed@0.1.0
