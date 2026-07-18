import type { PinCondition } from '../store/studyStore'

export type StudyStage =
  | 'ONBOARDING'
  | 'DEMOGRAPHICS'
  | 'STATIC_SETUP'
  | 'BASELINE_TEST'
  | 'ALGO_INTRO'
  | 'LOW_SETUP'
  | 'LOW_TEST'
  | 'LOW_TAM'
  | 'LOW_SUS'
  | 'MED_SETUP'
  | 'MED_TEST'
  | 'MED_TAM'
  | 'MED_SUS'
  | 'HIGH_SETUP'
  | 'HIGH_TEST'
  | 'HIGH_TAM'
  | 'HIGH_SUS'
  | 'COMPLETION'

/**
 * Canonical study pipeline. Baseline skips TAM/SUS: BASELINE_TEST POSTs
 * lock-screen metrics and advances straight to ALGO_INTRO. Algorithmic
 * conditions (Low / Med / High) still run TEST -> TAM -> SUS; the SUS
 * submission POSTs the accumulated telemetry document for that condition.
 * DEMOGRAPHICS sits between ONBOARDING and STATIC_SETUP so the participant
 * self-reports background information before their PIN work begins.
 * ALGO_INTRO sits between BASELINE_TEST and LOW_SETUP so the participant
 * meets algorithmic PINs before the first algorithmic setup. The terminal
 * COMPLETION stage runs the final attention check inline (birth-year
 * verification) and posts the participant-level finalize payload.
 */
export const STAGE_ORDER: readonly StudyStage[] = [
  'ONBOARDING',
  'DEMOGRAPHICS',
  'STATIC_SETUP',
  'BASELINE_TEST',
  'ALGO_INTRO',
  'LOW_SETUP',
  'LOW_TEST',
  'LOW_TAM',
  'LOW_SUS',
  'MED_SETUP',
  'MED_TEST',
  'MED_TAM',
  'MED_SUS',
  'HIGH_SETUP',
  'HIGH_TEST',
  'HIGH_TAM',
  'HIGH_SUS',
  'COMPLETION',
] as const

export const STAGE_ROUTES: Record<StudyStage, string> = {
  ONBOARDING: '/',
  DEMOGRAPHICS: '/demographics',
  STATIC_SETUP: '/static-setup',
  BASELINE_TEST: '/baseline-test',
  ALGO_INTRO: '/algo-intro',
  LOW_SETUP: '/low-setup',
  LOW_TEST: '/low-test',
  LOW_TAM: '/low-tam',
  LOW_SUS: '/low-sus',
  MED_SETUP: '/med-setup',
  MED_TEST: '/med-test',
  MED_TAM: '/med-tam',
  MED_SUS: '/med-sus',
  HIGH_SETUP: '/high-setup',
  HIGH_TEST: '/high-test',
  HIGH_TAM: '/high-tam',
  HIGH_SUS: '/high-sus',
  COMPLETION: '/completion',
}

export type AlgorithmComplexity = Exclude<PinCondition, 'Baseline'>

export function conditionForStage(stage: StudyStage): PinCondition | null {
  switch (stage) {
    case 'BASELINE_TEST':
      return 'Baseline'
    case 'LOW_TEST':
    case 'LOW_TAM':
    case 'LOW_SUS':
      return 'Low'
    case 'MED_TEST':
    case 'MED_TAM':
    case 'MED_SUS':
      return 'Medium'
    case 'HIGH_TEST':
    case 'HIGH_TAM':
    case 'HIGH_SUS':
      return 'High'
    default:
      return null
  }
}

export function complexityForSetupStage(
  stage: StudyStage
): AlgorithmComplexity | null {
  switch (stage) {
    case 'LOW_SETUP':
      return 'Low'
    case 'MED_SETUP':
      return 'Medium'
    case 'HIGH_SETUP':
      return 'High'
    default:
      return null
  }
}

export function nextStage(stage: StudyStage): StudyStage | null {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

export function previousStage(stage: StudyStage): StudyStage | null {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx <= 0) return null
  return STAGE_ORDER[idx - 1]
}

export function isTestStage(stage: StudyStage): boolean {
  return (
    stage === 'BASELINE_TEST' ||
    stage === 'LOW_TEST' ||
    stage === 'MED_TEST' ||
    stage === 'HIGH_TEST'
  )
}

export function isTamStage(stage: StudyStage): boolean {
  return (
    stage === 'LOW_TAM' || stage === 'MED_TAM' || stage === 'HIGH_TAM'
  )
}

/**
 * True for the three algorithmic `*_SUS` stages. SUS submission is the
 * point where an algorithmic condition's accumulated telemetry is POSTed
 * and `tempTelemetry` is cleared. Combined with `BASELINE_TEST` (which
 * POSTs lock-screen metrics itself and skips surveys), this predicate is
 * what `advanceStage()` uses to decide when to reset per-phase counters
 * (e.g. `currentPhaseReturnCount`).
 */
export function isSusStage(stage: StudyStage): boolean {
  return (
    stage === 'LOW_SUS' || stage === 'MED_SUS' || stage === 'HIGH_SUS'
  )
}

/**
 * True for stages that close a condition's telemetry document and should
 * reset per-phase counters when advancing past them.
 */
export function isConditionClosingStage(stage: StudyStage): boolean {
  return stage === 'BASELINE_TEST' || isSusStage(stage)
}
