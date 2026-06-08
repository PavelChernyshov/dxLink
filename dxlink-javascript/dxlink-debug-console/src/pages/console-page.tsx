import { DXLinkAuthState, DXLinkConnectionState } from '@dxfeed/dxlink-api'
import Stack from '@mui/material/Stack'

import { AuthPanel } from '../features/auth/auth-panel'
import { ChannelsArea } from '../features/channels/channels-area'
import { ConnectionProvider } from '../features/connection/connection-context'
import { ConnectionPanel } from '../features/connection/connection-panel'
import { ConnectionViewModel } from '../features/connection/connection-view-model'
import { useOwnedViewModel, useVM } from '../shared/view-model'

/**
 * Console page. Owns the page-scoped {@link ConnectionViewModel} (disposed on
 * unmount → closes the socket) and provides it to the subtree. Tri-state gating:
 *  - not connected → connection panel only,
 *  - connected + auth UNAUTHORIZED/AUTHORIZING → auth panel,
 *  - connected + auth AUTHORIZED → channels area.
 * `auth === undefined` (not yet known) shows neither, avoiding a token-form flash
 * on no-auth servers.
 */
export const ConsolePage = () => {
  const vm = useOwnedViewModel(() => new ConnectionViewModel())
  const connection = useVM(vm, (s) => s.connection)
  const auth = useVM(vm, (s) => s.auth)

  const connected = connection === DXLinkConnectionState.CONNECTED
  const needsAuth =
    connected && (auth === DXLinkAuthState.UNAUTHORIZED || auth === DXLinkAuthState.AUTHORIZING)
  const authorized = connected && auth === DXLinkAuthState.AUTHORIZED

  return (
    <ConnectionProvider value={vm}>
      <Stack spacing={3}>
        <ConnectionPanel />
        {needsAuth && <AuthPanel />}
        {authorized && <ChannelsArea />}
      </Stack>
    </ConnectionProvider>
  )
}
