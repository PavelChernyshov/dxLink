import AddIcon from '@mui/icons-material/Add'
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useState } from 'react'

import { Placeholder } from '../../shared/components/placeholder'
import { ChannelWidget } from '../channels/channel-widget'
import type { FeedConfig } from '../channels/types'

const QUOTE_COLUMNS: GridColDef[] = [
  { field: 'eventSymbol', headerName: 'Symbol', width: 110 },
  { field: 'bidPrice', headerName: 'Bid', width: 100, type: 'number' },
  { field: 'askPrice', headerName: 'Ask', width: 100, type: 'number' },
  { field: 'bidSize', headerName: 'Bid size', width: 100, type: 'number' },
  { field: 'askSize', headerName: 'Ask size', width: 100, type: 'number' },
]

const QUOTE_ROWS = [
  { id: 'AAPL', eventSymbol: 'AAPL', bidPrice: 189.32, askPrice: 189.35, bidSize: 12, askSize: 8 },
  { id: 'MSFT', eventSymbol: 'MSFT', bidPrice: 421.1, askPrice: 421.18, bidSize: 4, askSize: 6 },
  { id: 'TSLA', eventSymbol: 'TSLA', bidPrice: 178.04, askPrice: 178.09, bidSize: 22, askSize: 15 },
]

const TRADE_COLUMNS: GridColDef[] = [
  { field: 'eventSymbol', headerName: 'Symbol', width: 110 },
  { field: 'price', headerName: 'Price', width: 110, type: 'number' },
  { field: 'size', headerName: 'Size', width: 100, type: 'number' },
  { field: 'dayVolume', headerName: 'Day volume', width: 140, type: 'number' },
  { field: 'time', headerName: 'Time', width: 110 },
]

const TRADE_ROWS = [
  {
    id: 'AAPL',
    eventSymbol: 'AAPL',
    price: 189.34,
    size: 100,
    dayVolume: 41203345,
    time: '15:42:01',
  },
  {
    id: 'MSFT',
    eventSymbol: 'MSFT',
    price: 421.12,
    size: 50,
    dayVolume: 9123440,
    time: '15:42:01',
  },
]

const SUBSCRIPTIONS = ['Quote:AAPL', 'Quote:MSFT', 'Quote:TSLA', 'Trade:AAPL', 'Trade:MSFT']
const EVENT_TYPES = ['Quote', 'Trade', 'Candle', 'Summary', 'Profile', 'Greeks']
const EVENT_FIELDS = ['eventType', 'eventSymbol', 'bidPrice', 'askPrice', 'bidSize', 'askSize']

interface FeedChannelProps {
  title: string
  config: FeedConfig
  onClose: () => void
}

const ConfigChips = ({ config }: { config: FeedConfig }) =>
  config.feed || config.space ? (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {config.feed && <Chip size="small" variant="outlined" label={`feed: ${config.feed}`} />}
      {config.space && <Chip size="small" variant="outlined" label={`space: ${config.space}`} />}
    </Stack>
  ) : null

/** Feed channel view (draft / presentational only): subscriptions table or candle chart. */
export const FeedChannel = ({ title, config, onClose }: FeedChannelProps) => {
  const [eventTab, setEventTab] = useState<'Quote' | 'Trade'>('Quote')
  const [paused, setPaused] = useState(false)
  const [useSource, setUseSource] = useState(false)

  const isChart = config.view === 'chart'
  const isQuote = eventTab === 'Quote'

  return (
    <ChannelWidget
      icon={<ShowChartIcon />}
      title={title}
      subtitle={`Feed · ${isChart ? 'candle chart' : 'subscriptions'}`}
      onClose={onClose}
      status={
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={isChart ? 'chart' : 'subscribed'}
        />
      }
    >
      <Stack spacing={2}>
        <ConfigChips config={config} />

        {isChart ? (
          <>
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                alignItems: 'center',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr) auto' },
              }}
            >
              <TextField label="Candle symbol" defaultValue="AAPL{=d}" size="small" />
              <TextField label="From time" defaultValue="0" size="small" />
              <Button variant="contained" startIcon={<AddIcon />}>
                Subscribe
              </Button>
            </Box>
            <Placeholder
              icon={<CandlestickChartIcon fontSize="large" />}
              label="Candle chart renders here (dxcharts-lite)"
              height={300}
            />
          </>
        ) : (
          <>
            <Accordion disableGutters variant="outlined" sx={{ '&::before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontWeight: 600 }}>Configuration</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: 2,
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                    }}
                  >
                    <TextField label="Aggregation period, s" defaultValue="0" size="small" />
                    <TextField label="Data format" select defaultValue="FULL" size="small">
                      <MenuItem value="FULL">FULL</MenuItem>
                      <MenuItem value="COMPACT">COMPACT</MenuItem>
                    </TextField>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Event fields
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      useFlexGap
                      sx={{ flexWrap: 'wrap', mt: 0.5 }}
                    >
                      {EVENT_FIELDS.map((field) => (
                        <Chip key={field} size="small" label={field} variant="outlined" />
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Subscription
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  alignItems: 'center',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr) auto' },
                }}
              >
                <TextField label="Event type" select defaultValue="Quote" size="small">
                  {EVENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField label="Symbol" defaultValue="AAPL" size="small" />
                <TextField label="From time" defaultValue="0" size="small" />
                <TextField
                  label="Order source"
                  select
                  defaultValue="DEFAULT"
                  size="small"
                  disabled={!useSource}
                >
                  <MenuItem value="DEFAULT">DEFAULT</MenuItem>
                  <MenuItem value="NTV">NTV</MenuItem>
                  <MenuItem value="DEX">DEX</MenuItem>
                </TextField>
                <Button variant="contained" startIcon={<AddIcon />}>
                  Add
                </Button>
              </Box>
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1.5 }}>
                {SUBSCRIPTIONS.map((sub) => (
                  <Chip key={sub} label={sub} onDelete={() => undefined} size="small" />
                ))}
              </Stack>
              <Button
                size="small"
                sx={{ mt: 0.5 }}
                onClick={() => setUseSource((value) => !value)}
                color="inherit"
              >
                {useSource ? 'Hide order source' : 'Set order source'}
              </Button>
            </Box>

            <Divider />

            <Box>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Tabs value={eventTab} onChange={(_e, value) => setEventTab(value)}>
                  <Tab value="Quote" label="Quote" />
                  <Tab value="Trade" label="Trade" />
                </Tabs>
                <Stack direction="row" spacing={0.5}>
                  <Tooltip title={paused ? 'Resume' : 'Pause'}>
                    <IconButton size="small" onClick={() => setPaused((value) => !value)}>
                      {paused ? <PlayArrowIcon /> : <PauseIcon />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Clear">
                    <IconButton size="small">
                      <DeleteSweepIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Copy as JSON">
                    <IconButton size="small">
                      <ContentCopyIcon />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
              <Box sx={{ height: 280, mt: 1 }}>
                <DataGrid
                  density="compact"
                  hideFooter
                  disableRowSelectionOnClick
                  rows={isQuote ? QUOTE_ROWS : TRADE_ROWS}
                  columns={isQuote ? QUOTE_COLUMNS : TRADE_COLUMNS}
                />
              </Box>
            </Box>
          </>
        )}
      </Stack>
    </ChannelWidget>
  )
}
