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
import { useLockScreenTelemetry } from '../hooks/useLockScreenTelemetry'
import { calculateExpectedPin, getCanonicalType } from '../lib/pinComposer'
import { useStudyStore } from '../store/studyStore'

const PHONE_MAX_WIDTH = 400
const PHONE_MAX_HEIGHT = 850
const SUCCESS_NAVIGATE_DELAY_MS = 900
const SKIP_AFTER_FAILURES = 5

type KeySpec =
  | { kind: 'digit'; value: string }
  | { kind: 'clear' }
  | { kind: 'spacer' }

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
  { kind: 'spacer' },
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

/**
 * The Phase 2 recall test. Rendered three times — once per complexity
 * (LOW_TEST, MED_TEST, HIGH_TEST), each preceded by a named transition
 * screen — with the rule for the
 * current stage applied to the trailing digit of the participant's base
 * PIN.
 *
 * The screen deliberately shows no rule text, no worked example and no
 * reminder of which complexity is being tested: recalling the rule from
 * the first session unaided is exactly what we are measuring. The only
 * affordances are the clock and battery readout in the phone chrome,
 * which are the rules' inputs, and the failsafe that appears after
 * `SKIP_AFTER_FAILURES` incorrect attempts.
 *
 * Results are held in the store and POSTed once from `CompletionView`;
 * this view never talks to the network.
 */
export function LockScreenView() {
  const {
    basePin: storedBasePin,
    currentCondition,
    currentStage,
    prolificId,
    appendTelemetry,
    advanceStage,
    recordTestResult,
  } = useStudyStore()
  const basePin = storedBasePin ?? ''
  const [now, setNow] = useState(() => new Date())
  const [entered, setEntered] = useState<string>('')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [shakeKey, setShakeKey] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  /** True once the PIN matched. */
  const [pinAccepted, setPinAccepted] = useState(false)
  /** True once the participant used the 5-failure skip failsafe. */
  const [skipping, setSkipping] = useState(false)

  const successTimerRef = useRef<number | null>(null)
  const telemetry = useLockScreenTelemetry()

  const battery = useMemo(() => randomInRange(20, 90), [])
  const unreadCount = useMemo(() => randomInRange(1, 9), [])

  // Phase 2 has no setup screen, so the rule is always the canonical one
  // for the stage's complexity rather than something read back from a
  // per-participant configuration.
  const algorithmType = useMemo(
    () => getCanonicalType(currentCondition),
    [currentCondition]
  )

  const expectedPin = useMemo(
    () =>
      calculateExpectedPin(basePin, currentStage, algorithmType, {
        date: now,
        batteryLevel: battery,
      }),
    [basePin, currentStage, algorithmType, now, battery]
  )

  const expectedLength = expectedPin.length

  useEffect(() => {
    appendTelemetry('lock_screen_opened', {
      stage: currentStage,
      condition: currentCondition,
      basePin,
      unreadCount,
      batteryLevel: battery,
    })
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [
    appendTelemetry,
    basePin,
    currentCondition,
    currentStage,
    unreadCount,
    battery,
  ])

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current)
      }
    }
  }, [])

  const validate = useCallback(
    (attempt: string) => {
      const target = calculateExpectedPin(basePin, currentStage, algorithmType, {
        date: new Date(),
        batteryLevel: battery,
      })
      const ok = attempt === target
      appendTelemetry('pin_attempt', {
        correct: ok,
        attemptLength: attempt.length,
        expectedLength: target.length,
        condition: currentCondition,
      })
      if (ok) {
        const metrics = telemetry.recordSuccess({
          prolificId,
          currentCondition,
          currentStage,
          expectedPin: target,
        })
        appendTelemetry('pin_success', {
          errorCount: metrics.errorCount,
          totalAuthTime: metrics.totalAuthTime,
          timeToFirstTouch: metrics.timeToFirstTouch,
        })
        recordTestResult(currentCondition, metrics)
        setPinAccepted(true)
        setShowSuccess(true)
        successTimerRef.current = window.setTimeout(() => {
          window.scrollTo(0, 0)
          advanceStage()
        }, SUCCESS_NAVIGATE_DELAY_MS)
      } else {
        const nextErrors = failedAttempts + 1
        setFailedAttempts(nextErrors)
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
      algorithmType,
      appendTelemetry,
      basePin,
      battery,
      currentCondition,
      currentStage,
      failedAttempts,
      prolificId,
      recordTestResult,
      telemetry,
    ]
  )

  const handleSkip = useCallback(() => {
    if (showSuccess || pinAccepted || skipping) return
    if (failedAttempts < SKIP_AFTER_FAILURES) return

    const target = calculateExpectedPin(basePin, currentStage, algorithmType, {
      date: new Date(),
      batteryLevel: battery,
    })
    const metrics = telemetry.recordSkip({
      prolificId,
      currentCondition,
      currentStage,
      expectedPin: target,
    })
    appendTelemetry('pin_skipped', {
      errorCount: metrics.errorCount,
      totalAuthTime: metrics.totalAuthTime,
    })
    recordTestResult(currentCondition, metrics)
    setSkipping(true)
    successTimerRef.current = window.setTimeout(() => {
      window.scrollTo(0, 0)
      advanceStage()
    }, SUCCESS_NAVIGATE_DELAY_MS)
  }, [
    advanceStage,
    algorithmType,
    appendTelemetry,
    basePin,
    battery,
    currentCondition,
    currentStage,
    failedAttempts,
    pinAccepted,
    prolificId,
    recordTestResult,
    showSuccess,
    skipping,
    telemetry,
  ])

  const inputLocked = showSuccess || pinAccepted || skipping

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
              animation: shakeKey > 0 ? `${shakeAnim} 420ms ease` : 'none',
            }}
          >
            <PinIndicators length={expectedLength} filled={entered.length} />
          </Box>
          {failedAttempts > 0 && !pinAccepted && !showSuccess && !skipping && (
            <Typography
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: '#ff6b6b',
                letterSpacing: 0.5,
              }}
            >
              Incorrect passcode · {failedAttempts}{' '}
              {failedAttempts === 1 ? 'try' : 'tries'}
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
            if (key.kind === 'spacer') {
              // Phase 2 has nothing to return to, so the bottom-left slot
              // stays empty rather than offering a dead control.
              return <Box key="spacer" />
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
        {failedAttempts >= SKIP_AFTER_FAILURES &&
          !pinAccepted &&
          !showSuccess &&
          !skipping && (
            <Stack
              alignItems="center"
              spacing={0.5}
              sx={{ px: 3, pb: { xs: 2, sm: 2.5 } }}
            >
              <Typography
                variant="caption"
                color="error"
                sx={{ textAlign: 'center' }}
              >
                You have entered an incorrect PIN 5 times. You may skip ahead if
                you are unable to recall the PIN.
              </Typography>
              <Button
                variant="text"
                color="error"
                onClick={handleSkip}
                disabled={inputLocked}
              >
                I am stuck - Skip to Next Step
              </Button>
            </Stack>
          )}
      </Paper>

      <Snackbar
        open={showSuccess}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        autoHideDuration={SUCCESS_NAVIGATE_DELAY_MS}
      >
        <Alert
          severity="success"
          variant="filled"
          icon={<LockRounded />}
          sx={{ borderRadius: 3, fontWeight: 600 }}
        >
          {currentStage === 'HIGH_TEST'
            ? 'Unlocked — finishing up'
            : 'Unlocked — continuing'}
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
