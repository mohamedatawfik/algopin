import { useCallback, useRef, useState } from 'react'
import type { StudyStage } from '../lib/stageFlow'
import type { PinCondition } from '../store/studyStore'

export type KeyEventKind = 'digit' | 'clear' | 'cancel' | 'return'

export type Keystroke = {
  key: string
  kind: KeyEventKind
  timestamp: number
}

/**
 * The minimal lock-screen-side performance object captured at unlock-success
 * time. This is the base shape that gets stashed in
 * `studyStore.tempTelemetry` while the participant fills in the matching
 * `*_TAM` and `*_SUS` surveys for the same condition. Those two survey
 * views append their `tam` and `sus` subdocs to the same slot; the SUS
 * view then merges in `mTurkId` and `condition` before POSTing the full
 * payload to /api/telemetry.
 */
export type LockScreenMetrics = {
  renderTimestamp: number
  timeToFirstTouch: number | null
  totalAuthTime: number
  errorCount: number
  /**
   * Number of times the participant pressed the lock-screen "Return"
   * button during the current complexity phase. Counted by the global
   * store (`currentPhaseReturnCount`) and snapshotted into the metrics
   * here at unlock-success time. Accumulates across SETUP ↔ TEST bounces
   * within a single phase; the store resets it only after the matching
   * `*_SUS` survey is submitted (see `advanceStage` in `studyStore.ts`).
   */
  returnCount: number
  submittedErrors: string[]
  keystrokeLog: Keystroke[]
}

/**
 * The full localStorage-persisted snapshot of a successful unlock. It is a
 * superset of `LockScreenMetrics` and additionally records identity,
 * stage/condition context, and the resolved expected PIN for offline audits.
 */
export type LockScreenSubmission = LockScreenMetrics & {
  schemaVersion: 1
  mTurkId: string
  currentCondition: PinCondition
  currentStage: StudyStage
  expectedPin: string
  expectedPinLength: number
  firstTouchTimestamp: number | null
  completedAt: number
}

export const LOCK_SCREEN_TELEMETRY_STORAGE_KEY = 'lockscreen_telemetry_v1'

export type LockScreenSuccessMeta = {
  mTurkId: string
  currentCondition: PinCondition
  currentStage: StudyStage
  expectedPin: string
  /**
   * Snapshot of `currentPhaseReturnCount` from the global store taken at
   * unlock-success time. Persisted alongside the rest of the metrics so an
   * offline audit of localStorage carries the working-memory signal too.
   */
  returnCount: number
}

export type UseLockScreenTelemetryApi = {
  renderTimestamp: number
  recordKey: (key: string, kind: KeyEventKind) => void
  recordError: (submitted: string) => void
  recordSuccess: (meta: LockScreenSuccessMeta) => LockScreenSubmission
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

  const recordSuccess = useCallback(
    (meta: LockScreenSuccessMeta): LockScreenSubmission => {
      const completedAt = Date.now()
      const firstTouch = firstTouchTimestampRef.current
      const submission: LockScreenSubmission = {
        schemaVersion: 1,
        mTurkId: meta.mTurkId,
        currentCondition: meta.currentCondition,
        currentStage: meta.currentStage,
        expectedPin: meta.expectedPin,
        expectedPinLength: meta.expectedPin.length,
        renderTimestamp,
        firstTouchTimestamp: firstTouch,
        timeToFirstTouch:
          firstTouch !== null ? firstTouch - renderTimestamp : null,
        totalAuthTime: completedAt - renderTimestamp,
        keystrokeLog: [...keystrokeLogRef.current],
        errorCount: errorCountRef.current,
        returnCount: meta.returnCount,
        submittedErrors: [...submittedErrorsRef.current],
        completedAt,
      }
      persistLockScreenSubmission(submission)
      return submission
    },
    [renderTimestamp]
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
    reset,
  }
}

export function persistLockScreenSubmission(
  submission: LockScreenSubmission
): void {
  // Console.log so investigators can spot-check during pilot runs.
  // Structured for direct ingestion by a future POST endpoint.
  // eslint-disable-next-line no-console
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
    // eslint-disable-next-line no-console
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
