import type { PinCondition } from '../store/studyStore'

export type StudyStage =
  | 'ONBOARDING'
  | 'STATIC_SETUP'
  | 'BASELINE_TEST'
  | 'ALGO_INTRO'
  | 'LOW_SETUP'
  | 'LOW_TEST'
  | 'MED_SETUP'
  | 'MED_TEST'
  | 'HIGH_SETUP'
  | 'HIGH_TEST'
  | 'SURVEY'

export const STAGE_ORDER: readonly StudyStage[] = [
  'ONBOARDING',
  'STATIC_SETUP',
  'BASELINE_TEST',
  'ALGO_INTRO',
  'LOW_SETUP',
  'LOW_TEST',
  'MED_SETUP',
  'MED_TEST',
  'HIGH_SETUP',
  'HIGH_TEST',
  'SURVEY',
] as const

export const STAGE_ROUTES: Record<StudyStage, string> = {
  ONBOARDING: '/',
  STATIC_SETUP: '/static-setup',
  BASELINE_TEST: '/baseline-test',
  ALGO_INTRO: '/algo-intro',
  LOW_SETUP: '/low-setup',
  LOW_TEST: '/low-test',
  MED_SETUP: '/med-setup',
  MED_TEST: '/med-test',
  HIGH_SETUP: '/high-setup',
  HIGH_TEST: '/high-test',
  SURVEY: '/survey',
}

export type AlgorithmComplexity = Exclude<PinCondition, 'Baseline'>

export function conditionForStage(stage: StudyStage): PinCondition | null {
  switch (stage) {
    case 'BASELINE_TEST':
      return 'Baseline'
    case 'LOW_TEST':
      return 'Low'
    case 'MED_TEST':
      return 'Medium'
    case 'HIGH_TEST':
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
