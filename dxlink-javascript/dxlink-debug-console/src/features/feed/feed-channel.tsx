import AddIcon from '@mui/icons-material/Add'
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'

import { ConfigurationSection } from './feed-configuration'
import { EventsTable } from './feed-events-table'
import { SubscriptionManager } from './feed-subscriptions'
import { Placeholder } from '../../shared/components/placeholder'
import { ChannelWidget } from '../channels/channel-widget'
import type { FeedConfig } from '../channels/types'

interface FeedChannelProps {
  title: string
  config: FeedConfig
}

const ConfigChips = ({ config }: { config: FeedConfig }) =>
  config.feed || config.space ? (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {config.feed && <Chip size="small" variant="outlined" label={`feed: ${config.feed}`} />}
      {config.space && <Chip size="small" variant="outlined" label={`space: ${config.space}`} />}
    </Stack>
  ) : null

/** Feed channel view (draft / presentational only): subscriptions table or candle chart. */
export const FeedChannel = ({ title, config }: FeedChannelProps) => {
  const isChart = config.view === 'chart'

  return (
    <ChannelWidget
      icon={<ShowChartIcon />}
      title={title}
      subtitle={`Feed · ${isChart ? 'candle chart' : 'subscriptions'}`}
      status={
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={isChart ? 'chart' : 'opened'}
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
            <ConfigurationSection />
            <Divider />
            <SubscriptionManager />
            <Divider />
            <EventsTable />
          </>
        )}
      </Stack>
    </ChannelWidget>
  )
}
