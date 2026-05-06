import { Box, Button, Stack, Typography } from '@mui/material'
import { useStudyStore } from '../store/studyStore'

export function SurveyView() {
  const { appendTelemetry, mTurkId, resetStudySession } = useStudyStore()

  const handlePlaceholderDone = () => {
    appendTelemetry('survey_placeholder_acknowledged', { mTurkId })
    resetStudySession()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
      <Typography variant="h5" component="h1">
        NASA-TLX
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Thank you for completing the unlock task. The full NASA Task Load Index
        questionnaire would appear here (mental demand, physical demand,
        temporal demand, performance, effort, frustration).
      </Typography>
      <Box
        sx={{
          p: 3,
          borderRadius: 2,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Placeholder: replace this section with your NASA-TLX implementation
          or external survey link. Telemetry for this session is stored in the app
          state for export.
        </Typography>
      </Box>
      <Button variant="outlined" fullWidth onClick={handlePlaceholderDone}>
        Back to start (demo)
      </Button>
    </Stack>
  )
}
