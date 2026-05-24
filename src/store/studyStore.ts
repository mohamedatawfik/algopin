import { create } from 'zustand'
import {
  fetchAlgorithms,
  initParticipant,
  postTelemetry,
  PredefinedAlgorithm,
} from '../lib/api'
import {
  AlgorithmComplexity,
  conditionForStage,
  nextStage,
  StudyStage,
} from '../lib/stageFlow'

export type { StudyStage } from '../lib/stageFlow'

export type PinCondition = 'Baseline' | 'Low' | 'Medium' | 'High'

/**
 * Indices (0-based) of the base PIN digits that are replaced by the
 * algorithm's dynamic value. Length is constrained to 1..3 by
 * `pinComposer.MIN_DYNAMIC_POSITIONS` / `MAX_DYNAMIC_POSITIONS`.
 */
export type DynamicPositions = number[]

export type AlgorithmConfiguration = {
  algorithmId: string
  dynamicPositions: DynamicPositions
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

import type { LockScreenSubmission } from '../hooks/useLockScreenTelemetry'

type StudyState = {
  mTurkId: string
  currentStage: StudyStage
  currentCondition: PinCondition
  basePin: string | null
  configurations: Configurations
  algorithmsByComplexity: AlgorithmsCache
  telemetry: TelemetryEntry[]
  consentAccepted: boolean
  lastTelemetryPostError: string | null
  lastParticipantInitError: string | null

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
  resetStudySession: () => void

  loadAlgorithms: (
    complexity: AlgorithmComplexity
  ) => Promise<PredefinedAlgorithm[]>
  registerParticipant: (
    mTurkId: string,
    basePin: string
  ) => Promise<void>
  submitTelemetry: (
    submission: LockScreenSubmission
  ) => Promise<{ ok: boolean; id?: string; error?: string }>
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
  consentAccepted: false,
  lastTelemetryPostError: null as string | null,
  lastParticipantInitError: null as string | null,
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
    const next = nextStage(get().currentStage)
    if (!next) return null
    set({
      currentStage: next,
      currentCondition: conditionForStage(next) ?? get().currentCondition,
    })
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

  resetStudySession: () =>
    set({
      ...initialState,
      configurations: { ...initialConfigurations },
      algorithmsByComplexity: {},
      telemetry: [],
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
