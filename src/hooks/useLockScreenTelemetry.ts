import { useCallback, useRef, useState } from 'react'
import type { StudyStage } from '../lib/stageFlow'
import type { PinCondition } from '../store/studyStore'

export type KeyEventKind = 'digit' | 'clear' | 'cancel'

export type Keystroke = {
  key: string
  kind: KeyEventKind
  timestamp: number
}

export type LockScreenSubmission = {
  schemaVersion: 1
  mTurkId: string
  currentCondition: PinCondition
  currentStage: StudyStage
  expectedPin: string
  expectedPinLength: number
  renderTimestamp: number
  firstTouchTimestamp: number | null
  timeToFirstTouch: number | null
  totalAuthTime: number
  keystrokeLog: Keystroke[]
  errorCount: number
  submittedErrors: string[]
  completedAt: number
}

export const LOCK_SCREEN_TELEMETRY_STORAGE_KEY = 'lockscreen_telemetry_v1'

export type LockScreenSuccessMeta = {
  mTurkId: string
  currentCondition: PinCondition
  currentStage: StudyStage
  expectedPin: string
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
