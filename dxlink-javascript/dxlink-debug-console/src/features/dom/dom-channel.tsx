import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { ChannelWidget } from '../channels/channel-widget'
import type { DomConfig } from '../channels/types'

const BIDS = [
  { price: 189.31, size: 14 },
  { price: 189.3, size: 22 },
  { price: 189.29, size: 9 },
  { price: 189.28, size: 31 },
  { price: 189.27, size: 18 },
]

const ASKS = [
  { price: 189.35, size: 11 },
  { price: 189.36, size: 7 },
  { price: 189.37, size: 25 },
  { price: 189.38, size: 16 },
  { price: 189.39, size: 12 },
]

interface DomChannelProps {
  title: string
  config: DomConfig
}

const LadderSide = ({
  side,
  rows,
}: {
  side: 'Bid' | 'Ask'
  rows: { price: number; size: number }[]
}) => {
  const color = side === 'Bid' ? 'success.main' : 'error.main'
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell sx={{ color, fontWeight: 700 }}>{side}</TableCell>
          <TableCell align="right">Size</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.price}>
            <TableCell sx={{ color, fontVariantNumeric: 'tabular-nums' }}>
              {row.price.toFixed(2)}
            </TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {row.size}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Depth-of-Market channel view (draft / presentational only). */
export const DomChannel = ({ title, config }: DomChannelProps) => (
  <ChannelWidget
    icon={<ViewColumnIcon />}
    title={title}
    subtitle={`DOM · ${config.symbol || '—'}`}
    status={<Chip size="small" color="success" variant="outlined" label="streaming" />}
  >
    <Stack spacing={2}>
      <Box
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' } }}
      >
        <TextField label="Symbol" value={config.symbol} size="small" disabled />
        <TextField label="Source" value={config.source || '—'} size="small" disabled />
        <TextField label="Aggregation period, s" defaultValue="0" size="small" />
        <TextField label="Depth limit" defaultValue="10" size="small" />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
        <LadderSide side="Bid" rows={BIDS} />
        <LadderSide side="Ask" rows={ASKS} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        Last update 15:42:01.420
      </Typography>
    </Stack>
  </ChannelWidget>
)
