import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Mock received data
// ---------------------------------------------------------------------------
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

/** Received-events grid with Quote/Trade tabs and pause/clear/copy controls. */
export const EventsTable = () => {
  const [eventTab, setEventTab] = useState<'Quote' | 'Trade'>('Quote')
  const [paused, setPaused] = useState(false)
  const isQuote = eventTab === 'Quote'

  return (
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
  )
}
