import { create } from 'zustand'
import type { LockScreenMetrics } from '../hooks/useLockScreenTelemetry'
import {
  formatApiErrorMessage,
  initParticipant,
  Phase2Submission,
  Phase2TestResult,
  postTelemetry,
} from '../lib/api'
import {
  conditionForStage,
  nextStage,
  resultKeyForCondition,
  StudyStage,
  TestResultKey,
} from '../lib/stageFlow'

export type { StudyStage } from '../lib/stageFlow'

/**
 * Phase 2 only re-tests the three algorithmic rules. There is no
 * Baseline / static condition in the follow-up session.
 */
export type PinCondition = 'Low' | 'Medium' | 'High'

export type TelemetryEntry = {
  id: string
  timestamp: number
  event: string
  payload?: Record<string, unknown>
}

export type Phase2TestResults = Record<TestResultKey, Phase2TestResult | null>

type StudyState = {
  prolificId: string
  /**
   * The 4-digit base PIN the participant types on the welcome screen —
   * either recalled from Phase 1 or freshly chosen for today. Every
   * recall test derives its expected PIN from this value.
   */
  basePin: string | null
  currentStage: StudyStage
  currentCondition: PinCondition
  /**
   * Lock-screen outcomes for the three recall tests, filled in as the
   * participant works through TRANSITION_LOW -> LOW_TEST ->
   * TRANSITION_MED -> MED_TEST -> TRANSITION_HIGH -> HIGH_TEST. These
   * are held client-side and shipped in a single POST from
   * `CompletionView`.
   */
  testResults: Phase2TestResults
  /** In-memory event trail; useful for pilot debugging, never POSTed. */
  telemetry: TelemetryEntry[]
  lastSubmitError: string | null

  setProlificId: (id: string) => void
  setBasePin: (pin: string | null) => void
  /**
   * Capture the welcome-screen inputs and register the participant the
   * same way Phase 1 did via `/api/participant/init`.
   */
  startPhase2: (
    prolificId: string,
    basePin: string
  ) => Promise<{ ok: boolean; error?: string }>
  setStage: (stage: StudyStage) => void
  advanceStage: () => StudyStage | null
  appendTelemetry: (event: string, payload?: Record<string, unknown>) => void
  recordTestResult: (
    condition: PinCondition,
    metrics: LockScreenMetrics
  ) => void
  resetStudySession: () => void
  /**
   * The Phase 2 telemetry write. POSTs `prolificId`, `prolificCode`,
   * `basePin` and the three test-result slots to `/api/telemetry`, which
   * saves a `TelemetryLog` document (and finalizes the `Participant`).
   */
  submitPhase2: (
    prolificCode: string
  ) => Promise<{ ok: boolean; id?: string; error?: string }>
}

const emptyTestResults = (): Phase2TestResults => ({
  lowTest: null,
  mediumTest: null,
  highTest: null,
})

const initialState = {
  prolificId: '',
  basePin: null as string | null,
  currentStage: 'PHASE2_WELCOME' as StudyStage,
  currentCondition: 'Low' as PinCondition,
  testResults: emptyTestResults(),
  telemetry: [] as TelemetryEntry[],
  lastSubmitError: null as string | null,
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useStudyStore = create<StudyState>((set, get) => ({
  ...initialState,

  setProlificId: (id) => set({ prolificId: id }),

  setBasePin: (pin) => set({ basePin: pin }),

  startPhase2: async (prolificId, basePin) => {
    const trimmedId = prolificId.trim()
    try {
      await initParticipant(trimmedId, basePin)
      set({ prolificId: trimmedId, basePin, lastSubmitError: null })
      return { ok: true }
    } catch (err) {
      const message = formatApiErrorMessage(
        err,
        'Failed to start the study. Please try again.'
      )
      set({ lastSubmitError: message })
      return { ok: false, error: message }
    }
  },

  setStage: (stage) =>
    set({
      currentStage: stage,
      currentCondition: conditionForStage(stage) ?? get().currentCondition,
    }),

  advanceStage: () => {
    const next = nextStage(get().currentStage)
    if (!next) return null
    set({
      currentStage: next,
      currentCondition: conditionForStage(next) ?? get().currentCondition,
    })
    return next
  },

  appendTelemetry: (event, payload) =>
    set({
      telemetry: [
        ...get().telemetry,
        { id: makeId(), timestamp: Date.now(), event, payload },
      ],
    }),

  recordTestResult: (condition, metrics) =>
    set({
      testResults: {
        ...get().testResults,
        [resultKeyForCondition(condition)]: metrics,
      },
    }),

  resetStudySession: () =>
    set({ ...initialState, testResults: emptyTestResults(), telemetry: [] }),

  submitPhase2: async (prolificCode) => {
    const { prolificId, basePin, testResults } = get()
    if (!prolificId) {
      const message =
        'Your Prolific ID is missing; please reload the study from the original link.'
      set({ lastSubmitError: message })
      return { ok: false, error: message }
    }
    const submission: Phase2Submission = {
      prolificId,
      prolificCode,
      basePin: basePin ?? '',
      lowTest: testResults.lowTest,
      mediumTest: testResults.mediumTest,
      highTest: testResults.highTest,
    }
    console.log('Submitting payload:', submission)
    try {
      const res = await postTelemetry(submission)
      set({ lastSubmitError: null })
      return { ok: true, id: res.id }
    } catch (err) {
      const message = formatApiErrorMessage(
        err,
        'Failed to submit your Phase 2 results'
      )
      set({ lastSubmitError: message })
      return { ok: false, error: message }
    }
  },
}))
