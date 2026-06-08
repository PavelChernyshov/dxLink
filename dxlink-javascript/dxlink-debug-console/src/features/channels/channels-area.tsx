import InsightsIcon from '@mui/icons-material/Insights'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
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
  DomDraft,
  DraftChannel,
  FeedDraft,
  IndiDraft,
} from './types'
import { DEFAULT_INDICATOR_CODE } from './types'
import { DomChannel } from '../dom/dom-channel'
import { DomSetup } from '../dom/dom-setup'
import { FeedChannel } from '../feed/feed-channel'
import { FeedSetup } from '../feed/feed-setup'
import { IndiChartChannel } from '../indichart/indichart-channel'
import { IndiChartSetup } from '../indichart/indichart-setup'

const ADD_BUTTONS: { kind: ChannelKind; label: string; icon: ReactNode }[] = [
  { kind: 'feed', label: 'Feed', icon: <ShowChartIcon /> },
  { kind: 'dom', label: 'DOM', icon: <ViewColumnIcon /> },
  { kind: 'indichart', label: 'IndiChart', icon: <InsightsIcon /> },
]

const LABELS: Record<ChannelKind, string> = { feed: 'Feed', dom: 'DOM', indichart: 'IndiChart' }

const DIALOG_TITLES: Record<ChannelKind, string> = {
  feed: 'Open Feed channel',
  dom: 'Open DOM channel',
  indichart: 'Open IndiChart channel',
}

const renderChannel = (channel: DraftChannel, onClose: () => void) => {
  const title = `${LABELS[channel.config.kind]} #${channel.id}`
  switch (channel.config.kind) {
    case 'feed':
      return <FeedChannel title={title} config={channel.config} onClose={onClose} />
    case 'dom':
      return <DomChannel title={title} config={channel.config} onClose={onClose} />
    case 'indichart':
      return <IndiChartChannel title={title} config={channel.config} onClose={onClose} />
  }
}

/**
 * Channels area (draft / presentational only). Owns the open channels and the
 * per-service setup dialog. Setup drafts persist between opens so the user can
 * quickly open several channels; each opened channel manages its own state.
 */
export const ChannelsArea = () => {
  const [channels, setChannels] = useState<DraftChannel[]>([])
  const [setupKind, setSetupKind] = useState<ChannelKind | null>(null)

  const [feedDraft, setFeedDraft] = useState<FeedDraft>({
    view: 'subscriptions',
    feed: '',
    space: '',
  })
  const [domDraft, setDomDraft] = useState<DomDraft>({ symbol: 'AAPL', source: '' })
  const [indiDraft, setIndiDraft] = useState<IndiDraft>({ indicators: [DEFAULT_INDICATOR_CODE] })

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
    if (setupKind === null) {
      return
    }
    const id = String(nextId.current)
    nextId.current += 1

    let config: ChannelConfig
    if (setupKind === 'feed') {
      config = {
        kind: 'feed',
        view: feedDraft.view,
        feed: feedDraft.feed.trim(),
        space: feedDraft.space.trim(),
      }
    } else if (setupKind === 'dom') {
      config = { kind: 'dom', symbol: domDraft.symbol.trim(), source: domDraft.source.trim() }
    } else {
      config = { kind: 'indichart', indicators: indiDraft.indicators }
    }

    setChannels((current) => [...current, { id, config }])
    setSetupKind(null)
    setScrollToId(id)
  }

  const closeChannel = (id: string) =>
    setChannels((current) => current.filter((channel) => channel.id !== id))

  const canOpen = setupKind !== 'dom' || domDraft.symbol.trim().length > 0

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
            onClick={() => setSetupKind(button.kind)}
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
              No channels open. Use the buttons above to open a Feed, DOM or IndiChart channel.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        channels.map((channel) => (
          <Box key={channel.id} id={`channel-${channel.id}`} sx={{ scrollMarginTop: 80 }}>
            {renderChannel(channel, () => closeChannel(channel.id))}
          </Box>
        ))
      )}

      <Dialog open={setupKind !== null} onClose={() => setSetupKind(null)} fullWidth maxWidth="sm">
        <DialogTitle>{setupKind ? DIALOG_TITLES[setupKind] : ''}</DialogTitle>
        <DialogContent dividers>
          {setupKind === 'feed' && <FeedSetup value={feedDraft} onChange={setFeedDraft} />}
          {setupKind === 'dom' && <DomSetup value={domDraft} onChange={setDomDraft} />}
          {setupKind === 'indichart' && (
            <IndiChartSetup value={indiDraft} onChange={setIndiDraft} />
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setSetupKind(null)}>
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
