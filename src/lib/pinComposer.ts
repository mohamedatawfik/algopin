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

/**
 * Indices (0-based) of the base PIN digits that are replaced by the
 * dynamic value. Always sorted ascending, unique, length in [1, 3], and
 * each value in [0, basePin.length - 1]. We cap at 3 so at least one
 * static base digit always remains in the live PIN.
 */
export type DynamicPositions = number[]

export const MIN_DYNAMIC_POSITIONS = 1
export const MAX_DYNAMIC_POSITIONS = 3
export const BASE_PIN_LENGTH = 4

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
 * written into each chosen position of the base PIN (see
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

function normalizePositions(
  positions: DynamicPositions,
  pinLength: number
): number[] {
  const filtered = positions.filter(
    (p) => Number.isInteger(p) && p >= 0 && p < pinLength
  )
  return Array.from(new Set(filtered)).sort((a, b) => a - b)
}

/**
 * Replace each position in `positions` with `dynamicValue`. The base PIN
 * length is preserved — nothing is appended or prepended.
 */
export function applyReplacement(
  basePin: string,
  dynamicValue: string,
  positions: DynamicPositions
): string {
  const chars = basePin.split('')
  for (const idx of normalizePositions(positions, chars.length)) {
    chars[idx] = dynamicValue
  }
  return chars.join('')
}

export function decomposePreview(
  basePin: string,
  dynamicValue: string,
  positions: DynamicPositions
): PreviewSegment[] {
  const dynSet = new Set(normalizePositions(positions, basePin.length))
  return basePin.split('').map((value, idx) => {
    const isDynamic = dynSet.has(idx)
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
 * Sensible defaults if the participant never opened the setup screen for
 * a given complexity. We scale the number of dynamic positions with the
 * complexity (Low=1, Medium=2, High=3), choosing the trailing N digits so
 * the lock screen has well-defined behavior even in fallback paths.
 */
export function defaultPositionsForComplexity(
  complexity: AlgorithmComplexity
): DynamicPositions {
  const count =
    complexity === 'High' ? 3 : complexity === 'Medium' ? 2 : 1
  const positions: number[] = []
  for (let i = BASE_PIN_LENGTH - count; i < BASE_PIN_LENGTH; i++) {
    positions.push(i)
  }
  return positions
}

export function isValidDynamicPositions(
  positions: DynamicPositions,
  pinLength = BASE_PIN_LENGTH
): boolean {
  const normalized = normalizePositions(positions, pinLength)
  return (
    normalized.length === positions.length &&
    normalized.length >= MIN_DYNAMIC_POSITIONS &&
    normalized.length <= MAX_DYNAMIC_POSITIONS
  )
}

export type ResolvedConfiguration = {
  algorithmType: AlgorithmType
  dynamicPositions: DynamicPositions
}

/**
 * Robust, side-effect-free utility that returns the PIN the lock screen will
 * accept right now.
 *
 *  - For BASELINE_TEST the expected PIN is just `basePin`.
 *  - For LOW_TEST / MED_TEST / HIGH_TEST the dynamic value is computed from
 *    `currentConfig.algorithmType` against the live lock-screen context, then
 *    written into each position in `currentConfig.dynamicPositions`. The PIN
 *    length is preserved.
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
  return applyReplacement(basePin, dynamicValue, currentConfig.dynamicPositions)
}
