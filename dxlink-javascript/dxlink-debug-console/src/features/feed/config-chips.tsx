import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'

import type { FeedConfig } from '../channels/types'

/** Feed/space qualification chips (shown only when set). */
export const ConfigChips = ({ config }: { config: FeedConfig }) =>
  config.feed || config.space ? (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {config.feed && <Chip size="small" variant="outlined" label={`feed: ${config.feed}`} />}
      {config.space && <Chip size="small" variant="outlined" label={`space: ${config.space}`} />}
    </Stack>
  ) : null
