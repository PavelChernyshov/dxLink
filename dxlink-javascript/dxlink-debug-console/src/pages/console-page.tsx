import Stack from '@mui/material/Stack'
import { useState } from 'react'

import { AuthPanel } from '../features/auth/auth-panel'
import { ChannelsArea } from '../features/channels/channels-area'
import { ConnectionPanel } from '../features/connection/connection-panel'
import type { ConnectionUiState } from '../features/connection/connection-panel'
import { ErrorCenter } from '../features/errors/error-center'
import type { DraftError } from '../features/errors/error-center'

// Draft-only sample data so the error center is populated for review.
const SAMPLE_ERRORS: DraftError[] = [
  { type: 'TIMEOUT', message: 'Keepalive timeout exceeded (60s).', time: '15:39:12' },
  { type: 'BAD_ACTION', message: 'Unexpected server message for channel 3.', time: '15:40:55' },
]

/**
 * Console page (draft / presentational only). Composes the connection, auth and
 * channels feature views with local UI state — NO dxlink-api logic. In Phase 1+
 * this is replaced by a page-scoped ConnectionViewModel + VMProvider.
 */
export const ConsolePage = () => {
  const [state, setState] = useState<ConnectionUiState>('connected')
  const [authorized, setAuthorized] = useState(true)

  return (
    <Stack spacing={3}>
      <ConnectionPanel
        state={state}
        onConnect={() => setState('connected')}
        onDisconnect={() => {
          setState('disconnected')
          setAuthorized(false)
        }}
        errorSlot={<ErrorCenter errors={SAMPLE_ERRORS} />}
      />

      {state === 'connected' && !authorized && (
        <AuthPanel onAuthorize={() => setAuthorized(true)} />
      )}

      {state === 'connected' && authorized && <ChannelsArea />}
    </Stack>
  )
}
