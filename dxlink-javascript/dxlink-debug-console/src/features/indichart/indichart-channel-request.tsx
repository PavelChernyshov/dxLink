import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

import { MAX_INDICATORS } from '../channels/types'
import type { IndiChartRequest } from '../channels/types'

const SAMPLES = [
  {
    id: 'sma',
    label: 'Simple Moving Average',
    code: '// Simple Moving Average\ninput length: number = 14\nplot SMA = sma(close, length)',
  },
  {
    id: 'ema',
    label: 'Exponential Moving Average',
    code: '// Exponential Moving Average\ninput length: number = 21\nplot EMA = ema(close, length)',
  },
  {
    id: 'rsi',
    label: 'Relative Strength Index',
    code: '// Relative Strength Index\ninput length: number = 14\nplot RSI = rsi(close, length)',
  },
]

const sampleCode = (id: string): string => SAMPLES.find((s) => s.id === id)?.code ?? ''

interface IndiChartChannelRequestProps {
  value: IndiChartRequest
  onChange: (value: IndiChartRequest) => void
}

/** IndiChart channel request form (draft / presentational only): 1..N indicator scripts. */
export const IndiChartChannelRequest = ({ value, onChange }: IndiChartChannelRequestProps) => {
  const setAt = (index: number, code: string) =>
    onChange({ indicators: value.indicators.map((c, i) => (i === index ? code : c)) })

  const add = () => onChange({ indicators: [...value.indicators, sampleCode('sma')] })

  const remove = (index: number) =>
    onChange({ indicators: value.indicators.filter((_c, i) => i !== index) })

  const full = value.indicators.length >= MAX_INDICATORS

  return (
    <Stack spacing={2} sx={{ pt: 1 }}>
      {value.indicators.map((code, index) => (
        <Card key={index} variant="outlined">
          <CardContent>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
            >
              <Typography variant="subtitle2">Indicator {index + 1}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                  select
                  size="small"
                  value=""
                  sx={{ minWidth: 200 }}
                  onChange={(e) => setAt(index, sampleCode(e.target.value))}
                >
                  <MenuItem value="" disabled>
                    Insert example…
                  </MenuItem>
                  {SAMPLES.map((sample) => (
                    <MenuItem key={sample.id} value={sample.id}>
                      {sample.label}
                    </MenuItem>
                  ))}
                </TextField>
                {value.indicators.length > 1 && (
                  <Tooltip title="Remove indicator">
                    <IconButton aria-label="Remove indicator" onClick={() => remove(index)}>
                      <CloseIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </Stack>
            <TextField
              multiline
              minRows={4}
              fullWidth
              value={code}
              onChange={(e) => setAt(index, e.target.value)}
              sx={{
                '& textarea': {
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 13,
                },
              }}
            />
          </CardContent>
        </Card>
      ))}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button startIcon={<AddIcon />} onClick={add} disabled={full}>
          Add indicator
        </Button>
        <Typography variant="caption" color="text.secondary">
          {value.indicators.length}/{MAX_INDICATORS}
        </Typography>
      </Stack>
    </Stack>
  )
}
