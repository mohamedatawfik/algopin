import type { PinCondition } from '../store/studyStore'

export type StudyStage =
  | 'ONBOARDING'
  | 'STATIC_SETUP'
  | 'BASELINE_TEST'
  | 'BASELINE_TLX'
  | 'ALGO_INTRO'
  | 'LOW_SETUP'
  | 'LOW_TEST'
  | 'LOW_TLX'
  | 'MED_SETUP'
  | 'MED_TEST'
  | 'MED_TLX'
  | 'HIGH_SETUP'
  | 'HIGH_TEST'
  | 'HIGH_TLX'
  | 'FINAL_SURVEY'

export const STAGE_ORDER: readonly StudyStage[] = [
  'ONBOARDING',
  'STATIC_SETUP',
  'BASELINE_TEST',
  'BASELINE_TLX',
  'ALGO_INTRO',
  'LOW_SETUP',
  'LOW_TEST',
  'LOW_TLX',
  'MED_SETUP',
  'MED_TEST',
  'MED_TLX',
  'HIGH_SETUP',
  'HIGH_TEST',
  'HIGH_TLX',
  'FINAL_SURVEY',
] as const

export const STAGE_ROUTES: Record<StudyStage, string> = {
  ONBOARDING: '/',
  STATIC_SETUP: '/static-setup',
  BASELINE_TEST: '/baseline-test',
  BASELINE_TLX: '/baseline-tlx',
  ALGO_INTRO: '/algo-intro',
  LOW_SETUP: '/low-setup',
  LOW_TEST: '/low-test',
  LOW_TLX: '/low-tlx',
  MED_SETUP: '/med-setup',
  MED_TEST: '/med-test',
  MED_TLX: '/med-tlx',
  HIGH_SETUP: '/high-setup',
  HIGH_TEST: '/high-test',
  HIGH_TLX: '/high-tlx',
  FINAL_SURVEY: '/final-survey',
}

export type AlgorithmComplexity = Exclude<PinCondition, 'Baseline'>

export function conditionForStage(stage: StudyStage): PinCondition | null {
  switch (stage) {
    case 'BASELINE_TEST':
    case 'BASELINE_TLX':
      return 'Baseline'
    case 'LOW_TEST':
    case 'LOW_TLX':
      return 'Low'
    case 'MED_TEST':
    case 'MED_TLX':
      return 'Medium'
    case 'HIGH_TEST':
    case 'HIGH_TLX':
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

export function isTestStage(stage: StudyStage): boolean {
  return (
    stage === 'BASELINE_TEST' ||
    stage === 'LOW_TEST' ||
    stage === 'MED_TEST' ||
    stage === 'HIGH_TEST'
  )
}

export function isTlxStage(stage: StudyStage): boolean {
  return (
    stage === 'BASELINE_TLX' ||
    stage === 'LOW_TLX' ||
    stage === 'MED_TLX' ||
    stage === 'HIGH_TLX'
  )
}
