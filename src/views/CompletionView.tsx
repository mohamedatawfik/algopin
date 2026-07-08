import { Alert, Stack, Typography } from '@mui/material'
import { useEffect } from 'react'
import { useStudyStore } from '../store/studyStore'

/**
 * Terminal stage displayed after the participant submits the HIGH_SUS
 * survey (and therefore the last per-condition telemetry POST). No further
 * navigation happens from here — closing the tab is the intended exit.
 */
export function CompletionView() {
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const mTurkId = useStudyStore((s) => s.mTurkId)

  useEffect(() => {
    appendTelemetry('study_completed', { mTurkId })
  }, [appendTelemetry, mTurkId])

  return (
    <Stack spacing={3} sx={{ maxWidth: 560, mx: 'auto', py: 4 }}>
      <Typography variant="h5" component="h1">
        Study complete
      </Typography>
      <Alert severity="success">
        Thank you. All four conditions have been recorded — you may now
        close this tab.
      </Alert>
      <Typography variant="body2" color="text.secondary">
        We appreciate your time. Your responses will be reviewed and paid
        out via MTurk according to the HIT's terms.
      </Typography>
    </Stack>
  )
}

export default CompletionView
