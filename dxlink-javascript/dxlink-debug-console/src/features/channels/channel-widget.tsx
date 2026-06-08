import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Avatar from '@mui/material/Avatar'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
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
  onClose?: () => void
  defaultExpanded?: boolean
  children: React.ReactNode
}

/**
 * Generic collapsible channel card shell (draft / presentational). Every channel
 * kind (feed, dom, candles, script) renders its content inside this shell.
 */
export const ChannelWidget = ({
  icon,
  title,
  subtitle,
  status,
  onClose,
  defaultExpanded = true,
  children,
}: ChannelWidgetProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <Card>
      <CardHeader
        avatar={
          <Avatar
            variant="rounded"
            sx={{ bgcolor: 'action.selected', color: 'text.primary', width: 38, height: 38 }}
          >
            {icon}
          </Avatar>
        }
        title={<Typography sx={{ fontWeight: 700 }}>{title}</Typography>}
        subheader={subtitle}
        action={
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
            {onClose && (
              <Tooltip title="Close channel">
                <IconButton onClick={onClose} aria-label="Close channel">
                  <CloseIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        }
      />
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <CardContent sx={{ pt: 0 }}>{children}</CardContent>
      </Collapse>
    </Card>
  )
}
