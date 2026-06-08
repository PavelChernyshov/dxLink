import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

interface PlaceholderProps {
  icon?: React.ReactNode
  label: string
  height?: number
}

/**
 * Dashed-border placeholder surface for areas that will host non-MUI content
 * later (charts, code editor). Draft only.
 */
export const Placeholder = ({ icon, label, height = 240 }: PlaceholderProps) => (
  <Box
    sx={{
      height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1px dashed',
      borderColor: 'divider',
      borderRadius: 2,
      bgcolor: 'action.hover',
    }}
  >
    <Stack spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
      {icon}
      <Typography variant="body2">{label}</Typography>
    </Stack>
  </Box>
)
