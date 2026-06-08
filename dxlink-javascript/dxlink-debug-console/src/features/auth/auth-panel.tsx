import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

interface AuthPanelProps {
  onAuthorize: () => void
}

/**
 * Authorization panel (draft / presentational only). Shown when the server
 * requires a token (auth state UNAUTHORIZED). Single CardContent + Stack so the
 * title→content spacing matches the other cards (16px).
 */
export const AuthPanel = ({ onAuthorize }: AuthPanelProps) => {
  const [token, setToken] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onAuthorize()
  }

  return (
    <Card>
      <CardContent>
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Typography sx={{ fontWeight: 700 }}>Authorization</Typography>
            <Stack
              spacing={2}
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}
            >
              <TextField
                label="Token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                size="small"
                fullWidth
                placeholder="Bearer token"
                helperText="This server requires authorization before opening channels."
              />
              <Button type="submit" variant="contained" sx={{ mt: 0.25 }}>
                Authorize
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  )
}
