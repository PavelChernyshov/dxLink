import DescriptionIcon from '@mui/icons-material/Description'
import DownloadIcon from '@mui/icons-material/Download'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Typography from '@mui/material/Typography'

import { Placeholder } from '../shared/components/placeholder'

/**
 * Protocol page (draft / presentational only). In Phase 7 this renders the
 * AsyncAPI viewer (`@asyncapi/react-component/browser`) for the dxLink spec.
 */
export const ProtocolPage = () => (
  <Card variant="outlined">
    <CardHeader
      title={<Typography sx={{ fontWeight: 700 }}>dxLink WebSocket protocol</Typography>}
      subheader="AsyncAPI specification"
      action={
        <Button startIcon={<DownloadIcon />} size="small">
          Download spec
        </Button>
      }
    />
    <CardContent>
      <Placeholder
        icon={<DescriptionIcon fontSize="large" />}
        label="AsyncAPI protocol viewer renders here"
        height={420}
      />
    </CardContent>
  </Card>
)
