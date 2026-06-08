import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import type { ChipProps } from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

export type ConnectionUiState = 'disconnected' | 'connecting' | 'connected'

interface ConnectionPanelProps {
  state: ConnectionUiState
  onConnect: () => void
  onDisconnect: () => void
  /** Slot for the error-center button, shown left of the connect button. */
  errorSlot?: React.ReactNode
}

const STATUS: Record<ConnectionUiState, { label: string; color: ChipProps['color'] }> = {
  disconnected: { label: 'Not connected', color: 'default' },
  connecting: { label: 'Connecting…', color: 'warning' },
  connected: { label: 'Connected', color: 'success' },
}

const CONNECT_LABEL: Record<ConnectionUiState, string> = {
  disconnected: 'Connect',
  connecting: 'Connecting…',
  connected: 'Reconnect',
}

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <Typography variant="caption" component="div" color="text.secondary" sx={{ lineHeight: 1.4 }}>
    <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
      {label}
    </Box>
    : {value}
  </Typography>
)

/**
 * Connection panel (draft / presentational only). Holds local field state so the
 * form feels real; no dxlink-api wiring yet. Uniform 16px spacing across header,
 * fields and footer.
 */
export const ConnectionPanel = ({
  state,
  onConnect,
  onDisconnect,
  errorSlot,
}: ConnectionPanelProps) => {
  const connected = state === 'connected'
  const frozen = connected || state === 'connecting'

  const [url, setUrl] = useState('wss://demo.dxfeed.com/dxlink-ws')
  const [keepaliveInterval, setKeepaliveInterval] = useState('30')
  const [keepaliveTimeout, setKeepaliveTimeout] = useState('60')
  const [acceptKeepalive, setAcceptKeepalive] = useState('60')

  const numeric = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.replace(/[^0-9]/g, ''))

  // Mock connection details (replaced by getConnectionDetails() when wired).
  const clientVersion = '1.0.0'
  const serverVersion = connected ? '1.2.3' : '—'
  const serverKeepalive = connected ? '60' : ''

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Typography sx={{ fontWeight: 700 }}>Connection</Typography>
            <Chip
              size="small"
              color={STATUS[state].color}
              variant={connected ? 'filled' : 'outlined'}
              label={STATUS[state].label}
            />
          </Stack>

          <TextField
            label="WebSocket URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={frozen}
            size="small"
            fullWidth
          />
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <TextField
              label="Keepalive interval, s"
              value={keepaliveInterval}
              onChange={numeric(setKeepaliveInterval)}
              disabled={frozen}
              size="small"
            />
            <TextField
              label="Keepalive timeout, s"
              value={keepaliveTimeout}
              onChange={numeric(setKeepaliveTimeout)}
              disabled={frozen}
              size="small"
            />
            <TextField
              label="Accept keepalive, s"
              value={acceptKeepalive}
              onChange={numeric(setAcceptKeepalive)}
              disabled={frozen}
              size="small"
            />
            <TextField label="Server keepalive, s" value={serverKeepalive} size="small" disabled />
          </Box>
        </Stack>
      </CardContent>

      <Divider />

      <Box sx={{ p: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}
        >
          <Box sx={{ flexGrow: 1, minWidth: 200 }}>
            {connected && (
              <>
                <InfoLine label="Client version" value={clientVersion} />
                <InfoLine label="Server version" value={serverVersion} />
              </>
            )}
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {errorSlot}
            <Button variant="contained" onClick={onConnect} disabled={state === 'connecting'}>
              {CONNECT_LABEL[state]}
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              onClick={onDisconnect}
              disabled={state === 'disconnected'}
            >
              Disconnect
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Card>
  )
}
