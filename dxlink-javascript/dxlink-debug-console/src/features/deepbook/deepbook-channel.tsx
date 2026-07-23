import { DXLinkDeepBookState } from '@dxfeed/dxlink-api'
import WhatshotIcon from '@mui/icons-material/Whatshot'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'

import { DeepBookChart } from './deepbook-chart'
import { DeepBookViewModel } from './deepbook-view-model'
import { useVM } from '../../shared/view-model'
import { ChannelWidget } from '../channels/channel-widget'
import type { DeepBookConfig } from '../channels/types'
import { useConnectionVM } from '../connection/connection-context'

interface DeepBookChannelProps {
  title: string
  config: DeepBookConfig
}

const STATUS: Record<
  DXLinkDeepBookState,
  { label: string; color: 'success' | 'warning' | 'info' | 'error' | 'default' }
> = {
  [DXLinkDeepBookState.CONNECTING]: { label: 'connecting', color: 'warning' },
  [DXLinkDeepBookState.HISTORY]: { label: 'loading history', color: 'info' },
  [DXLinkDeepBookState.LIVE]: { label: 'live', color: 'success' },
  [DXLinkDeepBookState.CLOSED]: { label: 'closed', color: 'default' },
  [DXLinkDeepBookState.ERROR]: { label: 'error', color: 'error' },
}

const DeepBookStatusChip = ({ state }: { state: DXLinkDeepBookState }) => {
  const status = STATUS[state]
  return (
    <Chip
      size="small"
      variant="outlined"
      label={status.label}
      color={status.color === 'default' ? undefined : status.color}
    />
  )
}

const count = (value: number): string => value.toLocaleString()

/** Live DeepBook channel — an order-book heatmap backed by a real {@link DeepBookViewModel}. */
export const DeepBookChannel = ({ title, config }: DeepBookChannelProps) => {
  const connectionVM = useConnectionVM()
  const [vm] = useState(() => {
    const client = connectionVM.getClient()
    if (client === null) {
      throw new Error('DeepBook channel opened without an active connection')
    }
    return new DeepBookViewModel(client, {
      symbol: config.symbol,
      source: config.source,
      granularity: config.granularity,
      candlePeriod: config.candlePeriod,
      fromTime: config.fromTime,
    })
  })
  useEffect(() => {
    vm.start()
    return () => vm.stop()
  }, [vm])

  const state = useVM(vm, (s) => s.state)
  const totalOrders = useVM(vm, (s) => s.totalOrders)
  const levelCount = useVM(vm, (s) => s.levelCount)
  const lastUpdate = useVM(vm, (s) => s.lastUpdate)

  return (
    <ChannelWidget
      icon={<WhatshotIcon />}
      title={title}
      subtitle={`DeepBook · ${config.symbol || '—'} / ${config.source || '(default)'}`}
      onClose={vm.close}
      status={<DeepBookStatusChip state={state} />}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Chip size="small" variant="outlined" label={`symbol: ${config.symbol}`} />
          <Chip size="small" variant="outlined" label={`source: ${config.source || '(default)'}`} />
          <Chip size="small" variant="outlined" label={`granularity: ${config.granularity}`} />
          <Chip size="small" variant="outlined" label={`candles: ${config.candlePeriod}`} />
          <Chip
            size="small"
            variant="outlined"
            label={`from: ${new Date(config.fromTime).toLocaleString()}`}
          />
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}
        >
          <Typography variant="subtitle2">Order-book heatmap + candles</Typography>
          <Typography variant="caption" color="text.secondary">
            {count(totalOrders)} orders · {count(levelCount)} resting levels
            {lastUpdate !== null && ` · updated ${new Date(lastUpdate).toLocaleTimeString()}`}
          </Typography>
        </Stack>

        <DeepBookChart vm={vm} />

        <Typography variant="caption" color="text.secondary">
          {config.candlePeriod} candles ({config.symbol}
          {`{=${config.candlePeriod}}`}, reference feed) with the ORCS {config.granularity}{' '}
          order-book liquidity heatmap overlaid on the same time/price axes. Warmer/brighter =
          larger resting size. Pan/zoom with the mouse.
        </Typography>
      </Stack>
    </ChannelWidget>
  )
}
