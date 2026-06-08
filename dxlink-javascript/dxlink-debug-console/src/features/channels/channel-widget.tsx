import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

interface ChannelWidgetProps {
  icon: React.ReactNode
  title: string
  subtitle?: string
  /** Status slot (e.g. a Chip) shown before the collapse/close actions. */
  status?: React.ReactNode
  defaultExpanded?: boolean
  children: React.ReactNode
}

/**
 * Generic collapsible channel card shell (draft / presentational). Every channel
 * kind (feed, dom, indichart) renders its content inside this shell.
 *
 * Closing is a channel-view concern: it does NOT remove the card from the area —
 * the widget owns its own closed state. Closing is terminal (the dxlink channel
 * CLOSED state): the card stays as a header-only record marked "closed" — its
 * content is no longer rendered — and it cannot be reopened.
 */
export const ChannelWidget = ({
  icon,
  title,
  subtitle,
  status,
  defaultExpanded = true,
  children,
}: ChannelWidgetProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [closed, setClosed] = useState(false)

  return (
    <Card>
      <CardHeader
        avatar={
          <Avatar
            variant="rounded"
            sx={{
              bgcolor: closed ? 'action.disabledBackground' : 'action.selected',
              color: closed ? 'text.disabled' : 'text.primary',
              width: 38,
              height: 38,
            }}
          >
            {icon}
          </Avatar>
        }
        title={
          <Typography sx={{ fontWeight: 700, color: closed ? 'text.secondary' : 'text.primary' }}>
            {title}
          </Typography>
        }
        subheader={subtitle}
        action={
          closed ? (
            <Chip size="small" variant="outlined" label="closed" />
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              {status}
              <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
                <IconButton
                  onClick={() => setExpanded((value) => !value)}
                  sx={{ transition: '0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ExpandMoreIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Close channel">
                <IconButton onClick={() => setClosed(true)} aria-label="Close channel">
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          )
        }
      />
      {!closed && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <CardContent sx={{ pt: 0 }}>{children}</CardContent>
        </Collapse>
      )}
    </Card>
  )
}
