import type { PinCondition } from '../store/studyStore'

export type StudyStage =
  | 'PHASE2_WELCOME'
  | 'TRANSITION_LOW'
  | 'LOW_TEST'
  | 'TRANSITION_MED'
  | 'MED_TEST'
  | 'TRANSITION_HIGH'
  | 'HIGH_TEST'
  | 'COMPLETION'

/**
 * Phase 2 is the unannounced follow-up memory test. There is no setup,
 * no training and no questionnaires: the participant re-enters their
 * Prolific ID and base PIN, then has to recall each of the three rules
 * from Phase 1 unaided. A named transition screen sits in front of each
 * lock-screen test so the upcoming complexity is announced — without
 * restating the rule itself. Every stage transition is forward-only.
 */
export const STAGE_ORDER: readonly StudyStage[] = [
  'PHASE2_WELCOME',
  'TRANSITION_LOW',
  'LOW_TEST',
  'TRANSITION_MED',
  'MED_TEST',
  'TRANSITION_HIGH',
  'HIGH_TEST',
  'COMPLETION',
] as const

export const STAGE_ROUTES: Record<StudyStage, string> = {
  PHASE2_WELCOME: '/',
  TRANSITION_LOW: '/transition-low',
  LOW_TEST: '/low-test',
  TRANSITION_MED: '/transition-med',
  MED_TEST: '/med-test',
  TRANSITION_HIGH: '/transition-high',
  HIGH_TEST: '/high-test',
  COMPLETION: '/completion',
}

export type AlgorithmComplexity = PinCondition

/** Key of the per-test result slot a condition writes into. */
export type TestResultKey = 'lowTest' | 'mediumTest' | 'highTest'

export function conditionForStage(stage: StudyStage): PinCondition | null {
  switch (stage) {
    case 'TRANSITION_LOW':
    case 'LOW_TEST':
      return 'Low'
    case 'TRANSITION_MED':
    case 'MED_TEST':
      return 'Medium'
    case 'TRANSITION_HIGH':
    case 'HIGH_TEST':
      return 'High'
    default:
      return null
  }
}

export function resultKeyForCondition(condition: PinCondition): TestResultKey {
  switch (condition) {
    case 'Low':
      return 'lowTest'
    case 'Medium':
      return 'mediumTest'
    case 'High':
      return 'highTest'
  }
}

export function nextStage(stage: StudyStage): StudyStage | null {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

export function isTestStage(stage: StudyStage): boolean {
  return (
    stage === 'LOW_TEST' || stage === 'MED_TEST' || stage === 'HIGH_TEST'
  )
}

export function isTransitionStage(stage: StudyStage): boolean {
  return (
    stage === 'TRANSITION_LOW' ||
    stage === 'TRANSITION_MED' ||
    stage === 'TRANSITION_HIGH'
  )
}

/**
 * Display title for a transition screen. Names the complexity only —
 * never the mathematical rule — so Phase 2 still tests unaided recall.
 */
export function complexityTaskTitle(stage: StudyStage): string | null {
  switch (conditionForStage(stage)) {
    case 'Low':
      return 'Low Complexity Task'
    case 'Medium':
      return 'Medium Complexity Task'
    case 'High':
      return 'High Complexity Task'
    default:
      return null
  }
}
