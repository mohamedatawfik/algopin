import type { PredefinedAlgorithm } from './api'
import type { AlgorithmComplexity, StudyStage } from './stageFlow'

export type AlgorithmType =
  | 'MINUTE_DIGIT'
  | 'UNREAD_MESSAGES'
  | 'TIME_CROSS_SUM'

export type DynamicContext = {
  date: Date
  unreadCount: number
}

export type PreviewSegment = {
  value: string
  isDynamic: boolean
}

export const BASE_PIN_LENGTH = 4

/**
 * The dynamic element is locked to the 4th (last) digit of the base PIN
 * for every participant, every complexity phase. Participants no longer
 * choose which digit is replaced, so this constant is the single source
 * of truth used by the setup preview, the lock-screen expected PIN, and
 * any downstream analytics.
 */
export const DYNAMIC_DIGIT_INDEX = BASE_PIN_LENGTH - 1

const CANONICAL_TYPE_BY_COMPLEXITY: Record<AlgorithmComplexity, AlgorithmType> =
  {
    Low: 'MINUTE_DIGIT',
    Medium: 'UNREAD_MESSAGES',
    High: 'TIME_CROSS_SUM',
  }

const PLACEHOLDER_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: 'd',
  UNREAD_MESSAGES: 'm',
  TIME_CROSS_SUM: 's',
}

const PLACEHOLDER_DESCRIPTION_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: 'units digit of the current minute',
  UNREAD_MESSAGES: 'units digit of the unread message count',
  TIME_CROSS_SUM:
    'units digit of the cross-sum of the current time (HHMM) on the lock screen',
}

export function placeholderForType(type: AlgorithmType): string {
  return PLACEHOLDER_BY_TYPE[type]
}

export function placeholderDescriptionForType(type: AlgorithmType): string {
  return PLACEHOLDER_DESCRIPTION_BY_TYPE[type]
}

export function inferAlgorithmType(
  algorithm: PredefinedAlgorithm | undefined,
  complexity: AlgorithmComplexity
): AlgorithmType {
  if (algorithm) return algorithm.type
  return CANONICAL_TYPE_BY_COMPLEXITY[complexity]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function timeCrossSum(d: Date): number {
  const digits = `${pad2(d.getHours())}${pad2(d.getMinutes())}`
  let sum = 0
  for (const c of digits) sum += Number(c)
  return sum
}

/**
 * Every algorithm collapses to a single 0-9 digit. That digit is then
 * written into `DYNAMIC_DIGIT_INDEX` of the base PIN (the 4th digit) by
 * `calculateExpectedPin`. For the cross-sum we take the units digit of
 * the total so the participant always types one digit, regardless of
 * whether the raw sum has one or two digits.
 */
export function computeDynamicValue(
  type: AlgorithmType,
  ctx: DynamicContext
): string {
  switch (type) {
    case 'MINUTE_DIGIT':
      return String(ctx.date.getMinutes() % 10)
    case 'UNREAD_MESSAGES':
      return String(ctx.unreadCount % 10)
    case 'TIME_CROSS_SUM':
      return String(timeCrossSum(ctx.date) % 10)
  }
}

/**
 * Break the base PIN into preview segments, marking the fixed dynamic
 * position (4th digit) as replaced by `dynamicValue`. Used by the setup
 * view to render the "Rule" and "Right now" previews.
 */
export function decomposePreview(
  basePin: string,
  dynamicValue: string
): PreviewSegment[] {
  return basePin.split('').map((value, idx) => {
    const isDynamic = idx === DYNAMIC_DIGIT_INDEX
    return {
      value: isDynamic ? dynamicValue : value,
      isDynamic,
    }
  })
}

export function getCanonicalType(
  complexity: AlgorithmComplexity
): AlgorithmType {
  return CANONICAL_TYPE_BY_COMPLEXITY[complexity]
}

export type ResolvedConfiguration = {
  algorithmType: AlgorithmType
}

/**
 * Robust, side-effect-free utility that returns the PIN the lock screen will
 * accept right now.
 *
 *  - For BASELINE_TEST the expected PIN is just `basePin`.
 *  - For LOW_TEST / MED_TEST / HIGH_TEST the dynamic value is computed from
 *    `currentConfig.algorithmType` against the live lock-screen context, then
 *    written into the 4th digit (`DYNAMIC_DIGIT_INDEX`) of the base PIN. The
 *    PIN length is preserved.
 *  - For any other stage (or a missing config) it returns `basePin` as a
 *    benign fallback so callers never get an exception in unexpected states.
 */
export function calculateExpectedPin(
  basePin: string,
  stage: StudyStage,
  currentConfig: ResolvedConfiguration | null,
  ctx: DynamicContext
): string {
  if (stage === 'BASELINE_TEST') return basePin
  if (
    stage !== 'LOW_TEST' &&
    stage !== 'MED_TEST' &&
    stage !== 'HIGH_TEST'
  ) {
    return basePin
  }
  if (!currentConfig) return basePin
  if (basePin.length !== BASE_PIN_LENGTH) return basePin
  const dynamicValue = computeDynamicValue(currentConfig.algorithmType, ctx)
  return basePin.substring(0, DYNAMIC_DIGIT_INDEX) + dynamicValue
}
