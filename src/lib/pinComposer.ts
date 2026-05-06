import type { PredefinedAlgorithm } from './api'
import type { AlgorithmComplexity, StudyStage } from './stageFlow'
import type { Placement } from '../store/studyStore'

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
    'sum of every digit of the current time (HHMM) on the lock screen',
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
      return String(timeCrossSum(ctx.date))
  }
}

export function applyPlacement(
  basePin: string,
  dynamicValue: string,
  placement: Placement
): string {
  switch (placement) {
    case 'PREPEND':
      return `${dynamicValue}${basePin}`
    case 'APPEND':
      return `${basePin}${dynamicValue}`
    case 'INSERT_INDEX_1':
      return `${basePin.slice(0, 1)}${dynamicValue}${basePin.slice(1)}`
    case 'INSERT_INDEX_2':
      return `${basePin.slice(0, 2)}${dynamicValue}${basePin.slice(2)}`
  }
}

export function decomposePreview(
  basePin: string,
  dynamicValue: string,
  placement: Placement
): PreviewSegment[] {
  const baseChars: PreviewSegment[] = basePin
    .split('')
    .map((value) => ({ value, isDynamic: false }))
  const dyn: PreviewSegment = { value: dynamicValue, isDynamic: true }

  switch (placement) {
    case 'PREPEND':
      return [dyn, ...baseChars]
    case 'APPEND':
      return [...baseChars, dyn]
    case 'INSERT_INDEX_1':
      return [...baseChars.slice(0, 1), dyn, ...baseChars.slice(1)]
    case 'INSERT_INDEX_2':
      return [...baseChars.slice(0, 2), dyn, ...baseChars.slice(2)]
  }
}

export const PLACEMENT_OPTIONS: { value: Placement; label: string }[] = [
  { value: 'PREPEND', label: 'At the beginning (Prepend)' },
  { value: 'APPEND', label: 'At the end (Append)' },
  { value: 'INSERT_INDEX_1', label: 'After the 1st digit' },
  { value: 'INSERT_INDEX_2', label: 'After the 2nd digit' },
]

export function getCanonicalType(
  complexity: AlgorithmComplexity
): AlgorithmType {
  return CANONICAL_TYPE_BY_COMPLEXITY[complexity]
}

export function defaultPlacementForComplexity(
  complexity: AlgorithmComplexity
): Placement {
  return complexity === 'High' ? 'INSERT_INDEX_1' : 'APPEND'
}

export type ResolvedConfiguration = {
  algorithmType: AlgorithmType
  placement: Placement
}

/**
 * Robust, side-effect-free utility that returns the PIN the lock screen will
 * accept right now.
 *
 *  - For BASELINE_TEST the expected PIN is just `basePin`.
 *  - For LOW_TEST / MED_TEST / HIGH_TEST the dynamic value is computed from
 *    `currentConfig.algorithmType` against the live lock-screen context, then
 *    inserted relative to `basePin` according to `currentConfig.placement`.
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
  return applyPlacement(basePin, dynamicValue, currentConfig.placement)
}
