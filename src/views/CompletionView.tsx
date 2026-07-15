import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DoneIcon from '@mui/icons-material/Done'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { generateCompletionCode } from '../lib/completionCode'
import { useStudyStore } from '../store/studyStore'

/**
 * Terminal stage displayed after the participant submits the HIGH_SUS
 * survey (and therefore the last per-condition telemetry POST).
 *
 * On mount we generate a single MTurk completion code, POST it to
 * `/api/participant/finalize` so the DB row for this participant has a
 * cross-reference token, and then display the code to the participant
 * with instructions to paste it into the MTurk HIT page. Closing the
 * tab is the intended exit from this screen.
 */
export function CompletionView() {
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const finalizeParticipant = useStudyStore((s) => s.finalizeParticipant)
  const mTurkId = useStudyStore((s) => s.mTurkId)

  // Generate exactly once per mount. Using a lazy initializer means the
  // code is stable across re-renders — participants who look at their
  // code twice see the same characters.
  const [completionCode] = useState<string>(() => generateCompletionCode())

  const [status, setStatus] = useState<
    'submitting' | 'success' | 'error'
  >('submitting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyResetTimer = useRef<number | null>(null)

  // Fire the finalize POST exactly once. React 18 StrictMode double-
  // invokes effects in dev; the ref guard keeps us from submitting the
  // same code twice and racing the backend.
  const submitAttempted = useRef(false)

  const submitCompletion = async () => {
    setStatus('submitting')
    setErrorMessage(null)
    appendTelemetry('study_completed', { mTurkId, completionCode })
    const res = await finalizeParticipant({ completionCode })
    if (res.ok) {
      appendTelemetry('completion_code_persisted', {
        mTurkId,
        completionCode,
        completedAt: res.completedAt,
      })
      setStatus('success')
      return
    }
    appendTelemetry('completion_code_persist_failed', {
      mTurkId,
      completionCode,
      error: res.error,
    })
    setErrorMessage(
      res.error ??
        'Could not save your completion code. Please retry — do not close this tab.'
    )
    setStatus('error')
  }

  useEffect(() => {
    if (submitAttempted.current) return
    submitAttempted.current = true
    void submitCompletion()
    // We intentionally run this exactly once; `submitCompletion` closes
    // over the stable `completionCode` state and store selectors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
    }
  }, [])

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(completionCode)
      } else {
        // Fallback for older browsers / non-secure contexts.
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

  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto', py: 4 }}>
      <Typography variant="h5" component="h1">
        Study complete
      </Typography>

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
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              void submitCompletion()
            }}
          >
            Retry
          </Button>
        </Stack>
      )}

      {status === 'success' && (
        <Alert
          severity="success"
          sx={{
            alignItems: 'flex-start',
            '& .MuiAlert-message': { width: '100%' },
          }}
        >
          <Stack spacing={2} sx={{ width: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Thank you for completing Phase 1 of this study!
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
                border: '1px solid',
                borderColor: 'success.light',
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

            <Typography variant="body2">
              Please copy this exact code and paste it into the Amazon
              MTurk HIT page to receive your payment. Do not close this
              window until you have submitted the code on MTurk.
            </Typography>
          </Stack>
        </Alert>
      )}

      <Typography variant="body2" color="text.secondary">
        We appreciate your time. Your responses will be reviewed and paid
        out via MTurk according to the HIT's terms.
      </Typography>
    </Stack>
  )
}

export default CompletionView
