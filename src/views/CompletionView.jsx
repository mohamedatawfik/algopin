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
 * Terminal stage of Phase 2, reached from HIGH_TEST. It POSTs
 * `prolificId`, `prolificCode`, `basePin` and the three recall test
 * results to `/api/telemetry`, which writes a `telemetrylogs` document.
 *
 * Three visual phases: "submitting" (spinner while the POST is in
 * flight), "success" (the completion code the participant pastes into
 * Prolific), and "error" (retry without regenerating the code, so the
 * participant never sees two different codes).
 */
export function CompletionView() {
  const appendTelemetry = useStudyStore((s) => s.appendTelemetry)
  const submitPhase2 = useStudyStore((s) => s.submitPhase2)
  const prolificId = useStudyStore((s) => s.prolificId)
  const basePin = useStudyStore((s) => s.basePin)
  const testResults = useStudyStore((s) => s.testResults)

  // 'submitting' | 'error' | 'success'
  const [status, setStatus] = useState('submitting')
  const [prolificCode, setProlificCode] = useState('')
  const [errorMessage, setErrorMessage] = useState(null)
  const [copied, setCopied] = useState(false)
  const copyResetTimer = useRef(null)
  const submitStartedRef = useRef(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
    }
  }, [])

  const runSubmit = async (code) => {
    setStatus('submitting')
    setErrorMessage(null)
    appendTelemetry('phase2_completed', { prolificId, prolificCode: code })
    const payload = {
      prolificId,
      prolificCode: code,
      basePin,
      lowTest: testResults.lowTest,
      mediumTest: testResults.mediumTest,
      highTest: testResults.highTest,
    }
    console.log('Submitting payload:', payload)
    const res = await submitPhase2(code)
    if (res.ok) {
      appendTelemetry('phase2_persisted', {
        prolificId,
        prolificCode: code,
        id: res.id,
      })
      setStatus('success')
      return
    }
    appendTelemetry('phase2_persist_failed', {
      prolificId,
      prolificCode: code,
      error: res.error,
    })
    setErrorMessage(
      res.error ??
        'Could not save your results. Please retry — do not close this tab.'
    )
    setStatus('error')
  }

  // Generate the code once and submit immediately on mount. The ref guard
  // keeps StrictMode's double-invoke in development from producing two
  // codes (and two documents) for the same participant.
  useEffect(() => {
    if (submitStartedRef.current) return
    submitStartedRef.current = true
    const code = generateCompletionCode()
    setProlificCode(code)
    void runSubmit(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRetry = () => {
    if (!prolificCode) return
    void runSubmit(prolificCode)
  }

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(prolificCode)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = prolificCode
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'absolute'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopied(true)
      appendTelemetry('completion_code_copied', { prolificCode })
      if (copyResetTimer.current !== null) {
        window.clearTimeout(copyResetTimer.current)
      }
      copyResetTimer.current = window.setTimeout(() => {
        setCopied(false)
        copyResetTimer.current = null
      }, 2000)
    } catch (err) {
      appendTelemetry('completion_code_copy_failed', {
        prolificCode,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 640, mx: 'auto', py: 4 }}>
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
              'Could not save your results. Please retry — do not close this tab.'}
          </Alert>
          <Button variant="contained" color="primary" onClick={handleRetry}>
            Retry
          </Button>
        </Stack>
      )}

      {status === 'success' && (
        <Stack spacing={3} alignItems="stretch">
          <Typography
            variant="h4"
            component="h1"
            sx={{ fontWeight: 700, textAlign: 'center' }}
          >
            Thank you for completing Phase 2 of this study!
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
                Your Prolific completion code
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
                  aria-label="Prolific completion code"
                  sx={{
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    letterSpacing: 2,
                    wordBreak: 'break-all',
                  }}
                >
                  {prolificCode}
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
            Please paste this exact code into the Prolific submission page.
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ textAlign: 'center' }}
          >
            Do not close this window until you have submitted the code in the
            Prolific window.
          </Typography>
        </Stack>
      )}
    </Stack>
  )
}

export default CompletionView
