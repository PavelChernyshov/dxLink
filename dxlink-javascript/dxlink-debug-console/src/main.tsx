import '@fontsource-variable/inter'
import CssBaseline from '@mui/material/CssBaseline'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
import { ThemeProvider } from '@mui/material/styles'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { App } from './app/App'
import { theme } from './app/theme'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('Root element #root not found')
}

createRoot(container).render(
  <StrictMode>
    <InitColorSchemeScript attribute="class" defaultMode="system" />
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <HashRouter>
        <App />
      </HashRouter>
    </ThemeProvider>
  </StrictMode>
)
