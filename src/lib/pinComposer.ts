import type { AlgorithmComplexity, StudyStage } from './stageFlow'

export type AlgorithmType =
  | 'MINUTE_DIGIT'
  | 'MINUTE_PLUS_BATTERY'
  | 'MINUTE_PLUS_TRIPLE_BATTERY'

/**
 * Ambient state the lock screen evaluates the rule against.
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

export function getCanonicalType(
  complexity: AlgorithmComplexity
): AlgorithmType {
  return CANONICAL_TYPE_BY_COMPLEXITY[complexity]
}

function unitsDigit(n: number): number {
  return Math.abs(Math.round(n)) % 10
}

/** Raw (pre-wrap) arithmetic value for a rule. */
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
 * Side-effect-free utility that returns the PIN the lock screen will
 * accept right now.
 *
 * For LOW_TEST / MED_TEST / HIGH_TEST the dynamic value is computed from
 * the stage's canonical rule against the live lock-screen context
 * (`date`, `batteryLevel`), squeezed through mod 10 into a single 0..9
 * digit, and spliced into the globally-locked trailing digit of the base
 * PIN (`LOCKED_REPLACED_INDEX`). The PIN length is preserved. Any other
 * stage returns `basePin` unchanged so callers never get an exception in
 * unexpected states.
 */
export function calculateExpectedPin(
  basePin: string,
  stage: StudyStage,
  algorithmType: AlgorithmType | null,
  ctx: DynamicContext
): string {
  if (
    stage !== 'LOW_TEST' &&
    stage !== 'MED_TEST' &&
    stage !== 'HIGH_TEST'
  ) {
    return basePin
  }
  if (!algorithmType) return basePin
  if (basePin.length !== BASE_PIN_LENGTH) return basePin
  const finalDynamicDigitString = computeDynamicValue(algorithmType, ctx)
  return basePin.substring(0, LOCKED_REPLACED_INDEX) + finalDynamicDigitString
}
