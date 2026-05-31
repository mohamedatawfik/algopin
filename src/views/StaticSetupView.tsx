import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormHelperText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

export function StaticSetupView() {
  const {
    mTurkId,
    basePin,
    setBasePin,
    appendTelemetry,
    advanceStage,
    registerParticipant,
  } = useStudyStore()

  const [pinValue, setPinValue] = useState<string>(basePin ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [backendWarning, setBackendWarning] = useState<string | null>(null)

  useEffect(() => {
    appendTelemetry('static_setup_opened', { mTurkId })
  }, [appendTelemetry, mTurkId])

  const handlePinChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '').slice(0, 4)
    setPinValue(digitsOnly)
    if (error) setError(null)
  }

  const handleSubmit = async () => {
    if (!/^\d{4}$/.test(pinValue)) {
      setError('Please enter exactly 4 digits.')
      return
    }
    setError(null)
    setBackendWarning(null)
    setSubmitting(true)
    setBasePin(pinValue)
    appendTelemetry('static_setup_submit', { mTurkId })

    if (mTurkId) {
      try {
        await registerParticipant(mTurkId, pinValue)
        appendTelemetry('participant_registered', { mTurkId })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Backend save failed'
        appendTelemetry('participant_register_failed', { error: message })
        setBackendWarning(
          `Saved your PIN locally, but could not reach the backend: ${message}`
        )
        setSubmitting(false)
        return
      }
    } else {
      setBackendWarning(
        'No MTurk Worker ID is set. Skipping backend registration.'
      )
    }

    setSubmitting(false)
    advanceStage()
  }

  const handleContinueOffline = () => {
    appendTelemetry('static_setup_continue_offline', { mTurkId })
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 480, mx: 'auto', py: 2 }}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label="Stage 2 / 15" size="small" variant="outlined" />
        <Chip
          label="Static PIN setup"
          size="small"
          color="primary"
          variant="outlined"
        />
      </Stack>

      <Typography variant="h5" component="h1">
        Choose your base PIN
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Enter a 4-digit PIN you can remember. This is the static baseline you
        will use for the first unlock task and the foundation for every
        algorithmic condition that follows.
      </Typography>

      <Box>
        <TextField
          label="4-digit PIN"
          type="password"
          value={pinValue}
          onChange={(e) => handlePinChange(e.target.value)}
          fullWidth
          autoComplete="off"
          autoFocus
          inputProps={{
            inputMode: 'numeric',
            pattern: '[0-9]*',
            maxLength: 4,
            'aria-label': '4 digit base PIN',
          }}
          error={Boolean(error)}
        />
        <FormHelperText error={Boolean(error)}>
          {error ?? 'Digits only. The PIN is masked for privacy.'}
        </FormHelperText>
      </Box>

      {backendWarning && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={handleContinueOffline}
            >
              Continue offline
            </Button>
          }
        >
          {backendWarning}
        </Alert>
      )}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleSubmit}
        disabled={submitting || pinValue.length !== 4}
        startIcon={
          submitting ? <CircularProgress size={18} color="inherit" /> : undefined
        }
      >
        {submitting ? 'Saving…' : 'Save PIN and continue'}
      </Button>
    </Stack>
  )
}
