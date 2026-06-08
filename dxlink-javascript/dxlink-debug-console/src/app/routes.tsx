import type { ReactElement } from 'react'

import { ConsolePage } from '../pages/console-page'
import { ProtocolPage } from '../pages/protocol-page'

export interface RouteDef {
  /** Tab label shown in the app bar. */
  label: string
  /** Route path (hash-routed). */
  path: string
  /** Page element rendered for the route. */
  element: ReactElement
}

/**
 * Single source of truth for navigation: drives both the tab bar and the router,
 * so the two can never drift apart.
 */
export const ROUTES: readonly RouteDef[] = [
  { label: 'Console', path: '/', element: <ConsolePage /> },
  { label: 'Protocol', path: '/protocol', element: <ProtocolPage /> },
]
