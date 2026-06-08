import type {
  DXLinkIndiChartIndicatorParameterMeta,
  DXLinkIndiChartIndicatorState,
} from '@dxfeed/dxlink-api'
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InsightsIcon from '@mui/icons-material/Insights'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

import { ParameterField, initialParameterValue } from './parameter-field'
import type { ParameterValue } from './parameter-field'
import { Placeholder } from '../../shared/components/placeholder'
import { ChannelWidget } from '../channels/channel-widget'
import type { IndiChartConfig } from '../channels/types'

// --- Draft mock of the indicator state the server reports after compilation. ---
const SAMPLE_IN_PARAMS: DXLinkIndiChartIndicatorParameterMeta[] = [
  { name: 'length', type: 'DOUBLE', defaultValue: 14, min: 1, max: 200, step: 1 },
  {
    name: 'source',
    type: 'SOURCE',
    defaultValue: 'close',
    options: ['open', 'high', 'low', 'close'],
  },
  { name: 'maType', type: 'ENUM', defaultValue: 'SMA', options: ['SMA', 'EMA', 'WMA'] },
  { name: 'lineColor', type: 'COLOR', defaultValue: { value: '#3b6fed' } },
  { name: 'showSignals', type: 'BOOL', defaultValue: true },
]

const SAMPLE_OUT_PARAMS: DXLinkIndiChartIndicatorParameterMeta[] = [
  { name: 'out', type: 'DOUBLE', defaultValue: 0 },
]

const MOCK_ERROR_STATE: DXLinkIndiChartIndicatorState = {
  enabled: false,
  scriptError: {
    type: 'CompilationError',
    message: "Unresolved reference: 'smaa'. Did you mean 'sma'?",
    scriptName: 'indicator',
    startLine: 3,
    startColumn: 12,
    endLine: 3,
    endColumn: 16,
    scriptStack: [],
  },
}

interface IndicatorEntry {
  name: string
  code: string
  state: DXLinkIndiChartIndicatorState
}

// The second indicator (if any) is mocked as a compile error to exercise the
// error UI; the rest compile with a representative set of input parameters.
const buildEntries = (indicators: string[]): IndicatorEntry[] =>
  indicators.map((code, index) => ({
    name: String(index + 1),
    code,
    state:
      index === 1
        ? MOCK_ERROR_STATE
        : { enabled: true, inParameters: SAMPLE_IN_PARAMS, outParameters: SAMPLE_OUT_PARAMS },
  }))

type ParamValues = Record<string, Record<string, ParameterValue>>

const buildInitialValues = (entries: IndicatorEntry[]): ParamValues => {
  const values: ParamValues = {}
  for (const entry of entries) {
    if (entry.state.enabled) {
      const params: Record<string, ParameterValue> = {}
      for (const meta of entry.state.inParameters) {
        params[meta.name] = initialParameterValue(meta)
      }
      values[entry.name] = params
    }
  }
  return values
}

const StatusChip = ({ enabled }: { enabled: boolean }) =>
  enabled ? (
    <Chip
      size="small"
      color="success"
      variant="outlined"
      icon={<CheckCircleIcon />}
      label="compiled"
    />
  ) : (
    <Chip size="small" color="error" variant="outlined" icon={<ErrorIcon />} label="error" />
  )

const IndicatorPanel = ({
  entry,
  values,
  expanded,
  onToggle,
  onParam,
}: {
  entry: IndicatorEntry
  values: Record<string, ParameterValue> | undefined
  expanded: boolean
  onToggle: (expanded: boolean) => void
  onParam: (name: string, value: ParameterValue) => void
}) => {
  const { name, code, state } = entry
  const summary = state.enabled
    ? `${state.inParameters.length} inputs · ${state.outParameters.length} outputs`
    : 'compilation error'

  return (
    <Accordion
      variant="outlined"
      disableGutters
      expanded={expanded}
      onChange={(_event, isExpanded) => onToggle(isExpanded)}
      sx={{ '&::before': { display: 'none' } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            width: '100%',
            pr: 1,
            minWidth: 0,
          }}
        >
          <Typography sx={{ fontWeight: 600 }}>Indicator {name}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexGrow: 1 }}>
            {summary}
          </Typography>
          <StatusChip enabled={state.enabled} />
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">Source</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                overflow: 'auto',
              }}
            >
              {code}
            </Box>
          </AccordionDetails>
        </Accordion>

        {state.enabled ? (
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {state.inParameters.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Inputs
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    mt: 1.25,
                    // Auto-fit columns: as many ~240px tracks as fit, collapsing
                    // to one input per line on narrow widths.
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  }}
                >
                  {state.inParameters.map((meta) => (
                    <ParameterField
                      key={meta.name}
                      meta={meta}
                      value={values?.[meta.name]}
                      onChange={(v) => onParam(meta.name, v)}
                    />
                  ))}
                </Box>
              </Box>
            )}
            {state.outParameters.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Outputs
                </Typography>
                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.25 }}>
                  {state.outParameters.map((meta) => (
                    <Chip
                      key={meta.name}
                      size="small"
                      variant="outlined"
                      label={`${meta.name} · ${meta.type}`}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        ) : (
          <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
            <AlertTitle>{state.scriptError?.type ?? 'Compilation error'}</AlertTitle>
            {state.scriptError ? (
              <>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 13,
                  }}
                >
                  {state.scriptError.message}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Line {state.scriptError.startLine}:{state.scriptError.startColumn}
                </Typography>
              </>
            ) : (
              state.internalErrorMessage
            )}
          </Alert>
        )}
      </AccordionDetails>
    </Accordion>
  )
}

interface IndiChartChannelProps {
  title: string
  config: IndiChartConfig
}

/** IndiChart channel view (draft / presentational only). */
export const IndiChartChannel = ({ title, config }: IndiChartChannelProps) => {
  const entries = buildEntries(config.indicators)

  const [symbol, setSymbol] = useState('AAPL{=d}')
  const [fromTime, setFromTime] = useState('0')
  const [values, setValues] = useState<ParamValues>(() => buildInitialValues(entries))
  // Indicators are collapsed by default; this set holds the expanded ones.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const errorCount = entries.filter((entry) => !entry.state.enabled).length

  const setParam = (indicator: string, name: string, value: ParameterValue) =>
    setValues((prev) => ({ ...prev, [indicator]: { ...(prev[indicator] ?? {}), [name]: value } }))

  const setIndicatorExpanded = (name: string, isExpanded: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (isExpanded) {
        next.add(name)
      } else {
        next.delete(name)
      }
      return next
    })

  const expandAll = () => setExpanded(new Set(entries.map((entry) => entry.name)))
  const collapseAll = () => setExpanded(new Set())

  return (
    <ChannelWidget
      icon={<InsightsIcon />}
      title={title}
      subtitle={`IndiChart · ${entries.length} indicator${entries.length === 1 ? '' : 's'}`}
      status={
        errorCount > 0 ? (
          <Chip
            size="small"
            color="error"
            variant="outlined"
            label={`${errorCount} error${errorCount === 1 ? '' : 's'}`}
          />
        ) : (
          <Chip size="small" color="success" variant="outlined" label="running" />
        )
      }
    >
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Subscription
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              alignItems: 'center',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr) auto' },
            }}
          >
            <TextField
              label="Symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              size="small"
            />
            <TextField
              label="From time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              size="small"
            />
            <Button variant="contained" startIcon={<PlayArrowIcon />}>
              Apply
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Applies the symbol, from time and all indicator parameters together.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
          >
            <Typography variant="subtitle2">Indicators ({entries.length})</Typography>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                color="inherit"
                onClick={expandAll}
                disabled={expanded.size === entries.length}
              >
                Expand all
              </Button>
              <Button
                size="small"
                color="inherit"
                onClick={collapseAll}
                disabled={expanded.size === 0}
              >
                Collapse all
              </Button>
            </Stack>
          </Stack>
          <Stack spacing={1}>
            {entries.map((entry) => (
              <IndicatorPanel
                key={entry.name}
                entry={entry}
                values={values[entry.name]}
                expanded={expanded.has(entry.name)}
                onToggle={(isExpanded) => setIndicatorExpanded(entry.name, isExpanded)}
                onParam={(name, value) => setParam(entry.name, name, value)}
              />
            ))}
          </Stack>
        </Box>

        <Placeholder
          icon={<ShowChartIcon fontSize="large" />}
          label="Candles + indicators render here (dxcharts-lite)"
          height={300}
        />
      </Stack>
    </ChannelWidget>
  )
}
