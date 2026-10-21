import { Alert, Button, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useStudyStore } from '../store/studyStore'

const BASE_PIN_LENGTH = 4

/**
 * Entry point for the Phase 2 follow-up session. The participant
 * re-identifies themselves and re-states the base PIN they will use for
 * today's three recall tests.
 *
 * Deliberately says nothing about the algorithmic rules — recalling those
 * unaided is the whole point of the follow-up.
 */
export function Phase2WelcomeView() {
  const startPhase2 = useStudyStore((s) => s.startPhase2)
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const advanceStage = useStudyStore((s) => s.advanceStage)

  const [localId, setLocalId] = useState('')
  const [localPin, setLocalPin] = useState('')
  const [starting, setStarting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const trimmedId = localId.trim()
  const canStart =
    trimmedId.length > 0 && localPin.length === BASE_PIN_LENGTH

  const handleStart = async () => {
    if (!canStart || starting) return
    setStarting(true)
    setErrorMessage(null)
    const result = await startPhase2(trimmedId, localPin)
    if (!result.ok) {
      setErrorMessage(
        result.error ?? 'Could not start the study. Please try again.'
      )
      setStarting(false)
      return
    }
    appendTelemetry('phase2_started', {
      prolificId: trimmedId,
      basePin: localPin,
    })
    window.scrollTo(0, 0)
    setStarting(false)
    advanceStage()
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 440, mx: 'auto', py: 4 }}>
      <Typography variant="h5" component="h1">
        Welcome Back! (Phase 2)
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Thank you for returning for the follow-up session. Enter your details
        below to begin today's tasks.
      </Typography>

      <TextField
        label="Prolific ID"
        placeholder="Prolific ID"
        value={localId}
        onChange={(e) => setLocalId(e.target.value)}
        required
        fullWidth
        autoComplete="off"
        spellCheck={false}
      />

      <TextField
        type="number"
        label="4-Digit Base PIN"
        value={localPin}
        onChange={(e) =>
          setLocalPin(e.target.value.replace(/\D/g, '').slice(0, BASE_PIN_LENGTH))
        }
        required
        fullWidth
        autoComplete="off"
        helperText={
          'Please enter the 4-digit Base PIN you set in the first session. ' +
          'If you do not remember it, simply enter a new 4-digit PIN to use ' +
          "for today's tasks."
        }
        inputProps={{
          inputMode: 'numeric',
          pattern: '[0-9]*',
          maxLength: BASE_PIN_LENGTH,
          'aria-label': '4-digit base PIN',
        }}
        sx={{
          '& input[type=number]': {
            MozAppearance: 'textfield',
          },
          '& input[type=number]::-webkit-inner-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
          '& input[type=number]::-webkit-outer-spin-button': {
            WebkitAppearance: 'none',
            margin: 0,
          },
        }}
      />

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={handleStart}
        disabled={!canStart || starting}
      >
        {starting ? 'Starting…' : 'Start Phase 2'}
      </Button>
    </Stack>
  )
}

export default Phase2WelcomeView
