/**
 * Default dxLink WebSocket endpoint used in development — the shared dev relay,
 * so the console connects to a real server out of the box (the page is served
 * from localhost in dev, which is not itself a dxLink endpoint).
 */
export const DEV_WS_URL = 'wss://dxlink-md-ws-dev.dxkube.com'

/** The subset of `Location` the URL derivation actually reads. */
export type LocationLike = Pick<Location, 'protocol' | 'host' | 'pathname'>

/**
 * Derive a dxLink WebSocket URL from a browser location, mirroring the legacy
 * console behaviour:
 *  - strip a trailing `/debug` path segment (the console is hosted under it),
 *  - pick `wss://` when the page is served over https, `ws://` otherwise.
 */
export const deriveWsUrlFromLocation = (location: LocationLike): string => {
  const debugIndex = location.pathname.indexOf('/debug')
  const pathname = debugIndex !== -1 ? location.pathname.slice(0, debugIndex) : location.pathname
  const secure = location.protocol.startsWith('https')

  return `ws${secure ? 's' : ''}://${location.host}${pathname}`
}

/**
 * The URL the connection form starts with.
 *  - production: derived from the current page location,
 *  - development: the local relay (`DEV_WS_URL`).
 *
 * `location` and `isProduction` are injectable to keep this pure and testable;
 * callers pass `import.meta.env.PROD` for the latter.
 */
export const getDefaultWsUrl = (location: LocationLike, isProduction: boolean): string =>
  isProduction ? deriveWsUrlFromLocation(location) : DEV_WS_URL
