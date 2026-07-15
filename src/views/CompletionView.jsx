import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DoneIcon from '@mui/icons-material/Done'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { generateCompletionCode } from '../lib/completionCode'
import { useStudyStore } from '../store/studyStore'

/**
 * Terminal stage displayed after the participant submits the HIGH_SUS
 * survey (i.e. the last per-condition telemetry POST). The view is a
 * single state machine with three visual phases:
 *
 *   1. "verify" — final Attention Check: the participant is asked for the
 *      year they were born; we compare it to `demographics.birthDate` and
 *      derive `attentionCheck.passedCheck` from the match.
 *   2. "submitting" — spinner while the finalize POST is in flight. The
 *      finalize call carries everything remaining that has not yet been
 *      persisted: `demographics` (from the DEMOGRAPHICS stage), the fresh
 *      `attentionCheck` block, and the newly-generated 8-char completion
 *      code.
 *   3. "success" — the success message + completion code are shown to the
 *      participant; the input field and submit button are unmounted so
 *      the participant cannot re-submit.
 *
 * A retry state ("error") is exposed if the finalize POST fails so the
 * participant can retry without losing the code they already saw.
 */

/**
 * Best-effort extract of the 4-digit year from the canonical
 * `YYYY-MM-DD` `demographics.birthDate` string written by
 * `DemographicsView`. Returns null if the value hasn't been captured yet
 * (e.g. the participant reloaded the tab mid-study) so the attention
 * check can gracefully report "no reference year on file".
 */
function extractBirthYear(birthDate) {
  if (typeof birthDate !== 'string') return null
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(birthDate.trim())
  if (match) return match[1]
  const bare = /^(\d{4})$/.exec(birthDate.trim())
  return bare ? bare[1] : null
}

export function CompletionView() {
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const finalizeParticipant = useStudyStore((s) => s.finalizeParticipant)
  const setAttentionCheck = useStudyStore((s) => s.setAttentionCheck)
  const demographics = useStudyStore((s) => s.demographics)
  const mTurkId = useStudyStore((s) => s.mTurkId)

  const referenceBirthYear = useMemo(
    () => extractBirthYear(demographics.birthDate),
    [demographics.birthDate]
  )

  // 'verify' | 'submitting' | 'error' | 'success'
  const [status, setStatus] = useState('verify')
  const [verificationYear, setVerificationYear] = useState('')
  const [completionCode, setCompletionCode] = useState('')
  const [errorMessage, setErrorMessage] = useState(null)
  const [copied, setCopied] = useState(false)
  const copyResetTimer = useRef(null)

  const isYearComplete = /^\d{4}$/.test(verificationYear)

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
    }
  }, [])

  const runFinalize = async (code, passedCheck, enteredYear) => {
    setStatus('submitting')
    setErrorMessage(null)
    appendTelemetry('study_completed', {
      mTurkId,
      completionCode: code,
      passedCheck,
      verificationYear: enteredYear,
    })
    const res = await finalizeParticipant({ completionCode: code })
    if (res.ok) {
      appendTelemetry('completion_code_persisted', {
        mTurkId,
        completionCode: code,
        completedAt: res.completedAt,
      })
      setStatus('success')
      return
    }
    appendTelemetry('completion_code_persist_failed', {
      mTurkId,
      completionCode: code,
      error: res.error,
    })
    setErrorMessage(
      res.error ??
        'Could not save your completion code. Please retry — do not close this tab.'
    )
    setStatus('error')
  }

  const handleGenerateAndSubmit = () => {
    if (!isYearComplete) return
    const enteredYear = verificationYear.trim()
    const passedCheck =
      referenceBirthYear !== null && enteredYear === referenceBirthYear
    setAttentionCheck({ verificationYear: enteredYear, passedCheck })
    appendTelemetry('attention_check_submit', {
      verificationYear: enteredYear,
      referenceBirthYear,
      passedCheck,
    })
    const code = generateCompletionCode()
    setCompletionCode(code)
    void runFinalize(code, passedCheck, enteredYear)
  }

  const handleRetry = () => {
    if (!completionCode) return
    void runFinalize(
      completionCode,
      useStudyStore.getState().attentionCheck.passedCheck,
      useStudyStore.getState().attentionCheck.verificationYear
    )
  }

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(completionCode)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = completionCode
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      appendTelemetry('completion_code_copied', { completionCode })
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
      copyResetTimer.current = window.setTimeout(() => {
        setCopied(false)
        copyResetTimer.current = null
      }, 2000)
    } catch (err) {
      appendTelemetry('completion_code_copy_failed', {
        completionCode,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const showAttentionCheckForm = status === 'verify'
  const showSuccess = status === 'success'

  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto', py: 4 }}>
      {showAttentionCheckForm && (
        <>
          <Typography variant="h5" component="h1">
            Final Verification
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Before we generate your MTurk completion code, please confirm one
            detail from earlier so we can verify your responses were entered
            attentively.
          </Typography>

          <TextField
            id="verification-year"
            type="number"
            label="For data verification purposes, please enter the year you were born (YYYY):"
            value={verificationYear}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 4)
              setVerificationYear(digitsOnly)
            }}
            fullWidth
            InputLabelProps={{ shrink: true }}
            inputProps={{
              inputMode: 'numeric',
              pattern: '[0-9]*',
              min: 1900,
              max: new Date().getFullYear(),
              'aria-label': 'Year you were born',
            }}
            autoComplete="off"
          />

          <Button
            variant="contained"
            size="large"
            fullWidth
            onClick={handleGenerateAndSubmit}
            disabled={!isYearComplete}
          >
            Generate Completion Code
          </Button>
        </>
      )}

      {status === 'submitting' && (
        <Alert
          severity="info"
          icon={<CircularProgress size={18} thickness={5} />}
        >
          Finalising your submission… please keep this tab open.
        </Alert>
      )}

      {status === 'error' && (
        <Stack spacing={2}>
          <Alert severity="error">
            {errorMessage ??
              'Could not save your completion code. Please retry — do not close this tab.'}
          </Alert>
          <Button variant="contained" color="primary" onClick={handleRetry}>
            Retry
          </Button>
        </Stack>
      )}

      {showSuccess && (
        <Stack spacing={3} alignItems="stretch">
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 700, textAlign: 'center' }}
          >
            Thank you for completing Phase 1 of this study!
          </Typography>

          <Alert
            severity="success"
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              py: 2,
              '& .MuiAlert-message': { width: '100%' },
            }}
          >
            <Stack spacing={1.5} sx={{ width: '100%' }}>
              <Typography variant="overline" color="text.secondary">
                Your MTurk completion code
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  bgcolor: 'background.paper',
                  border: '2px solid',
                  borderColor: 'success.main',
                }}
              >
                <Typography
                  variant="h4"
                  component="p"
                  aria-label="MTurk completion code"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    letterSpacing: 2,
                    wordBreak: 'break-all',
                  }}
                >
                  {completionCode}
                </Typography>
                <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                  <IconButton
                    aria-label="Copy completion code"
                    onClick={handleCopy}
                    color={copied ? 'success' : 'default'}
                    size="large"
                  >
                    {copied ? <DoneIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Tooltip>
              </Box>
            </Stack>
          </Alert>

          <Typography variant="body1" sx={{ textAlign: 'center' }}>
            Please copy this code and paste it back into Amazon MTurk to
            receive your payment.
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center' }}
          >
            Do not close this window until you have submitted the code on
            MTurk.
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

export default CompletionView
