import AddIcon from '@mui/icons-material/Add'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Subscription model — mirrors dxlink-feed's three subscription shapes:
//   Subscription            { type, symbol }            (regular)
//   IndexedEventSubscription{ type, symbol, source }    (indexed)
//   TimeSeriesSubscription  { type, symbol, fromTime }  (time series)
// ---------------------------------------------------------------------------
type SubKind = 'regular' | 'indexed' | 'timeSeries'

// The channel always uses the default AUTO contract, which accepts all three
// subscription shapes.
const SUB_KINDS: { value: SubKind; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'timeSeries', label: 'Time series' },
]

const EVENT_TYPES = [
  'Quote',
  'Trade',
  'Candle',
  'Summary',
  'Profile',
  'Greeks',
  'TimeAndSale',
  'Order',
  'AnalyticOrder',
  'SpreadOrder',
  'Underlying',
  'TheoPrice',
  'Series',
  'OptionSale',
]

interface SubEntry {
  type: string
  symbol: string
  kind: SubKind
  source: string
  fromTime: string
}

/** Dedup key, mirroring the feed's getSubscriptionKey: `type[#source]:symbol`. */
const subKey = (s: SubEntry) => `${s.type}${s.kind === 'indexed' ? `#${s.source}` : ''}:${s.symbol}`

/** Human label for a subscription chip. */
const subLabel = (s: SubEntry) => {
  const base =
    s.kind === 'indexed' && s.source ? `${s.type}#${s.source}:${s.symbol}` : `${s.type}:${s.symbol}`
  return s.kind === 'timeSeries' ? `${base} · from ${s.fromTime || '0'}` : base
}

const INITIAL_SUBS: SubEntry[] = [
  { type: 'Quote', symbol: 'AAPL', kind: 'regular', source: '', fromTime: '0' },
  { type: 'Quote', symbol: 'MSFT', kind: 'regular', source: '', fromTime: '0' },
  { type: 'Candle', symbol: 'AAPL{=d}', kind: 'timeSeries', source: '', fromTime: '0' },
]

/** Subscription form + active-subscription list (add / remove / clear). */
export const SubscriptionManager = () => {
  const [kind, setKind] = useState<SubKind>('regular')
  const [type, setType] = useState('Quote')
  const [symbol, setSymbol] = useState('')
  const [source, setSource] = useState('')
  const [fromTime, setFromTime] = useState('0')
  const [subs, setSubs] = useState<SubEntry[]>(INITIAL_SUBS)

  const showSource = kind === 'indexed'
  const showFromTime = kind === 'timeSeries'
  const extraCols = showSource || showFromTime ? 1 : 0

  const canAdd = type.trim() !== '' && symbol.trim() !== '' && (!showSource || source.trim() !== '')

  const addSubscription = () => {
    if (!canAdd) return
    const entry: SubEntry = {
      type: type.trim(),
      symbol: symbol.trim(),
      kind,
      source: source.trim(),
      fromTime: fromTime.trim() || '0',
    }
    setSubs((current) => {
      const key = subKey(entry)
      if (current.some((s) => subKey(s) === key)) return current
      return [...current, entry]
    })
  }

  const removeSubscription = (key: string) =>
    setSubs((current) => current.filter((s) => subKey(s) !== key))

  const clearSubscriptions = () => setSubs([])

  return (
    <Box>
      <Typography variant="subtitle2" gutterBottom>
        Subscription
      </Typography>

      <Stack spacing={1.5}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={kind}
          onChange={(_e, next: SubKind | null) => next !== null && setKind(next)}
        >
          {SUB_KINDS.map((k) => (
            <ToggleButton key={k.value} value={k.value}>
              {k.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            alignItems: 'start',
            gridTemplateColumns: { xs: '1fr', md: `repeat(${2 + extraCols}, 1fr) auto` },
          }}
        >
          <TextField
            label="Event type"
            select
            value={type}
            onChange={(e) => setType(e.target.value)}
            size="small"
            helperText="dxFeed event type to receive"
          >
            {EVENT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubscription()}
            size="small"
            helperText={showFromTime ? 'Candle symbol, e.g. AAPL{=d}' : 'Market symbol, e.g. AAPL'}
          />
          {showSource && (
            <TextField
              label="Order source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              size="small"
              helperText="e.g. NTV, DEX, ntv, DEFAULT"
            />
          )}
          {showFromTime && (
            <TextField
              label="From time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              size="small"
              helperText="Unix ms, or 0 for full history"
            />
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={addSubscription}
            disabled={!canAdd}
            sx={{ height: 40 }}
          >
            Add
          </Button>
        </Box>
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 2 }}
      >
        <Typography variant="caption" color="text.secondary">
          Active subscriptions ({subs.length})
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={<DeleteSweepIcon />}
          onClick={clearSubscriptions}
          disabled={subs.length === 0}
        >
          Clear all
        </Button>
      </Stack>
      {subs.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
          {subs.map((s) => {
            const key = subKey(s)
            return (
              <Chip
                key={key}
                label={subLabel(s)}
                onDelete={() => removeSubscription(key)}
                size="small"
                variant="outlined"
                color={s.kind === 'regular' ? 'default' : 'primary'}
              />
            )
          })}
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No active subscriptions.
        </Typography>
      )}
    </Box>
  )
}
