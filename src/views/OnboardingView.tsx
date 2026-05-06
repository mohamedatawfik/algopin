import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useStudyStore } from '../store/studyStore'

export function OnboardingView() {
  const {
    mTurkId,
    setMTurkId,
    consentAccepted,
    setConsentAccepted,
    appendTelemetry,
    advanceStage,
  } = useStudyStore()

  const [localId, setLocalId] = useState(mTurkId)
  const [error, setError] = useState<string | null>(null)

  const handleContinue = () => {
    const trimmed = localId.trim()
    if (!trimmed) {
      setError('Please enter your Amazon Mechanical Turk Worker ID.')
      return
    }
    if (!consentAccepted) {
      setError('You must accept the consent form to continue.')
      return
    }
    setError(null)
    setMTurkId(trimmed)
    appendTelemetry('onboarding_complete', { mTurkId: trimmed })
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 440, mx: 'auto', py: 2 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Welcome
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This task is part of a research study on PIN authentication. Enter your
        MTurk Worker ID exactly as it appears on your dashboard.
      </Typography>
      <TextField
        label="Worker ID"
        value={localId}
        onChange={(e) => setLocalId(e.target.value)}
        fullWidth
        autoComplete="off"
        spellCheck={false}
      />
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" gutterBottom>
          Informed consent
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          By participating, you confirm you are at least 18 years old and agree
          that your anonymized responses may be used for research. You may
          withdraw at any time without penalty. Contact the research team if you
          have questions.
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={consentAccepted}
              onChange={(_, v) => setConsentAccepted(v)}
              color="primary"
            />
          }
          label="I have read and agree to participate"
        />
      </Box>
      {error && <FormHelperText error>{error}</FormHelperText>}
      <Button variant="contained" size="large" fullWidth onClick={handleContinue}>
        Continue
      </Button>
    </Stack>
  )
}
