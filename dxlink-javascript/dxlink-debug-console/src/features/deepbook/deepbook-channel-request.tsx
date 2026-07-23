import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import type { DeepBookRequest } from '../channels/types'

interface DeepBookChannelRequestProps {
  value: DeepBookRequest
  onChange: (value: DeepBookRequest) => void
}

/** DeepBook channel request form (draft / presentational only). */
export const DeepBookChannelRequest = ({ value, onChange }: DeepBookChannelRequestProps) => (
  <Stack spacing={2.5} sx={{ pt: 1 }}>
    <TextField
      label="Symbol"
      required
      value={value.symbol}
      onChange={(e) => onChange({ ...value, symbol: e.target.value })}
      size="small"
      fullWidth
      helperText="Instrument symbol, e.g. AAPL."
    />
    <TextField
      label="Source"
      value={value.source}
      onChange={(e) => onChange({ ...value, source: e.target.value })}
      size="small"
      fullWidth
      helperText="Order source, e.g. NTV. Empty = server default."
    />
    <TextField
      label="Granularity (heatmap)"
      value={value.granularity}
      onChange={(e) => onChange({ ...value, granularity: e.target.value })}
      size="small"
      fullWidth
      helperText="ORCS aggregation period of the heatmap, e.g. 1s, 10m, 1h."
    />
    <TextField
      label="Candle period (overlay)"
      value={value.candlePeriod}
      onChange={(e) => onChange({ ...value, candlePeriod: e.target.value })}
      size="small"
      fullWidth
      helperText="Candle period of the reference chart, e.g. 1m, 5m (independent of the heatmap granularity)."
    />
    <TextField
      label="History lookback, minutes"
      value={value.lookbackMinutes}
      onChange={(e) => onChange({ ...value, lookbackMinutes: e.target.value })}
      type="number"
      size="small"
      fullWidth
      helperText="History is replayed from now − this many minutes, then the stream goes live."
    />
  </Stack>
)
