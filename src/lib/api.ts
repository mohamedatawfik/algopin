import type { Keystroke } from '../hooks/useLockScreenTelemetry'
import type { PinCondition } from '../store/studyStore'
import type { AlgorithmComplexity } from './stageFlow'

const DEFAULT_API_BASE = 'http://localhost:4000'

export function getApiBaseUrl(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.VITE_API_BASE_URL
      : undefined
  return fromEnv || DEFAULT_API_BASE
}

export type PredefinedAlgorithm = {
  algorithmId: string
  complexity: AlgorithmComplexity
  description: string
  type: 'MINUTE_DIGIT' | 'MINUTE_PLUS_BATTERY' | 'MINUTE_PLUS_TRIPLE_BATTERY'
  _id?: string
  createdAt?: string
  updatedAt?: string
}

export type AlgorithmsResponse = {
  complexity: AlgorithmComplexity
  algorithms: PredefinedAlgorithm[]
}

export type ParticipantInitResponse = {
  created: boolean
  participant: {
    _id: string
    mTurkId: string
    basePin: string
    createdAt?: string
  }
}

export type TelemetryPostResponse = {
  id: string
  createdAt?: string
}

/**
 * Number of items and 1..7 Likert bounds for the Technology-Acceptance-Model
 * questionnaire administered immediately after every `*_TEST` phase.
 */
export const TAM_ITEM_COUNT = 5
export const TAM_MIN_VALUE = 1
export const TAM_MAX_VALUE = 7

/**
 * Named-field 1..7 Likert answers to the five TAM items, in the order
 * rendered by `TamSurveyView`. Persisted verbatim on the `tam` subdoc of
 * a `telemetrylogs` document.
 */
export type TamAnswers = {
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
}

/**
 * Named-field 1..5 Likert answers to the ten per-condition SUS items, in
 * the order rendered by `SusSurveyView`. Persisted verbatim on the `sus`
 * subdoc of a `telemetrylogs` document. Distinct from the (now-legacy)
 * Day-1 end-of-study SUS `SusAnswers` array wired through
 * `finalizeParticipant`.
 */
export type SusAnswersPerCondition = {
  item1: number
  item2: number
  item3: number
  item4: number
  item5: number
  item6: number
  item7: number
  item8: number
  item9: number
  item10: number
}

/**
 * The exact JSON body POSTed to /api/telemetry once a condition is fully
 * complete (lock screen + TAM + SUS). Identity (`mTurkId`, `condition`) is
 * supplied by `SusSurveyView` from the global store; lock-screen metrics
 * were written to `tempTelemetry` at unlock success; `tam` was appended by
 * `TamSurveyView`; `sus` is appended by `SusSurveyView` right before this
 * POST is dispatched.
 */
export type TelemetrySubmission = {
  mTurkId: string
  condition: PinCondition
  renderTimestamp: number
  timeToFirstTouch: number | null
  totalAuthTime: number
  errorCount: number
  /**
   * Count of lock-screen "Return" presses accumulated across the current
   * complexity phase, captured at unlock-success time. Persisted on the
   * `TelemetryLog` document so we can analyse working-memory failures
   * per condition.
   */
  returnCount: number
  submittedErrors: string[]
  keystrokeLog: Keystroke[]
  tam: TamAnswers
  sus: SusAnswersPerCondition
  /**
   * Optional participant-level blocks. Included by the frontend on the
   * final per-condition telemetry POST so per-condition analyses can join
   * without a second lookup; the same values are also written to the
   * Participant record via `/api/participant/finalize`.
   */
  demographics?: Demographics
  attentionCheck?: AttentionCheck
}

/**
 * Number of items on the tech-affinity portion of the DEMOGRAPHICS phase.
 * Each answer is a numeric Likert-style response persisted verbatim as an
 * ordered array so item order is preserved for downstream analysis.
 */
export const TECH_AFFINITY_ITEM_COUNT = 4

/**
 * Self-reported demographics captured in the DEMOGRAPHICS phase, held
 * verbatim in the global store and shipped on the finalize POST (and, for
 * convenience, on the final telemetry POST too).
 */
export type Demographics = {
  birthDate: string
  education: string
  passwordFrequency: string
  techAffinity: number[]
}

export function emptyDemographics(): Demographics {
  return {
    birthDate: '',
    education: '',
    passwordFrequency: '',
    techAffinity: [],
  }
}

/**
 * Attention-check probe captured inline at the top of `CompletionView`
 * (birth-year re-verification). Persisted on the Participant record via
 * the finalize POST (and mirrored onto the final telemetry POST when
 * convenient).
 */
export type AttentionCheck = {
  verificationYear: string
  passedCheck: boolean
}

export function emptyAttentionCheck(): AttentionCheck {
  return { verificationYear: '', passedCheck: false }
}

export type StudyPhase = 'day1' | 'day7'

/**
 * Number of items on the standard System Usability Scale (Brooke, 1996).
 * Each answer is an integer 1..5 (Strongly Disagree .. Strongly Agree).
 */
export const SUS_ITEM_COUNT = 10
export const SUS_MIN_VALUE = 1
export const SUS_MAX_VALUE = 5

export type SusAnswers = number[]

export type FinalizeSubmission = {
  mTurkId: string
  /**
   * MTurk completion code shown to the participant on the terminal
   * `CompletionView` (format: `ALGOPIN-MTA-XXXXXX`). Required — the
   * backend rejects the submission without it so we can cross-reference
   * the paste on the HIT page against the study database.
   */
  completionCode: string
  /**
   * Legacy Day-1 SUS payload. The current study collects SUS
   * per-condition via `/api/telemetry`, so this is optional and normally
   * omitted from the finalize call.
   */
  susAnswers?: SusAnswers
  phase?: StudyPhase
  /**
   * Participant-level demographics captured in the DEMOGRAPHICS phase.
   * Optional so callers that don't have the data (e.g. legacy flows) can
   * still finalize.
   */
  demographics?: Demographics
  /**
   * Attention-check probe captured inline at the top of `CompletionView`.
   * Optional for the same reason as `demographics`.
   */
  attentionCheck?: AttentionCheck
}

export type FinalizeResponse = {
  ok: boolean
  phase: StudyPhase
  completedAt: string
  completionCode: string
  participant: {
    _id: string
    mTurkId: string
    basePin: string
    completionCode?: string
    demographics?: Demographics
    attentionCheck?: AttentionCheck
    finalize?: {
      day1?: { susAnswers?: number[]; completedAt: string }
      day7?: { susAnswers?: number[]; completedAt: string }
    }
    createdAt?: string
  }
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  const body = text
    ? (() => {
        try {
          return JSON.parse(text)
        } catch {
          return text
        }
      })()
    : null
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body
        ? (body as { error?: string }).error
        : null) || `Request failed with ${res.status}`
    throw new ApiError(message, res.status, body)
  }
  return body as T
}

export async function fetchAlgorithms(
  complexity: AlgorithmComplexity
): Promise<PredefinedAlgorithm[]> {
  const data = await request<AlgorithmsResponse>(
    `/api/algorithms/${encodeURIComponent(complexity)}`
  )
  return data.algorithms
}

export async function initParticipant(
  mTurkId: string,
  basePin: string
): Promise<ParticipantInitResponse> {
  return request<ParticipantInitResponse>('/api/participant/init', {
    method: 'POST',
    body: JSON.stringify({ mTurkId, basePin }),
  })
}

export async function postTelemetry(
  submission: TelemetrySubmission
): Promise<TelemetryPostResponse> {
  return request<TelemetryPostResponse>('/api/telemetry', {
    method: 'POST',
    body: JSON.stringify(submission),
  })
}

export async function finalizeParticipant(
  submission: FinalizeSubmission
): Promise<FinalizeResponse> {
  return request<FinalizeResponse>('/api/participant/finalize', {
    method: 'POST',
    body: JSON.stringify(submission),
  })
}
