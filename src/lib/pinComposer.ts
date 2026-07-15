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
    Medium: 'MINUTE_PLUS_BATTERY',
    High: 'MINUTE_PLUS_TRIPLE_BATTERY',
  }

/**
 * Short mnemonic used in the "Rule" preview chip on the setup screen —
 * it stands in for the yet-to-be-computed dynamic value. Because the
 * final value is squeezed through mod 10, the mnemonic is written with
 * an explicit `(… ) mod 10` for MED/HIGH so participants can read the
 * transformation at a glance.
 */
const PLACEHOLDER_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: 'd',
  MINUTE_PLUS_BATTERY: '(d+b) mod 10',
  MINUTE_PLUS_TRIPLE_BATTERY: '(d+3b) mod 10',
}

const PLACEHOLDER_DESCRIPTION_BY_TYPE: Record<AlgorithmType, string> = {
  MINUTE_DIGIT: 'the units digit of the current minute',
  MINUTE_PLUS_BATTERY:
    'the last digit of (the units digit of the minute plus the units digit of the battery percentage)',
  MINUTE_PLUS_TRIPLE_BATTERY:
    'the last digit of (the units digit of the minute plus three times the units digit of the battery percentage)',
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
 * Compute the raw (pre-modulo) arithmetic value for a rule. Exposed for
 * the setup preview so the "Right now" caption can show the full
 * `d + 3b = 34, mod 10 = 4` breakdown without having to re-derive the
 * intermediate figure.
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
      return d + 3 * b
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
 *    `currentConfig.algorithmType` against the live lock-screen context
 *    (`date`, `batteryLevel`), squeezed through mod 10 into a single 0..9
 *    digit, and spliced into `currentConfig.replacedIndex` of the base
 *    PIN. The PIN length is preserved.
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
  const index = currentConfig.replacedIndex
  if (!isValidReplacedIndex(index, basePin.length)) return basePin
  const finalDynamicDigit = computeDynamicValue(currentConfig.algorithmType, ctx)
  return (
    basePin.substring(0, index) +
    finalDynamicDigit +
    basePin.substring(index + 1)
  )
}
