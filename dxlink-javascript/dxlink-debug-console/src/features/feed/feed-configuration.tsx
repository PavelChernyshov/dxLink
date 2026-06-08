import AddIcon from '@mui/icons-material/Add'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Configuration model — requested (FeedAcceptConfig) vs server-applied (FeedConfig)
// ---------------------------------------------------------------------------
type DataFormat = 'FULL' | 'COMPACT'

interface EventFieldRow {
  type: string
  fields: string
}

const INITIAL_FIELD_ROWS: EventFieldRow[] = [
  { type: 'Quote', fields: 'bidPrice, askPrice, bidSize, askSize' },
]

interface AppliedConfig {
  // NaN until the server reports an aggregation period.
  aggregationPeriod: number
  dataFormat: DataFormat
  eventFields: Record<string, string[]>
}

const parseFields = (fields: string) =>
  fields
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)

/** Simulate the server resolving a requested config into the applied one. */
const applyConfig = (
  aggInput: string,
  formatInput: '' | DataFormat,
  rows: EventFieldRow[]
): AppliedConfig => {
  // Server keeps its own default when the period is left unset; otherwise it may
  // clamp very small non-zero periods up to a minimum it supports (0 = no aggregation).
  let aggregationPeriod = NaN
  if (aggInput.trim() !== '') {
    const requested = Number(aggInput)
    aggregationPeriod =
      Number.isFinite(requested) && requested > 0 && requested < 0.1 ? 0.1 : requested
  }

  const eventFields: Record<string, string[]> = {}
  for (const row of rows) {
    const type = row.type.trim()
    if (type === '') continue
    // The server always prepends the mandatory eventSymbol field.
    eventFields[type] = Array.from(new Set(['eventSymbol', ...parseFields(row.fields)]))
  }

  return {
    aggregationPeriod,
    dataFormat: formatInput === '' ? 'FULL' : formatInput,
    eventFields,
  }
}

const EventFieldsEditor = ({
  rows,
  onChange,
}: {
  rows: EventFieldRow[]
  onChange: (rows: EventFieldRow[]) => void
}) => {
  const update = (index: number, patch: Partial<EventFieldRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const remove = (index: number) => onChange(rows.filter((_row, i) => i !== index))
  const add = () => onChange([...rows, { type: '', fields: '' }])

  return (
    <Stack spacing={1}>
      {rows.map((row, index) => (
        <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <TextField
            label="Event type"
            value={row.type}
            onChange={(e) => update(index, { type: e.target.value })}
            size="small"
            sx={{ width: 140, flexShrink: 0 }}
          />
          <TextField
            label="Fields (comma-separated)"
            value={row.fields}
            onChange={(e) => update(index, { fields: e.target.value })}
            size="small"
            fullWidth
          />
          <Tooltip title="Remove">
            <IconButton size="small" onClick={() => remove(index)}>
              <DeleteSweepIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ))}
      <Box>
        <Button size="small" color="inherit" startIcon={<AddIcon />} onClick={add}>
          Add event type
        </Button>
      </Box>
    </Stack>
  )
}

const DefRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <Stack
    direction="row"
    spacing={1}
    sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
  >
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="caption" sx={{ fontWeight: 600, textAlign: 'right' }}>
      {value}
    </Typography>
  </Stack>
)

/** Requested (FeedAcceptConfig) vs server-applied (FeedConfig) configuration. */
export const ConfigurationSection = () => {
  const [aggPeriod, setAggPeriod] = useState('')
  const [dataFormat, setDataFormat] = useState<'' | DataFormat>('')
  const [fieldRows, setFieldRows] = useState<EventFieldRow[]>(INITIAL_FIELD_ROWS)
  const [applied, setApplied] = useState<AppliedConfig | null>(null)

  const apply = () => setApplied(applyConfig(aggPeriod, dataFormat, fieldRows))

  return (
    <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography sx={{ fontWeight: 600 }}>Configuration</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box
          sx={{
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          }}
        >
          {/* Requested — FeedAcceptConfig */}
          <Stack spacing={2}>
            <Typography variant="subtitle2">Requested</Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
              }}
            >
              <TextField
                label="Aggregation period, s"
                value={aggPeriod}
                onChange={(e) => setAggPeriod(e.target.value)}
                type="number"
                size="small"
                helperText="0 = none · empty = server default"
              />
              <TextField
                label="Data format"
                select
                value={dataFormat}
                onChange={(e) => setDataFormat(e.target.value as '' | DataFormat)}
                size="small"
                helperText="empty = server default"
              >
                <MenuItem value="">
                  <em>Server default</em>
                </MenuItem>
                <MenuItem value="FULL">FULL</MenuItem>
                <MenuItem value="COMPACT">COMPACT</MenuItem>
              </TextField>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Accept event fields
              </Typography>
              <Box sx={{ mt: 1 }}>
                <EventFieldsEditor rows={fieldRows} onChange={setFieldRows} />
              </Box>
            </Box>
            <Box>
              <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={apply}>
                Apply configuration
              </Button>
            </Box>
          </Stack>

          {/* Applied — FeedConfig reported by the server */}
          <Stack spacing={2}>
            <Typography variant="subtitle2">Applied by server</Typography>
            {applied === null ? (
              <Typography variant="body2" color="text.secondary">
                No FEED_CONFIG received yet. Apply a configuration to see what the server resolves.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                <Stack spacing={0.75}>
                  <DefRow
                    label="Aggregation period"
                    value={
                      Number.isNaN(applied.aggregationPeriod)
                        ? 'default (server-defined)'
                        : `${applied.aggregationPeriod} s`
                    }
                  />
                  <DefRow label="Data format" value={applied.dataFormat} />
                </Stack>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Event fields
                  </Typography>
                  <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                    {Object.entries(applied.eventFields).map(([eventType, fields]) => (
                      <Box key={eventType}>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {eventType}
                        </Typography>
                        <Stack
                          direction="row"
                          spacing={0.5}
                          useFlexGap
                          sx={{ flexWrap: 'wrap', mt: 0.5 }}
                        >
                          {fields.map((field) => (
                            <Chip key={field} size="small" label={field} variant="outlined" />
                          ))}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary">
              What the server actually applied — may differ from the request.
            </Typography>
          </Stack>
        </Box>
      </AccordionDetails>
    </Accordion>
  )
}
