import {
  BatteryFull as BatteryFullIcon,
  ChatBubbleRounded,
  LockRounded,
  SignalCellularAlt as SignalCellularAltIcon,
  Wifi as WifiIcon,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { keyframes } from '@mui/system'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LockScreenMetrics,
  useLockScreenTelemetry,
} from '../hooks/useLockScreenTelemetry'
import type { TelemetrySubmission } from '../lib/api'
import {
  calculateExpectedPin,
  getCanonicalType,
  ResolvedConfiguration,
} from '../lib/pinComposer'
import { AlgorithmComplexity, previousStage } from '../lib/stageFlow'
import {
  configKeyForComplexity,
  useStudyStore,
} from '../store/studyStore'

const PHONE_MAX_WIDTH = 400
const PHONE_MAX_HEIGHT = 850
const SUCCESS_NAVIGATE_DELAY_MS = 900

type KeySpec =
  | { kind: 'digit'; value: string }
  | { kind: 'clear' }
  | { kind: 'return' }

const KEYPAD: KeySpec[] = [
  { kind: 'digit', value: '1' },
  { kind: 'digit', value: '2' },
  { kind: 'digit', value: '3' },
  { kind: 'digit', value: '4' },
  { kind: 'digit', value: '5' },
  { kind: 'digit', value: '6' },
  { kind: 'digit', value: '7' },
  { kind: 'digit', value: '8' },
  { kind: 'digit', value: '9' },
  { kind: 'return' },
  { kind: 'digit', value: '0' },
  { kind: 'clear' },
]

const shakeAnim = keyframes`
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-10px); }
  30%  { transform: translateX(10px); }
  45%  { transform: translateX(-7px); }
  60%  { transform: translateX(7px); }
  75%  { transform: translateX(-4px); }
  90%  { transform: translateX(4px); }
  100% { transform: translateX(0); }
`

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatStatusTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatLockTime(d: Date): string {
  return formatStatusTime(d)
}

function formatLockDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function randomInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function LockScreenView() {
  const {
    basePin: storedBasePin,
    currentCondition,
    currentStage,
    mTurkId,
    configurations,
    appendTelemetry,
    advanceStage,
    setStage,
    setTempTelemetry,
    clearTempTelemetry,
    submitTelemetry,
    demographics,
    currentPhaseReturnCount,
    incrementCurrentPhaseReturnCount,
  } = useStudyStore()
  const basePin = storedBasePin ?? ''
  const [now, setNow] = useState(() => new Date())
  const [entered, setEntered] = useState<string>('')
  const [errorCount, setErrorCount] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [telemetryError, setTelemetryError] = useState<string | null>(null)
  const [savingTelemetry, setSavingTelemetry] = useState(false)
  /** True once the PIN matched; keeps "Incorrect passcode" hidden if save fails. */
  const [pinAccepted, setPinAccepted] = useState(false)
  const [canRetryBaseline, setCanRetryBaseline] = useState(false)

  const successTimerRef = useRef<number | null>(null)
  const pendingBaselineSubmissionRef = useRef<TelemetrySubmission | null>(null)
  const telemetry = useLockScreenTelemetry()

  const battery = useMemo(() => randomInRange(20, 90), [])
  const unreadCount = useMemo(() => randomInRange(1, 9), [])

  const resolvedConfig: ResolvedConfiguration | null = useMemo(() => {
    if (currentCondition === 'Baseline') return null
    const complexity = currentCondition as AlgorithmComplexity
    const config = configurations[configKeyForComplexity(complexity)]
    // The rule type is strictly predefined by phase; we honor the value
    // saved during setup but fall back to the canonical mapping if a
    // session ever lands here without a stored configuration (e.g. dev
    // navigation, restored session). The replaced digit is a global
    // constant (`LOCKED_REPLACED_INDEX`) and is applied inside
    // `calculateExpectedPin`, so it does not need to be tracked here.
    const algorithmType = config?.algorithmType ?? getCanonicalType(complexity)
    return { algorithmType }
  }, [currentCondition, configurations])

  const expectedPin = useMemo(
    () =>
      calculateExpectedPin(basePin, currentStage, resolvedConfig, {
        date: now,
        batteryLevel: battery,
      }),
    [basePin, currentStage, resolvedConfig, now, battery]
  )

  const expectedLength = expectedPin.length

  useEffect(() => {
    appendTelemetry('lock_screen_opened', {
      condition: currentCondition,
      basePin,
      // Ambient lock-screen state at open time. `unreadCount` is now
      // purely decorative; `batteryLevel` is what the Medium and High
      // rules evaluate against.
      unreadCount,
      batteryLevel: battery,
    })
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [appendTelemetry, basePin, currentCondition, unreadCount, battery])

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const validate = useCallback(
    (attempt: string) => {
      const target = calculateExpectedPin(
        basePin,
        currentStage,
        resolvedConfig,
        { date: new Date(), batteryLevel: battery }
      )
      const ok = attempt === target
      appendTelemetry('pin_attempt', {
        correct: ok,
        attemptLength: attempt.length,
        expectedLength: target.length,
        condition: currentCondition,
      })
      if (ok) {
        // Snapshot the live store value so the count we persist matches
        // the count we later ship on the /api/telemetry payload, even if
        // the store mutates mid-render.
        const phaseReturnCount = currentPhaseReturnCount
        const submission = telemetry.recordSuccess({
          mTurkId,
          currentCondition,
          currentStage,
          expectedPin: target,
          returnCount: phaseReturnCount,
        })
        appendTelemetry('pin_success', {
          errorCount: submission.errorCount,
          returnCount: submission.returnCount,
          totalAuthTime: submission.totalAuthTime,
          timeToFirstTouch: submission.timeToFirstTouch,
        })
        // Compile lock-screen performance metrics. Baseline POSTs these
        // immediately (no TAM/SUS). Algorithmic conditions stash them in
        // tempTelemetry; TamSurveyView appends `tam`, and SusSurveyView
        // appends `sus` + identity before POSTing.
        const metrics: LockScreenMetrics = {
          renderTimestamp: submission.renderTimestamp,
          timeToFirstTouch: submission.timeToFirstTouch,
          totalAuthTime: submission.totalAuthTime,
          errorCount: submission.errorCount,
          returnCount: submission.returnCount,
          submittedErrors: submission.submittedErrors,
          keystrokeLog: submission.keystrokeLog,
        }
        setTempTelemetry(metrics)
        setTelemetryError(null)
        setPinAccepted(true)
        setShowSuccess(true)

        if (currentStage === 'BASELINE_TEST') {
          // Baseline skips surveys: POST metrics now, then go to ALGO_INTRO.
          void (async () => {
            if (!mTurkId) {
              setShowSuccess(false)
              setTelemetryError(
                'Your MTurk Worker ID is missing; please reload the study from the original link.'
              )
              return
            }
            const baselineSubmission: TelemetrySubmission = {
              mTurkId,
              condition: currentCondition,
              ...metrics,
              demographics,
            }
            pendingBaselineSubmissionRef.current = baselineSubmission
            setCanRetryBaseline(true)
            setSavingTelemetry(true)
            const res = await submitTelemetry(baselineSubmission)
            setSavingTelemetry(false)
            if (!res.ok) {
              appendTelemetry('telemetry_post_failed', {
                stage: currentStage,
                condition: currentCondition,
                error: res.error,
              })
              // Keep pinAccepted so the UI does not look like a wrong PIN.
              setShowSuccess(false)
              setTelemetryError(
                res.error ?? 'Could not save your responses. Please try again.'
              )
              return
            }
            pendingBaselineSubmissionRef.current = null
            setCanRetryBaseline(false)
            appendTelemetry('telemetry_post_ok', {
              stage: currentStage,
              condition: currentCondition,
              id: res.id,
            })
            clearTempTelemetry()
            setShowSuccess(true)
            successTimerRef.current = window.setTimeout(() => {
              advanceStage()
            }, SUCCESS_NAVIGATE_DELAY_MS)
          })()
        } else {
          successTimerRef.current = window.setTimeout(() => {
            // STAGE_ORDER pairs every algorithmic *_TEST with its *_TAM
            // successor (e.g. LOW_TEST -> LOW_TAM). The TAM view then
            // advances to *_SUS, which POSTs telemetry.
            advanceStage()
          }, SUCCESS_NAVIGATE_DELAY_MS)
        }
      } else {
        const nextErrors = errorCount + 1
        setErrorCount(nextErrors)
        telemetry.recordError(attempt)
        appendTelemetry('pin_failure', {
          errorCount: nextErrors,
          submitted: attempt,
        })
        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.vibrate === 'function'
        ) {
          navigator.vibrate(120)
        }
        setShakeKey((k) => k + 1)
        setEntered('')
      }
    },
    [
      advanceStage,
      appendTelemetry,
      basePin,
      battery,
      clearTempTelemetry,
      currentCondition,
      currentPhaseReturnCount,
      currentStage,
      demographics,
      errorCount,
      mTurkId,
      resolvedConfig,
      setTempTelemetry,
      submitTelemetry,
      telemetry,
    ]
  )

  const retryBaselineTelemetry = async () => {
    const pending = pendingBaselineSubmissionRef.current
    if (!pending || savingTelemetry) return
    setTelemetryError(null)
    setSavingTelemetry(true)
    setShowSuccess(true)
    const res = await submitTelemetry(pending)
    setSavingTelemetry(false)
    if (!res.ok) {
      appendTelemetry('telemetry_post_failed', {
        stage: currentStage,
        condition: currentCondition,
        error: res.error,
        retry: true,
      })
      setShowSuccess(false)
      setTelemetryError(
        res.error ?? 'Could not save your responses. Please try again.'
      )
      return
    }
    pendingBaselineSubmissionRef.current = null
    setCanRetryBaseline(false)
    appendTelemetry('telemetry_post_ok', {
      stage: currentStage,
      condition: currentCondition,
      id: res.id,
      retry: true,
    })
    clearTempTelemetry()
    setShowSuccess(true)
    successTimerRef.current = window.setTimeout(() => {
      advanceStage()
    }, SUCCESS_NAVIGATE_DELAY_MS)
  }

  const inputLocked = showSuccess || pinAccepted || savingTelemetry

  const onDigit = (digit: string) => {
    if (inputLocked) return
    if (entered.length >= expectedLength) return
    const next = entered + digit
    setEntered(next)
    telemetry.recordKey(digit, 'digit')
    appendTelemetry('pin_key', { key: 'digit', index: next.length - 1 })
    if (next.length === expectedLength) {
      validate(next)
    }
  }

  const onClear = () => {
    if (inputLocked) return
    if (entered.length === 0) return
    setEntered('')
    telemetry.recordKey('CLEAR', 'clear')
    appendTelemetry('pin_key', { key: 'clear' })
  }

  const handleReturn = () => {
    if (inputLocked) return
    // Fail-safe escape hatch: send the participant back to the matching
    // setup stage (e.g. LOW_TEST -> LOW_SETUP) so they can re-read the rule
    // they just learned without being forced to guess attempts. The lock
    // screen unmounts on stage change, so any in-progress entry and the
    // hook-internal keystroke buffer are discarded automatically.
    const target = previousStage(currentStage)
    telemetry.recordKey('RETURN', 'return')
    // Bump the per-phase Return counter *before* navigating: this is the
    // working-memory-failure signal we report alongside the lock-screen
    // metrics, and we want the post-increment value to be visible in the
    // appended telemetry entry below for live-debugging.
    incrementCurrentPhaseReturnCount()
    const nextReturnCount = currentPhaseReturnCount + 1
    appendTelemetry('pin_return', {
      from: currentStage,
      to: target,
      condition: currentCondition,
      enteredLength: entered.length,
      errorCount,
      currentPhaseReturnCount: nextReturnCount,
    })
    setEntered('')
    if (target) {
      setStage(target)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        // Modern mobile browsers report a dynamic viewport that excludes
        // the URL bar; prefer it where supported so the phone never gets
        // clipped beneath the address bar on iOS Safari / Android Chrome.
        '@supports (min-height: 100dvh)': {
          minHeight: '100dvh',
        },
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 30% 0%, #1f2230 0%, #0a0a0c 55%, #050507 100%)',
        padding: '16px',
      }}
    >
      <Paper
        elevation={24}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: PHONE_MAX_WIDTH,
          height: '100%',
          maxHeight: PHONE_MAX_HEIGHT,
          borderRadius: '44px',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow:
            '0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.04)',
          backgroundImage:
            'linear-gradient(180deg, rgba(35,38,55,0.95) 0%, rgba(15,16,22,0.98) 55%, rgba(8,8,12,1) 100%)',
          // Keep the sleek "native device" look by hiding scrollbars
          // even when overflow forces them on smaller viewports.
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': {
            width: '0px',
            height: '0px',
            background: 'transparent',
          },
        }}
      >
        <StatusBar time={formatStatusTime(now)} battery={battery} />

        <Stack
          alignItems="center"
          sx={{
            pt: { xs: 1, sm: 2 },
            pb: { xs: 1, sm: 1.5 },
            px: 3,
            color: 'rgba(255,255,255,0.95)',
          }}
        >
          <Typography
            sx={{
              fontSize: { xs: 56, sm: 76 },
              fontWeight: 200,
              lineHeight: 1,
              letterSpacing: '-0.05em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatLockTime(now)}
          </Typography>
          <Typography
            sx={{
              mt: { xs: 0.5, sm: 1 },
              fontSize: { xs: 14, sm: 16 },
              color: 'rgba(255,255,255,0.7)',
              fontWeight: 400,
              letterSpacing: '0.01em',
            }}
          >
            {formatLockDate(now)}
          </Typography>
        </Stack>

        <Box sx={{ px: 2.5, mt: { xs: 0.25, sm: 0.5 } }}>
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 1.25,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                bgcolor: 'rgba(100,181,246,0.18)',
                color: '#64b5f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChatBubbleRounded sx={{ fontSize: 18 }} />
            </Box>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.95)',
                  lineHeight: 1.2,
                }}
              >
                Messages
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.65)',
                  lineHeight: 1.3,
                }}
                noWrap
              >
                {unreadCount} Unread {unreadCount === 1 ? 'Message' : 'Messages'}
              </Typography>
            </Stack>
            <Typography
              sx={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              now
            </Typography>
          </Paper>
        </Box>

        <Stack
          alignItems="center"
          sx={{
            pt: { xs: 1.25, sm: 2.5 },
            pb: { xs: 0.5, sm: 1 },
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          <LockRounded sx={{ fontSize: 22, color: 'rgba(255,255,255,0.7)' }} />
          <Typography
            sx={{
              mt: { xs: 0.5, sm: 1 },
              fontSize: 12,
              letterSpacing: 2,
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
            }}
          >
            Enter Passcode
          </Typography>
          <Box
            key={`shake-${shakeKey}`}
            sx={{
              animation:
                shakeKey > 0 ? `${shakeAnim} 420ms ease` : 'none',
            }}
          >
            <PinIndicators length={expectedLength} filled={entered.length} />
          </Box>
          {errorCount > 0 && !pinAccepted && !showSuccess && (
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: '#ff6b6b',
                letterSpacing: 0.5,
              }}
            >
              Incorrect passcode · {errorCount}{' '}
              {errorCount === 1 ? 'try' : 'tries'}
            </Typography>
          )}
          {pinAccepted && telemetryError && (
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: '#ffb74d',
                letterSpacing: 0.5,
                textAlign: 'center',
                px: 2,
              }}
            >
              Passcode accepted — saving failed. Tap Retry below.
            </Typography>
          )}
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            rowGap: { xs: 0.75, sm: 1.25 },
            columnGap: { xs: 1.25, sm: 2 },
            px: { xs: 2, sm: 3 },
            pt: { xs: 1, sm: 2 },
            pb: { xs: 2, sm: 3 },
          }}
        >
          {KEYPAD.map((key, idx) => {
            if (key.kind === 'return') {
              return (
                <ActionButton
                  key="return"
                  label="Return"
                  onClick={handleReturn}
                  disabled={inputLocked}
                />
              )
            }
            if (key.kind === 'clear') {
              return (
                <ActionButton
                  key="clear"
                  label="Clear"
                  onClick={onClear}
                  disabled={inputLocked || entered.length === 0}
                />
              )
            }
            return (
              <DigitButton
                key={`d-${key.value}-${idx}`}
                digit={key.value}
                onClick={onDigit}
                disabled={inputLocked}
              />
            )
          })}
        </Box>
      </Paper>

      <Snackbar
        open={showSuccess && !telemetryError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={SUCCESS_NAVIGATE_DELAY_MS}
      >
        <Alert
          severity="success"
          variant="filled"
          icon={<LockRounded />}
          sx={{ borderRadius: 3, fontWeight: 600 }}
        >
          {currentStage === 'BASELINE_TEST'
            ? savingTelemetry
              ? 'Unlocked — saving…'
              : 'Unlocked — continuing'
            : 'Unlocked — opening survey'}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(telemetryError)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        onClose={() => setTelemetryError(null)}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setTelemetryError(null)}
          action={
            canRetryBaseline ? (
              <Button
                color="inherit"
                size="small"
                disabled={savingTelemetry}
                onClick={() => {
                  void retryBaselineTelemetry()
                }}
              >
                {savingTelemetry ? 'Retrying…' : 'Retry'}
              </Button>
            ) : undefined
          }
          sx={{ borderRadius: 3 }}
        >
          {telemetryError}
        </Alert>
      </Snackbar>
    </Box>
  )
}

function StatusBar({ time, battery }: { time: string; battery: number }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        px: 3.5,
        pt: 2.25,
        pb: 0.75,
        color: 'rgba(255,255,255,0.92)',
      }}
    >
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
        }}
      >
        {time}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <SignalCellularAltIcon sx={{ fontSize: 16 }} />
        <WifiIcon sx={{ fontSize: 16 }} />
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 500,
              fontVariantNumeric: 'tabular-nums',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            {battery}%
          </Typography>
          <BatteryFullIcon sx={{ fontSize: 18 }} />
        </Stack>
      </Stack>
    </Stack>
  )
}

function PinIndicators({
  length,
  filled,
}: {
  length: number
  filled: number
}) {
  return (
    <Stack
      direction="row"
      spacing={1.75}
      sx={{ mt: { xs: 1, sm: 2 }, mb: { xs: 0.5, sm: 1 }, minHeight: 16 }}
      aria-label={`PIN ${filled} of ${length} digits entered`}
    >
      {Array.from({ length }).map((_, i) => {
        const isFilled = i < filled
        return (
          <Box
            key={i}
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '1.5px solid rgba(255,255,255,0.6)',
              bgcolor: isFilled ? 'rgba(255,255,255,0.95)' : 'transparent',
              transition: 'background-color 120ms ease, transform 120ms ease',
              transform: isFilled ? 'scale(1.05)' : 'scale(1)',
            }}
          />
        )
      })}
    </Stack>
  )
}

function DigitButton({
  digit,
  onClick,
  disabled,
}: {
  digit: string
  onClick: (d: string) => void
  disabled?: boolean
}) {
  return (
    <Button
      onClick={() => onClick(digit)}
      disabled={disabled}
      sx={{
        width: { xs: 60, sm: 72 },
        height: { xs: 60, sm: 72 },
        minWidth: 0,
        mx: 'auto',
        p: 0,
        borderRadius: '50%',
        color: 'rgba(255,255,255,0.95)',
        bgcolor: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        flexDirection: 'column',
        lineHeight: 1,
        '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
        '&:active': { bgcolor: 'rgba(255,255,255,0.28)' },
        '&.Mui-disabled': {
          color: 'rgba(255,255,255,0.35)',
          bgcolor: 'rgba(255,255,255,0.06)',
        },
      }}
      aria-label={`Digit ${digit}`}
    >
      <Typography
        sx={{
          fontSize: { xs: 24, sm: 28 },
          fontWeight: 400,
          letterSpacing: '0.01em',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {digit}
      </Typography>
    </Button>
  )
}

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: { xs: 60, sm: 72 },
        height: { xs: 60, sm: 72 },
        minWidth: 0,
        mx: 'auto',
        p: 0,
        borderRadius: '50%',
        color: 'rgba(255,255,255,0.9)',
        bgcolor: 'transparent',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: { xs: 12, sm: 13 },
        fontWeight: 500,
        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
        '&:active': { bgcolor: 'rgba(255,255,255,0.14)' },
        '&.Mui-disabled': {
          color: 'rgba(255,255,255,0.3)',
          borderColor: 'rgba(255,255,255,0.04)',
        },
      }}
    >
      {label}
    </Button>
  )
}
