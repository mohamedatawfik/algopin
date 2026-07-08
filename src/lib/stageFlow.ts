import type { PinCondition } from '../store/studyStore'

export type StudyStage =
  | 'ONBOARDING'
  | 'STATIC_SETUP'
  | 'BASELINE_TEST'
  | 'BASELINE_TAM'
  | 'BASELINE_SUS'
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
 * Canonical study pipeline. Each condition (Baseline / Low / Med / High)
 * runs the loop TEST -> TAM -> SUS; the SUS submission is what POSTs the
 * accumulated telemetry document for that condition to /api/telemetry.
 * ALGO_INTRO sits between BASELINE_SUS and LOW_SETUP so the participant
 * meets algorithmic PINs before the first algorithmic setup. COMPLETION
 * is the terminal stage after HIGH_SUS.
 */
export const STAGE_ORDER: readonly StudyStage[] = [
  'ONBOARDING',
  'STATIC_SETUP',
  'BASELINE_TEST',
  'BASELINE_TAM',
  'BASELINE_SUS',
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
  STATIC_SETUP: '/static-setup',
  BASELINE_TEST: '/baseline-test',
  BASELINE_TAM: '/baseline-tam',
  BASELINE_SUS: '/baseline-sus',
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
    case 'BASELINE_TAM':
    case 'BASELINE_SUS':
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
    stage === 'BASELINE_TAM' ||
    stage === 'LOW_TAM' ||
    stage === 'MED_TAM' ||
    stage === 'HIGH_TAM'
  )
}

/**
 * True for the four `*_SUS` stages. SUS submission is the point where a
 * condition's accumulated telemetry is POSTed and `tempTelemetry` is
 * cleared, so this predicate is what `advanceStage()` uses to decide when
 * to reset per-phase counters (e.g. `currentPhaseReturnCount`).
 */
export function isSusStage(stage: StudyStage): boolean {
  return (
    stage === 'BASELINE_SUS' ||
    stage === 'LOW_SUS' ||
    stage === 'MED_SUS' ||
    stage === 'HIGH_SUS'
  )
}
