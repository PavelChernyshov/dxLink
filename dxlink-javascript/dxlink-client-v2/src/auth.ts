/**
 * Authentication state on the remote endpoint.
 * @see {@link DxLinkClient.getAuthState}
 */
export enum DxLinkAuthState {
  /**
   * Not authorized on the remote endpoint.
   * Call {@link DxLinkClient.setAuthToken} to authorize.
   */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /**
   * Authorization is in progress but not yet complete.
   */
  AUTHORIZING = 'AUTHORIZING',
  /**
   * Authorized on the remote endpoint and allowed to open calls.
   */
  AUTHORIZED = 'AUTHORIZED',
}

/**
 * Listener for {@link DxLinkAuthState} changes.
 */
export type DxLinkAuthStateChangeListener = (state: DxLinkAuthState) => void
