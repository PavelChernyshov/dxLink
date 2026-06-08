import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import type { DomDraft } from '../channels/types'

interface DomSetupProps {
  value: DomDraft
  onChange: (value: DomDraft) => void
}

/** DOM channel setup form (draft / presentational only). */
export const DomSetup = ({ value, onChange }: DomSetupProps) => (
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
      label="Source"
      value={value.source}
      onChange={(e) => onChange({ ...value, source: e.target.value })}
      size="small"
      fullWidth
      helperText="Order source for Depth of Market (e.g. NTV, DEX)."
    />
  </Stack>
)
