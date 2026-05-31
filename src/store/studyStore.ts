import { create } from 'zustand'
import {
  fetchAlgorithms,
  finalizeParticipant as finalizeParticipantApi,
  initParticipant,
  postTelemetry,
  PredefinedAlgorithm,
  StudyPhase,
  SusAnswers,
  TelemetrySubmission,
} from '../lib/api'
import {
  AlgorithmComplexity,
  conditionForStage,
  isTlxStage,
  nextStage,
  StudyStage,
} from '../lib/stageFlow'
import type { AlgorithmType } from '../lib/pinComposer'

export type { StudyStage } from '../lib/stageFlow'

export type PinCondition = 'Baseline' | 'Low' | 'Medium' | 'High'

export type AlgorithmConfiguration = {
  /**
   * The dynamic-value rule applied during the test phase. Strictly
   * predefined by complexity (Low → MINUTE_DIGIT, Medium → UNREAD_MESSAGES,
   * High → TIME_CROSS_SUM); the participant no longer chooses it.
   */
  algorithmType: AlgorithmType
  /**
   * 0-based index of the single base-PIN digit that is replaced by the
   * algorithm's dynamic value. Always in `[0, BASE_PIN_LENGTH - 1]`
   * (validated by `pinComposer.isValidReplacedIndex`). Exactly one digit
   * is replaced — nothing is appended or prepended.
   */
  replacedIndex: number
}

export type Configurations = {
  low: AlgorithmConfiguration | null
  medium: AlgorithmConfiguration | null
  high: AlgorithmConfiguration | null
}

export type ConfigurationKey = keyof Configurations

export type TelemetryEntry = {
  id: string
  timestamp: number
  event: string
  payload?: Record<string, unknown>
}

export type AlgorithmsCache = Partial<
  Record<AlgorithmComplexity, PredefinedAlgorithm[]>
>

import type { LockScreenMetrics } from '../hooks/useLockScreenTelemetry'

type StudyState = {
  mTurkId: string
  currentStage: StudyStage
  currentCondition: PinCondition
  basePin: string | null
  configurations: Configurations
  algorithmsByComplexity: AlgorithmsCache
  telemetry: TelemetryEntry[]
  /**
   * Holds the six lock-screen metrics for the most recently completed
   * `*_TEST` condition while the participant works through the corresponding
   * `*_TLX` survey. The TLX view merges these metrics with `mTurkId`,
   * `condition`, and the gathered `nasaTlx` ratings, then POSTs the combined
   * payload to /api/telemetry. The slot is cleared only after that POST
   * succeeds.
   */
  tempTelemetry: LockScreenMetrics | null
  /**
   * Count of "Return" presses on the lock screen during the *current*
   * complexity phase. Incremented from `LockScreenView` and surfaced as
   * `returnCount` on the telemetry payload at unlock-success time. The
   * counter persists across the SETUP ↔ TEST bounce within a phase (e.g.
   * LOW_TEST → LOW_SETUP → LOW_TEST keeps accumulating) and only resets to
   * zero when the participant finishes the matching `*_TLX` survey and the
   * stage advances to the next phase (see `advanceStage`).
   */
  currentPhaseReturnCount: number
  /**
   * The participant's answers to the 10 standard System Usability Scale
   * items, captured at the end of Phase 1 (and again at Phase 2 if/when a
   * Day-7 follow-up is added). Each value is an integer 1..5.
   */
  susAnswers: SusAnswers | null
  /**
   * Phase 1 finalization timestamp returned by the backend after a
   * successful POST /api/participant/finalize. `null` until the SUS has
   * been submitted.
   */
  phase1FinalizedAt: string | null
  consentAccepted: boolean
  lastTelemetryPostError: string | null
  lastParticipantInitError: string | null
  lastFinalizeError: string | null

  setMTurkId: (id: string) => void
  setStage: (stage: StudyStage) => void
  advanceStage: () => StudyStage | null
  setBasePin: (pin: string | null) => void
  setConsentAccepted: (accepted: boolean) => void
  setConfiguration: (
    complexity: ConfigurationKey,
    config: AlgorithmConfiguration | null
  ) => void
  appendTelemetry: (event: string, payload?: Record<string, unknown>) => void
  setTempTelemetry: (metrics: LockScreenMetrics | null) => void
  clearTempTelemetry: () => void
  /**
   * Increment `currentPhaseReturnCount` by one. Called by `LockScreenView`
   * right before bouncing the participant back to the matching `*_SETUP`
   * stage so we can count working-memory failures per phase.
   */
  incrementCurrentPhaseReturnCount: () => void
  setSusAnswers: (answers: SusAnswers | null) => void
  resetStudySession: () => void

  loadAlgorithms: (
    complexity: AlgorithmComplexity
  ) => Promise<PredefinedAlgorithm[]>
  registerParticipant: (
    mTurkId: string,
    basePin: string
  ) => Promise<void>
  submitTelemetry: (
    submission: TelemetrySubmission
  ) => Promise<{ ok: boolean; id?: string; error?: string }>
  /**
   * Persists the SUS answers locally and POSTs them to
   * /api/participant/finalize. On success the `phase1FinalizedAt` timestamp
   * is updated and any previous error is cleared.
   */
  finalizeParticipant: (
    answers: SusAnswers,
    options?: { phase?: StudyPhase }
  ) => Promise<{
    ok: boolean
    completedAt?: string
    error?: string
  }>
}

const COMPLEXITY_TO_CONFIG_KEY: Record<AlgorithmComplexity, ConfigurationKey> =
  {
    Low: 'low',
    Medium: 'medium',
    High: 'high',
  }

export function configKeyForComplexity(
  complexity: AlgorithmComplexity
): ConfigurationKey {
  return COMPLEXITY_TO_CONFIG_KEY[complexity]
}

const initialConfigurations: Configurations = {
  low: null,
  medium: null,
  high: null,
}

const initialState = {
  mTurkId: '',
  currentStage: 'ONBOARDING' as StudyStage,
  currentCondition: 'Baseline' as PinCondition,
  basePin: null as string | null,
  configurations: initialConfigurations,
  algorithmsByComplexity: {} as AlgorithmsCache,
  telemetry: [] as TelemetryEntry[],
  tempTelemetry: null as LockScreenMetrics | null,
  currentPhaseReturnCount: 0,
  susAnswers: null as SusAnswers | null,
  phase1FinalizedAt: null as string | null,
  consentAccepted: false,
  lastTelemetryPostError: null as string | null,
  lastParticipantInitError: null as string | null,
  lastFinalizeError: null as string | null,
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const useStudyStore = create<StudyState>((set, get) => ({
  ...initialState,

  setMTurkId: (id) => set({ mTurkId: id }),

  setStage: (stage) =>
    set({
      currentStage: stage,
      currentCondition: conditionForStage(stage) ?? get().currentCondition,
    }),

  advanceStage: () => {
    const current = get().currentStage
    const next = nextStage(current)
    if (!next) return null
    const updates: Partial<StudyState> = {
      currentStage: next,
      currentCondition: conditionForStage(next) ?? get().currentCondition,
    }
    // Only reset the return counter when the participant finishes a TLX
    // survey and crosses into a brand-new phase. Bouncing between *_SETUP
    // and *_TEST via the lock-screen "Return" button uses setStage(), which
    // intentionally leaves this counter untouched so a single phase's
    // working-memory failures accumulate across multiple back-and-forth
    // trips.
    if (isTlxStage(current)) {
      updates.currentPhaseReturnCount = 0
    }
    set(updates)
    return next
  },

  setBasePin: (pin) => set({ basePin: pin }),

  setConsentAccepted: (accepted) => set({ consentAccepted: accepted }),

  setConfiguration: (complexity, config) =>
    set({
      configurations: {
        ...get().configurations,
        [complexity]: config,
      },
    }),

  appendTelemetry: (event, payload) =>
    set({
      telemetry: [
        ...get().telemetry,
        { id: makeId(), timestamp: Date.now(), event, payload },
      ],
    }),

  setTempTelemetry: (submission) => set({ tempTelemetry: submission }),

  clearTempTelemetry: () => set({ tempTelemetry: null }),

  incrementCurrentPhaseReturnCount: () =>
    set({ currentPhaseReturnCount: get().currentPhaseReturnCount + 1 }),

  setSusAnswers: (answers) => set({ susAnswers: answers }),

  resetStudySession: () =>
    set({
      ...initialState,
      configurations: { ...initialConfigurations },
      algorithmsByComplexity: {},
      telemetry: [],
      tempTelemetry: null,
      currentPhaseReturnCount: 0,
      susAnswers: null,
      phase1FinalizedAt: null,
      lastFinalizeError: null,
    }),

  loadAlgorithms: async (complexity) => {
    const cached = get().algorithmsByComplexity[complexity]
    if (cached && cached.length > 0) return cached
    const list = await fetchAlgorithms(complexity)
    set({
      algorithmsByComplexity: {
        ...get().algorithmsByComplexity,
        [complexity]: list,
      },
    })
    return list
  },

  registerParticipant: async (mTurkId, basePin) => {
    try {
      await initParticipant(mTurkId, basePin)
      set({
        mTurkId,
        basePin,
        lastParticipantInitError: null,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to register participant'
      set({ lastParticipantInitError: message })
      throw err
    }
  },

  submitTelemetry: async (submission) => {
    try {
      const res = await postTelemetry(submission)
      set({ lastTelemetryPostError: null })
      return { ok: true, id: res.id }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to post telemetry'
      set({ lastTelemetryPostError: message })
      return { ok: false, error: message }
    }
  },

  finalizeParticipant: async (answers, options) => {
    const phase: StudyPhase = options?.phase ?? 'day1'
    set({ susAnswers: answers })
    const mTurkId = get().mTurkId
    if (!mTurkId) {
      const message = 'mTurkId is missing; cannot finalize participant'
      set({ lastFinalizeError: message })
      return { ok: false, error: message }
    }
    try {
      const res = await finalizeParticipantApi({
        mTurkId,
        susAnswers: answers,
        phase,
      })
      const updates: Partial<StudyState> = { lastFinalizeError: null }
      if (phase === 'day1') {
        updates.phase1FinalizedAt = res.completedAt
      }
      set(updates)
      return { ok: true, completedAt: res.completedAt }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to finalize participant'
      set({ lastFinalizeError: message })
      return { ok: false, error: message }
    }
  },
}))

export function conditionInstructionLabel(condition: PinCondition): string {
  switch (condition) {
    case 'Baseline':
      return 'Static PIN'
    case 'Low':
      return 'Low Complexity Algorithmic PIN'
    case 'Medium':
      return 'Medium Complexity Algorithmic PIN'
    case 'High':
      return 'High Complexity Algorithmic PIN'
    default:
      return condition
  }
}
