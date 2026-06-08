import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom'

import { ROUTES } from './routes'
import { DxFeedLogo } from '../shared/components/dxfeed-logo'
import { ThemeModeToggle } from '../shared/components/theme-mode-toggle'

/**
 * App shell: single-row "liquid glass" app bar with brand, inline nav and the
 * theme switcher, plus the routed page area. Built from stock MUI components.
 */
export const App = () => {
  const { pathname } = useLocation()

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2 }}>
          <Box
            component={RouterLink}
            to="/"
            aria-label="dxLink home"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              color: 'text.primary',
              textDecoration: 'none',
            }}
          >
            <DxFeedLogo style={{ height: 18, width: 'auto', display: 'block' }} />
            <Typography
              component="span"
              noWrap
              sx={{ fontWeight: 700, fontSize: '1rem', lineHeight: 1 }}
            >
              dxLink.WebSocket
            </Typography>
          </Box>

          <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 2 }}>
            {ROUTES.map((route) => {
              const active = route.path === pathname
              return (
                <Button
                  key={route.path}
                  component={RouterLink}
                  to={route.path}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    px: 1.5,
                    color: active ? 'primary.main' : 'text.secondary',
                    bgcolor: active ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {route.label}
                </Button>
              )
            })}
          </Box>

          <Box sx={{ flexGrow: 1 }} />
          <ThemeModeToggle />
        </Toolbar>
      </AppBar>

      <Container component="main" maxWidth="lg" sx={{ flexGrow: 1, py: 3 }}>
        <Routes>
          {ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
        </Routes>
      </Container>
    </Box>
  )
}
