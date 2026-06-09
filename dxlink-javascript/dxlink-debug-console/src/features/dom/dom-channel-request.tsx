import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import type { DomRequest } from '../channels/types'

interface DomChannelRequestProps {
  value: DomRequest
  onChange: (value: DomRequest) => void
}

/** DOM channel request form (draft / presentational only). */
export const DomChannelRequest = ({ value, onChange }: DomChannelRequestProps) => (
  <Stack spacing={2.5} sx={{ pt: 1 }}>
    <TextField
      label="Symbol"
      required
      value={value.symbol}
      onChange={(e) => onChange({ ...value, symbol: e.target.value })}
      size="small"
      fullWidth
      helperText="Subscription symbol for Depth of Market."
    />
    <TextField
      label="Sources"
      value={value.source}
      onChange={(e) => onChange({ ...value, source: e.target.value })}
      size="small"
      fullWidth
      helperText="Order sources, comma/space separated (e.g. NTV, DEX). Empty = server default."
    />
  </Stack>
)
