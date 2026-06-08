import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'

import type { FeedDraft, FeedView } from '../channels/types'

interface FeedSetupProps {
  value: FeedDraft
  onChange: (value: FeedDraft) => void
}

/** Feed channel setup form (draft / presentational only). */
export const FeedSetup = ({ value, onChange }: FeedSetupProps) => (
  <Stack spacing={2.5} sx={{ pt: 1 }}>
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        View
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value.view}
        onChange={(_event, next: FeedView | null) => {
          if (next !== null) {
            onChange({ ...value, view: next })
          }
        }}
      >
        <ToggleButton value="subscriptions">Subscriptions</ToggleButton>
        <ToggleButton value="chart">Candle chart</ToggleButton>
      </ToggleButtonGroup>
    </Box>
    <TextField
      label="Feed qualification"
      value={value.feed}
      onChange={(e) => onChange({ ...value, feed: e.target.value })}
      size="small"
      fullWidth
      helperText="Optional — leave empty to omit from the request."
    />
    <TextField
      label="Feed space"
      value={value.space}
      onChange={(e) => onChange({ ...value, space: e.target.value })}
      size="small"
      fullWidth
      helperText="Optional — leave empty to omit from the request."
    />
  </Stack>
)
