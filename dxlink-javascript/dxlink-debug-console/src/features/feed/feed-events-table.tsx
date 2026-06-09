import type { FeedEventData } from '@dxfeed/dxlink-api'
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
import Typography from '@mui/material/Typography'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { useState } from 'react'

import type { FeedEventsByType, FeedViewModel } from './feed-view-model'
import { useVM } from '../../shared/view-model'

// Columns shown first when present; the rest follow alphabetically.
const PRIORITY_FIELDS = ['eventSymbol', 'eventType']

interface EventRow extends FeedEventData {
  id: string
}

const toRows = (bySymbol: Record<string, FeedEventData> | undefined): EventRow[] =>
  bySymbol ? Object.entries(bySymbol).map(([symbol, event]) => ({ ...event, id: symbol })) : []

const buildColumns = (rows: EventRow[]): GridColDef[] => {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key !== 'id') keys.add(key)
    }
  }
  const rest = [...keys].filter((k) => !PRIORITY_FIELDS.includes(k)).sort()
  const ordered = [...PRIORITY_FIELDS.filter((k) => keys.has(k)), ...rest]
  return ordered.map((field) => ({ field, headerName: field, minWidth: 90, flex: 1 }))
}

/** Live received-events grid: one tab per event type, one row per symbol. */
export const EventsTable = ({ vm }: { vm: FeedViewModel }) => {
  const events = useVM(vm, (s) => s.events)
  const [activeType, setActiveType] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState<FeedEventsByType | null>(null)

  const display = paused && frozen !== null ? frozen : events
  const types = Object.keys(display)
  const active = activeType !== null && types.includes(activeType) ? activeType : (types[0] ?? null)

  const rows = active !== null ? toRows(display[active]) : []
  const columns = buildColumns(rows)

  const togglePause = () => {
    setFrozen(paused ? null : events)
    setPaused((value) => !value)
  }

  const copyJson = () => {
    const data = rows.map(({ id: _id, ...rest }) => rest)
    void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))
  }

  if (types.length === 0) {
    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Events
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No events received yet. Add a subscription to start receiving data.
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Tabs
          value={active}
          onChange={(_e, value) => setActiveType(value)}
          variant="scrollable"
          scrollButtons="auto"
        >
          {types.map((type) => (
            <Tab
              key={type}
              value={type}
              label={`${type} (${Object.keys(display[type] ?? {}).length})`}
            />
          ))}
        </Tabs>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={paused ? 'Resume' : 'Pause'}>
            <IconButton size="small" onClick={togglePause}>
              {paused ? <PlayArrowIcon /> : <PauseIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Clear">
            <IconButton size="small" onClick={vm.clearEvents}>
              <DeleteSweepIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy as JSON">
            <IconButton size="small" onClick={copyJson}>
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
          rows={rows}
          columns={columns}
        />
      </Box>
    </Box>
  )
}
