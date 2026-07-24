import InsightsIcon from '@mui/icons-material/Insights'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import WhatshotIcon from '@mui/icons-material/Whatshot'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import type {
  ChannelConfig,
  ChannelKind,
  DeepBookRequest,
  DomRequest,
  DraftChannel,
  FeedRequest,
  IndiChartRequest,
} from './types'
import { DeepBookChannel } from '../deepbook/deepbook-channel'
import { DeepBookChannelRequest } from '../deepbook/deepbook-channel-request'
import { DomChannel } from '../dom/dom-channel'
import { DomChannelRequest } from '../dom/dom-channel-request'
import { FeedChannel } from '../feed/feed-channel'
import { FeedChannelRequest } from '../feed/feed-channel-request'
import { IndiChartChannel } from '../indichart/indichart-channel'
import { IndiChartChannelRequest } from '../indichart/indichart-channel-request'
import { DEFAULT_INDICATOR_CODE } from '../indichart/samples'

const ADD_BUTTONS: { kind: ChannelKind; label: string; icon: ReactNode }[] = [
  { kind: 'feed', label: 'Feed', icon: <ShowChartIcon /> },
  { kind: 'dom', label: 'DOM', icon: <ViewColumnIcon /> },
  { kind: 'deepbook', label: 'DeepBook', icon: <WhatshotIcon /> },
  { kind: 'indichart', label: 'IndiChart', icon: <InsightsIcon /> },
]

const LABELS: Record<ChannelKind, string> = {
  feed: 'Feed',
  dom: 'DOM',
  deepbook: 'DeepBook',
  indichart: 'IndiChart',
}

const DIALOG_TITLES: Record<ChannelKind, string> = {
  feed: 'New Feed channel',
  dom: 'New DOM channel',
  deepbook: 'New DeepBook channel',
  indichart: 'New IndiChart channel',
}

const renderChannel = (channel: DraftChannel) => {
  const title = `${LABELS[channel.config.kind]} #${channel.id}`
  switch (channel.config.kind) {
    case 'feed':
      return <FeedChannel title={title} config={channel.config} />
    case 'dom':
      return <DomChannel title={title} config={channel.config} />
    case 'deepbook':
      return <DeepBookChannel title={title} config={channel.config} />
    case 'indichart':
      return <IndiChartChannel title={title} config={channel.config} />
  }
}

/**
 * Channels area (draft / presentational only). Owns the open channels and the
 * per-service channel-request dialog. Request forms keep their values between
 * opens so the user can quickly open several channels; each opened channel
 * manages its own state.
 */
export const ChannelsArea = () => {
  const [channels, setChannels] = useState<DraftChannel[]>([])
  const [requestKind, setRequestKind] = useState<ChannelKind | null>(null)

  const [feedRequest, setFeedRequest] = useState<FeedRequest>({
    view: 'subscriptions',
    feed: '',
    space: '',
  })
  const [domRequest, setDomRequest] = useState<DomRequest>({
    symbol: 'AAPL',
    source: '',
    feed: '',
    space: '',
  })
  const [deepBookRequest, setDeepBookRequest] = useState<DeepBookRequest>({
    symbol: 'AAPL',
    source: 'NTV',
    granularity: '1s',
    candlePeriod: '1m',
    lookbackMinutes: '30',
  })
  const [indiRequest, setIndiRequest] = useState<IndiChartRequest>({
    indicators: [DEFAULT_INDICATOR_CODE],
  })

  const nextId = useRef(1)
  const [scrollToId, setScrollToId] = useState<string | null>(null)

  useEffect(() => {
    if (scrollToId === null) {
      return
    }
    document
      .getElementById(`channel-${scrollToId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollToId(null)
  }, [scrollToId])

  const openChannel = () => {
    if (requestKind === null) {
      return
    }
    const id = String(nextId.current)
    nextId.current += 1

    let config: ChannelConfig
    if (requestKind === 'feed') {
      config = {
        kind: 'feed',
        view: feedRequest.view,
        feed: feedRequest.feed.trim(),
        space: feedRequest.space.trim(),
      }
    } else if (requestKind === 'dom') {
      config = {
        kind: 'dom',
        symbol: domRequest.symbol.trim(),
        source: domRequest.source.trim(),
        feed: domRequest.feed.trim(),
        space: domRequest.space.trim(),
      }
    } else if (requestKind === 'deepbook') {
      const lookbackMinutes = Number(deepBookRequest.lookbackMinutes)
      const minutes = Number.isFinite(lookbackMinutes) && lookbackMinutes > 0 ? lookbackMinutes : 30
      config = {
        kind: 'deepbook',
        symbol: deepBookRequest.symbol.trim(),
        source: deepBookRequest.source.trim(),
        granularity: deepBookRequest.granularity.trim() || '1s',
        candlePeriod: deepBookRequest.candlePeriod.trim() || '1m',
        fromTime: Date.now() - minutes * 60_000,
      }
    } else {
      config = { kind: 'indichart', indicators: indiRequest.indicators }
    }

    setChannels((current) => [...current, { id, config }])
    setRequestKind(null)
    setScrollToId(id)
  }

  const canOpen =
    (requestKind !== 'dom' || domRequest.symbol.trim().length > 0) &&
    (requestKind !== 'deepbook' ||
      (deepBookRequest.symbol.trim().length > 0 && deepBookRequest.source.trim().length > 0))

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mr: 1 }}>
          Channels
        </Typography>
        {ADD_BUTTONS.map((button) => (
          <Button
            key={button.kind}
            size="small"
            variant="outlined"
            color="inherit"
            startIcon={button.icon}
            onClick={() => setRequestKind(button.kind)}
          >
            {button.label}
          </Button>
        ))}
      </Stack>

      {channels.length === 0 ? (
        <Card variant="outlined">
          <CardContent
            sx={{
              minHeight: 160,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <Typography color="text.secondary">
              No channels open. Use the buttons above to open a Feed, DOM, DeepBook or IndiChart
              channel.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        channels.map((channel) => (
          <Box key={channel.id} id={`channel-${channel.id}`} sx={{ scrollMarginTop: 80 }}>
            {renderChannel(channel)}
          </Box>
        ))
      )}

      <Dialog
        open={requestKind !== null}
        onClose={() => setRequestKind(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{requestKind ? DIALOG_TITLES[requestKind] : ''}</DialogTitle>
        <DialogContent dividers>
          {requestKind === 'feed' && (
            <FeedChannelRequest value={feedRequest} onChange={setFeedRequest} />
          )}
          {requestKind === 'dom' && (
            <DomChannelRequest value={domRequest} onChange={setDomRequest} />
          )}
          {requestKind === 'deepbook' && (
            <DeepBookChannelRequest value={deepBookRequest} onChange={setDeepBookRequest} />
          )}
          {requestKind === 'indichart' && (
            <IndiChartChannelRequest value={indiRequest} onChange={setIndiRequest} />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setRequestKind(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={openChannel} disabled={!canOpen}>
            Open channel
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
