import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Badge from '@mui/material/Badge'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

export interface DraftError {
  type: string
  message: string
  time: string
}

interface ErrorCenterProps {
  errors: DraftError[]
  onClear?: () => void
}

/**
 * Error center (draft / presentational only). A badge button that opens a
 * popover listing connection-level errors. Aggregates only connection errors;
 * channel-level errors live in their channel widgets.
 */
export const ErrorCenter = ({ errors, onClear }: ErrorCenterProps) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const count = errors.length

  return (
    <>
      <Badge badgeContent={count} color="error">
        <Button
          color={count > 0 ? 'error' : 'inherit'}
          variant="outlined"
          startIcon={<ErrorOutlineIcon />}
          onClick={(e) => setAnchor(e.currentTarget)}
          disabled={count === 0}
        >
          Errors
        </Button>
      </Badge>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: '90vw' } } }}
      >
        <Stack spacing={1} sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontWeight: 700 }}>Errors</Typography>
            <Button size="small" color="inherit" onClick={onClear}>
              Clear
            </Button>
          </Stack>
          {errors.map((error, index) => (
            <Alert key={index} severity="error" variant="outlined">
              <AlertTitle sx={{ mb: 0 }}>
                {error.type}
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {error.time}
                </Typography>
              </AlertTitle>
              {error.message}
            </Alert>
          ))}
        </Stack>
      </Popover>
    </>
  )
}
