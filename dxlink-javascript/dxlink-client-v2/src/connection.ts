/**
 * Connection state of a {@link DxLinkClient}.
 * @see {@link DxLinkClient.getState}
 */
export enum DxLinkConnectionState {
  /**
   * Created but not connected to a remote endpoint.
   * {@link DxLinkClient.connect} moves it to {@link DxLinkConnectionState.CONNECTING}.
   */
  NOT_CONNECTED = 'NOT_CONNECTED',
  /**
   * Connecting or reconnecting to the remote endpoint.
   * Not ready to carry RPC calls yet.
   */
  CONNECTING = 'CONNECTING',
  /**
   * Connected to the remote endpoint and ready to open calls.
   */
  CONNECTED = 'CONNECTED',
}

/**
 * Listener for {@link DxLinkConnectionState} changes.
 */
export type DxLinkConnectionStateChangeListener = (
  state: DxLinkConnectionState,
  prev: DxLinkConnectionState
) => void
