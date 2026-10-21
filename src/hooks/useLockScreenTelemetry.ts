import { useCallback, useRef, useState } from 'react'
import type { PinCondition } from '../store/studyStore'

export type KeyEventKind = 'digit' | 'clear' | 'cancel'

export type Keystroke = {
  key: string
  kind: KeyEventKind
  timestamp: number
}

/**
 * The lock-screen performance record captured when a Phase 2 recall test
 * ends — either because the PIN matched or because the participant used
 * the 5-failure skip failsafe. `LockScreenView` hands this to the store,
 * which parks it in the matching `lowTest` / `mediumTest` / `highTest`
 * slot. Nothing is POSTed until the terminal `CompletionView`.
 *
 * Structurally identical to `Phase2TestResult` in `lib/api.ts`, which is
 * what ends up on the wire.
 */
export type LockScreenMetrics = {
  condition: PinCondition
  expectedPin: string
  expectedPinLength: number
  renderTimestamp: number
  firstTouchTimestamp: number | null
  timeToFirstTouch: number | null
  totalAuthTime: number
  errorCount: number
  submittedErrors: string[]
  keystrokeLog: Keystroke[]
  /**
   * True when the participant used the 5-failure skip failsafe instead
   * of entering the correct PIN. Default false on a matching unlock.
   */
  skipped: boolean
  /**
   * True only when the entered PIN matched. Skip persists this as false
   * so a failed-and-skipped attempt is never counted as an unlock.
   */
  success: boolean
  completedAt: number
}

/**
 * The full localStorage-persisted snapshot of a finished test. A superset
 * of `LockScreenMetrics` that additionally records identity and stage for
 * offline audits during pilot runs.
 */
export type LockScreenSubmission = LockScreenMetrics & {
  schemaVersion: 2
  prolificId: string
  currentStage: string
}

export const LOCK_SCREEN_TELEMETRY_STORAGE_KEY = 'lockscreen_telemetry_v2'

export type LockScreenOutcomeMeta = {
  prolificId: string
  currentCondition: PinCondition
  currentStage: string
  expectedPin: string
}

export type UseLockScreenTelemetryApi = {
  renderTimestamp: number
  recordKey: (key: string, kind: KeyEventKind) => void
  recordError: (submitted: string) => void
  recordSuccess: (meta: LockScreenOutcomeMeta) => LockScreenMetrics
  recordSkip: (meta: LockScreenOutcomeMeta) => LockScreenMetrics
  reset: () => void
}

export function useLockScreenTelemetry(): UseLockScreenTelemetryApi {
  const [renderTimestamp, setRenderTimestamp] = useState<number>(() =>
    Date.now()
  )

  const firstTouchTimestampRef = useRef<number | null>(null)
  const keystrokeLogRef = useRef<Keystroke[]>([])
  const errorCountRef = useRef<number>(0)
  const submittedErrorsRef = useRef<string[]>([])

  const recordKey = useCallback((key: string, kind: KeyEventKind) => {
    const now = Date.now()
    keystrokeLogRef.current.push({ key, kind, timestamp: now })
    if (kind === 'digit' && firstTouchTimestampRef.current === null) {
      firstTouchTimestampRef.current = now
    }
  }, [])

  const recordError = useCallback((submitted: string) => {
    errorCountRef.current += 1
    submittedErrorsRef.current.push(submitted)
  }, [])

  const recordOutcome = useCallback(
    (meta: LockScreenOutcomeMeta, skipped: boolean): LockScreenMetrics => {
      const completedAt = Date.now()
      const firstTouch = firstTouchTimestampRef.current
      const metrics: LockScreenMetrics = {
        condition: meta.currentCondition,
        expectedPin: meta.expectedPin,
        expectedPinLength: meta.expectedPin.length,
        renderTimestamp,
        firstTouchTimestamp: firstTouch,
        timeToFirstTouch:
          firstTouch !== null ? firstTouch - renderTimestamp : null,
        totalAuthTime: completedAt - renderTimestamp,
        errorCount: errorCountRef.current,
        submittedErrors: [...submittedErrorsRef.current],
        keystrokeLog: [...keystrokeLogRef.current],
        skipped,
        success: !skipped,
        completedAt,
      }
      persistLockScreenSubmission({
        ...metrics,
        schemaVersion: 2,
        prolificId: meta.prolificId,
        currentStage: meta.currentStage,
      })
      return metrics
    },
    [renderTimestamp]
  )

  const recordSuccess = useCallback(
    (meta: LockScreenOutcomeMeta): LockScreenMetrics =>
      recordOutcome(meta, false),
    [recordOutcome]
  )

  const recordSkip = useCallback(
    (meta: LockScreenOutcomeMeta): LockScreenMetrics =>
      recordOutcome(meta, true),
    [recordOutcome]
  )

  const reset = useCallback(() => {
    firstTouchTimestampRef.current = null
    keystrokeLogRef.current = []
    errorCountRef.current = 0
    submittedErrorsRef.current = []
    setRenderTimestamp(Date.now())
  }, [])

  return {
    renderTimestamp,
    recordKey,
    recordError,
    recordSuccess,
    recordSkip,
    reset,
  }
}

export function persistLockScreenSubmission(
  submission: LockScreenSubmission
): void {
  // Console.log so investigators can spot-check during pilot runs.
  console.log('[LockScreenTelemetry]', submission)

  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(LOCK_SCREEN_TELEMETRY_STORAGE_KEY)
    const list: LockScreenSubmission[] = raw ? JSON.parse(raw) : []
    list.push(submission)
    window.localStorage.setItem(
      LOCK_SCREEN_TELEMETRY_STORAGE_KEY,
      JSON.stringify(list)
    )
  } catch (err) {
    console.warn('[LockScreenTelemetry] failed to persist submission', err)
  }
}

export function readLockScreenSubmissions(): LockScreenSubmission[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOCK_SCREEN_TELEMETRY_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LockScreenSubmission[]) : []
  } catch {
    return []
  }
}

export function clearLockScreenSubmissions(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(LOCK_SCREEN_TELEMETRY_STORAGE_KEY)
}
