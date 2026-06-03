import 'styled-components'

import type { Theme } from '@dxfeed/ui-kit/theme/types'

declare module 'styled-components' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefaultTheme extends Theme {}
}
