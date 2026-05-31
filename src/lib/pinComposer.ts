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
 * The fixed set of base-PIN indices a participant can choose to replace
 * with the dynamic value. Exactly one of these is selected per
 * algorithmic condition — the PIN length always stays at
 * `BASE_PIN_LENGTH` and only that single digit becomes dynamic.
 */
export const REPLACEABLE_INDICES: readonly number[] = Array.from(
  { length: BASE_PIN_LENGTH },
  (_, i) => i
)

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
 * written into the chosen position of the base PIN (see
 * `applyReplacement`). For the cross-sum we take the units digit of the
 * total so the participant always types one digit, regardless of whether
 * the raw sum has one or two digits.
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

export function isValidReplacedIndex(
  index: number | null | undefined,
  pinLength = BASE_PIN_LENGTH
): index is number {
  return (
    typeof index === 'number' &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < pinLength
  )
}

/**
 * Replace exactly the character at `replacedIndex` of `basePin` with
 * `dynamicValue`. The base PIN length is preserved — nothing is appended
 * or prepended. If `replacedIndex` is invalid the base PIN is returned
 * unchanged (benign fallback for unexpected states).
 */
export function applyReplacement(
  basePin: string,
  dynamicValue: string,
  replacedIndex: number
): string {
  if (!isValidReplacedIndex(replacedIndex, basePin.length)) return basePin
  return (
    basePin.substring(0, replacedIndex) +
    dynamicValue +
    basePin.substring(replacedIndex + 1)
  )
}

export function decomposePreview(
  basePin: string,
  dynamicValue: string,
  replacedIndex: number | null
): PreviewSegment[] {
  return basePin.split('').map((value, idx) => {
    const isDynamic = idx === replacedIndex
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

/**
 * Fallback index used only when something lands on the lock screen
 * without an explicit configuration (e.g. dev navigation, restored
 * session before the participant picked an index). We default to the
 * trailing digit for every complexity so the lock screen always has
 * well-defined behavior. The parameter is reserved for future
 * complexity-specific defaults.
 */
export function defaultReplacedIndexForComplexity(
  complexity: AlgorithmComplexity
): number {
  void complexity
  return BASE_PIN_LENGTH - 1
}

export type ResolvedConfiguration = {
  algorithmType: AlgorithmType
  replacedIndex: number
}

/**
 * Robust, side-effect-free utility that returns the PIN the lock screen will
 * accept right now.
 *
 *  - For BASELINE_TEST the expected PIN is just `basePin`.
 *  - For LOW_TEST / MED_TEST / HIGH_TEST the dynamic value is computed from
 *    `currentConfig.algorithmType` against the live lock-screen context, then
 *    written into the single position `currentConfig.replacedIndex`. The
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
  const dynamicValue = computeDynamicValue(currentConfig.algorithmType, ctx)
  const index = currentConfig.replacedIndex
  if (!isValidReplacedIndex(index, basePin.length)) return basePin
  return (
    basePin.substring(0, index) +
    dynamicValue +
    basePin.substring(index + 1)
  )
}
