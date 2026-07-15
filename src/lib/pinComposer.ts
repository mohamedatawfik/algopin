import type { PredefinedAlgorithm } from './api'
import type { AlgorithmComplexity, StudyStage } from './stageFlow'

export type AlgorithmType =
  | 'MINUTE_DIGIT'
  | 'MINUTE_PLUS_BATTERY'
  | 'MINUTE_PLUS_TRIPLE_BATTERY'

/**
 * Ambient state the lock screen (or the setup preview) evaluates the
 * rule against.
 *
 *  - `date` supplies the clock; `d = date.getMinutes() % 10` is the
 *    minute's units digit and feeds every rule.
 *  - `batteryLevel` is the battery percentage shown in the phone status
 *    bar (0..100); `b = batteryLevel % 10` is the battery's units digit
 *    and feeds the Medium and High rules.
 */
export type DynamicContext = {
  date: Date
  batteryLevel: number
}

export type PreviewSegment = {
  value: string
  isDynamic: boolean
}

export const BASE_PIN_LENGTH = 4

/**
 * The single, globally-locked base-PIN index that is replaced by the
 * dynamic value during any algorithmic phase. We deliberately pin this
 * to the trailing (4th) digit for *every* participant and *every*
 * complexity so that variability across participants comes only from
 * the rule difficulty, not from which digit they happened to pick.
 * The PIN length always stays at `BASE_PIN_LENGTH`; only this single
 * digit becomes dynamic.
 */
export const LOCKED_REPLACED_INDEX = BASE_PIN_LENGTH - 1

const CANONICAL_TYPE_BY_COMPLEXITY: Record<AlgorithmComplexity, AlgorithmType> =
  {
    Low: 'MINUTE_DIGIT',
    Medium: 'MINUTE_PLUS_BATTERY',
    High: 'MINUTE_PLUS_TRIPLE_BATTERY',
  }

/**
 * Short placeholder used in the "Rule" preview chip on the setup screen —
 * it stands in for the yet-to-be-computed dynamic value. Captions below
 * the chip explain what [X] means in plain English (no mod / variable
 * notation), so participants can map the rule onto their live PIN.
 */
const PLACEHOLDER_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: '[X]',
  MINUTE_PLUS_BATTERY: '[X]',
  MINUTE_PLUS_TRIPLE_BATTERY: '[X]',
}

const PLACEHOLDER_DESCRIPTION_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: 'the last digit of the minute',
  MINUTE_PLUS_BATTERY: 'the last digit of (Minute + Battery)',
  MINUTE_PLUS_TRIPLE_BATTERY: 'the last digit of ((Minute + Battery) x 3)',
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

function unitsDigit(n: number): number {
  return Math.abs(Math.round(n)) % 10
}

/**
 * Compute the raw (pre-wrap) arithmetic value for a rule. Exposed for
 * the setup preview so the "Right now" caption can show the full
 * sum (e.g. 7 + 9 = 16) before taking only the last digit.
 */
export function computeRawSum(
  type: AlgorithmType,
  ctx: DynamicContext
): number {
  const d = unitsDigit(ctx.date.getMinutes())
  const b = unitsDigit(ctx.batteryLevel)
  switch (type) {
    case 'MINUTE_DIGIT':
      return d
    case 'MINUTE_PLUS_BATTERY':
      return d + b
    case 'MINUTE_PLUS_TRIPLE_BATTERY':
      return (d + b) * 3
  }
}

/**
 * Evaluate the dynamic value for the given rule. The result is always a
 * single character in `'0'..'9'` because we squeeze the raw sum through
 * modulo 10 — this keeps the expected PIN exactly `BASE_PIN_LENGTH`
 * digits long regardless of complexity.
 *
 * Example (Medium, 12:47, 89% battery):
 *   d = 7, b = 9, rawSum = 16, finalDynamicDigit = 16 % 10 = 6
 */
export function computeDynamicValue(
  type: AlgorithmType,
  ctx: DynamicContext
): string {
  return String(computeRawSum(type, ctx) % 10)
}

/**
 * Preview breakdown of `basePin` with the dynamic value spliced into
 * the globally-locked replacement slot (`LOCKED_REPLACED_INDEX`). Used
 * by the setup screen to render the "Rule" and "Right now" chips.
 */
export function decomposePreview(
  basePin: string,
  dynamicValue: string
): PreviewSegment[] {
  return basePin.split('').map((value, idx) => {
    const isDynamic = idx === LOCKED_REPLACED_INDEX
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
 *    `currentConfig.algorithmType` against the live lock-screen context
 *    (`date`, `batteryLevel`), squeezed through mod 10 into a single 0..9
 *    digit, and spliced into the globally-locked trailing digit of the
 *    base PIN (`LOCKED_REPLACED_INDEX`). The PIN length is preserved.
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
  const finalDynamicDigitString = computeDynamicValue(
    currentConfig.algorithmType,
    ctx
  )
  return basePin.substring(0, LOCKED_REPLACED_INDEX) + finalDynamicDigitString
}
