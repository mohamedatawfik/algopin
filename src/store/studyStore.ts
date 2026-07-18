import { create } from 'zustand'
import {
  AttentionCheck,
  Demographics,
  emptyAttentionCheck,
  emptyDemographics,
  fetchAlgorithms,
  finalizeParticipant as finalizeParticipantApi,
  initParticipant,
  postTelemetry,
  PredefinedAlgorithm,
  StudyPhase,
  SusAnswers,
  SusAnswersPerCondition,
  TamAnswers,
  TelemetrySubmission,
} from '../lib/api'
import {
  AlgorithmComplexity,
  conditionForStage,
  isConditionClosingStage,
  nextStage,
  StudyStage,
} from '../lib/stageFlow'
import type { AlgorithmType } from '../lib/pinComposer'

export type { StudyStage } from '../lib/stageFlow'

export type PinCondition = 'Baseline' | 'Low' | 'Medium' | 'High'

export type AlgorithmConfiguration = {
  /**
   * The dynamic-value rule applied during the test phase. Strictly
   * predefined by complexity (Low → MINUTE_DIGIT,
   * Medium → MINUTE_PLUS_BATTERY, High → MINUTE_PLUS_TRIPLE_BATTERY);
   * the participant does not choose it.
   *
   * The replaced digit is *not* stored here — it is a global constant
   * (`LOCKED_REPLACED_INDEX` in `pinComposer`) fixed to the trailing
   * digit for every participant, so there is nothing per-user to track.
   */
  algorithmType: AlgorithmType
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

/**
 * The per-condition telemetry accumulator held in `tempTelemetry`. It
 * starts as a full `LockScreenMetrics` snapshot written by
 * `LockScreenView` at unlock-success time, then grows by one nested
 * survey subdoc each time the participant submits a survey for the same
 * condition:
 *
 *   TEST -> writes LockScreenMetrics
 *   TAM  -> appends `tam` (named-field subdoc: item1..item5, each 1..7)
 *   SUS  -> appends `sus` (named-field subdoc: item1..item10, each 1..5)
 *
 * Baseline skips TAM/SUS: `LockScreenView` POSTs lock-screen metrics
 * directly after BASELINE_TEST. For algorithmic conditions,
 * `SusSurveyView` merges `mTurkId` + `condition` into this accumulator,
 * POSTs the combined payload to /api/telemetry, and only on a successful
 * write calls `clearTempTelemetry()`. The outer `Partial<>` exists so a
 * defensive `SusSurveyView` retry doesn't require a full
 * `LockScreenMetrics` snapshot to be present.
 */
export type TempTelemetryPayload = Partial<LockScreenMetrics> & {
  tam?: TamAnswers
  sus?: SusAnswersPerCondition
}

type StudyState = {
  mTurkId: string
  currentStage: StudyStage
  currentCondition: PinCondition
  basePin: string | null
  configurations: Configurations
  algorithmsByComplexity: AlgorithmsCache
  telemetry: TelemetryEntry[]
  /**
   * The per-condition telemetry accumulator (see `TempTelemetryPayload`).
   * Written first by `LockScreenView` at unlock success. For algorithmic
   * conditions it is then extended with `tam` by `TamSurveyView` and
   * `sus` by `SusSurveyView`; the `*_SUS` submission POSTs the merged
   * payload. For Baseline, `LockScreenView` POSTs metrics immediately
   * (no surveys). The slot is cleared only after a successful POST.
   */
  tempTelemetry: TempTelemetryPayload | null
  /**
   * Count of "Return" presses on the lock screen during the *current*
   * complexity phase. Incremented from `LockScreenView` and surfaced as
   * `returnCount` on the telemetry payload at unlock-success time. The
   * counter persists across the SETUP ↔ TEST bounce within a phase (e.g.
   * LOW_TEST → LOW_SETUP → LOW_TEST keeps accumulating) and only resets to
   * zero when the participant finishes the matching condition
   * (`BASELINE_TEST` or `*_SUS`) and the stage advances into the next
   * phase (see `advanceStage`).
   */
  currentPhaseReturnCount: number
  /**
   * The participant's answers to the 10 standard System Usability Scale
   * items, captured at the end of Phase 1 (and again at Phase 2 if/when a
   * Day-7 follow-up is added). Each value is an integer 1..5.
   */
  susAnswers: SusAnswers | null
  /**
   * Self-reported demographics captured in the DEMOGRAPHICS phase
   * (between ONBOARDING and STATIC_SETUP). Initialised to an empty
   * `Demographics` record on session reset and mutated in place by
   * `setDemographics`.
   */
  demographics: Demographics
  /**
   * Attention-check probe captured inline at the top of `CompletionView`
   * (birth-year re-verification). Initialised to an empty record on
   * session reset and mutated in place by `setAttentionCheck`.
   */
  attentionCheck: AttentionCheck
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
  setTempTelemetry: (payload: TempTelemetryPayload | null) => void
  clearTempTelemetry: () => void
  /**
   * Increment `currentPhaseReturnCount` by one. Called by `LockScreenView`
   * right before bouncing the participant back to the matching `*_SETUP`
   * stage so we can count working-memory failures per phase.
   */
  incrementCurrentPhaseReturnCount: () => void
  setSusAnswers: (answers: SusAnswers | null) => void
  /**
   * Merge a partial update into the current `demographics` record. Fields
   * omitted from `update` are preserved; call with the full object to
   * overwrite atomically.
   */
  setDemographics: (update: Partial<Demographics>) => void
  /**
   * Merge a partial update into the current `attentionCheck` record.
   */
  setAttentionCheck: (update: Partial<AttentionCheck>) => void
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
   * POSTs the MTurk completion code (and, if a legacy caller still has
   * them, the Day-1 SUS answers) to /api/participant/finalize. On success
   * the `phase1FinalizedAt` timestamp is updated and any previous error
   * is cleared. Demographics and attention-check data are pulled from the
   * store automatically so callers don't have to thread them through.
   */
  finalizeParticipant: (args: {
    completionCode: string
    susAnswers?: SusAnswers
    phase?: StudyPhase
  }) => Promise<{
    ok: boolean
    completedAt?: string
    completionCode?: string
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
  tempTelemetry: null as TempTelemetryPayload | null,
  currentPhaseReturnCount: 0,
  susAnswers: null as SusAnswers | null,
  demographics: emptyDemographics(),
  attentionCheck: emptyAttentionCheck(),
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
    // Reset the return counter when the participant finishes a condition
    // (BASELINE_TEST POSTs metrics itself; algorithmic conditions close
    // on *_SUS). Bouncing between *_SETUP and *_TEST via the lock-screen
    // "Return" button uses setStage(), which intentionally leaves this
    // counter untouched so a single phase's working-memory failures
    // accumulate across multiple back-and-forth trips.
    if (isConditionClosingStage(current)) {
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

  setDemographics: (update) =>
    set({ demographics: { ...get().demographics, ...update } }),

  setAttentionCheck: (update) =>
    set({ attentionCheck: { ...get().attentionCheck, ...update } }),

  resetStudySession: () =>
    set({
      ...initialState,
      configurations: { ...initialConfigurations },
      algorithmsByComplexity: {},
      telemetry: [],
      tempTelemetry: null,
      currentPhaseReturnCount: 0,
      susAnswers: null,
      demographics: emptyDemographics(),
      attentionCheck: emptyAttentionCheck(),
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

  finalizeParticipant: async ({ completionCode, susAnswers, phase }) => {
    const effectivePhase: StudyPhase = phase ?? 'day1'
    if (susAnswers) set({ susAnswers })
    const mTurkId = get().mTurkId
    if (!mTurkId) {
      const message = 'mTurkId is missing; cannot finalize participant'
      set({ lastFinalizeError: message })
      return { ok: false, error: message }
    }
    try {
      const { demographics, attentionCheck } = get()
      const res = await finalizeParticipantApi({
        mTurkId,
        completionCode,
        ...(susAnswers ? { susAnswers } : {}),
        phase: effectivePhase,
        demographics,
        attentionCheck,
      })
      const updates: Partial<StudyState> = { lastFinalizeError: null }
      if (effectivePhase === 'day1') {
        updates.phase1FinalizedAt = res.completedAt
      }
      set(updates)
      return {
        ok: true,
        completedAt: res.completedAt,
        completionCode: res.completionCode,
      }
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
