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
  type: 'MINUTE_DIGIT' | 'UNREAD_MESSAGES' | 'TIME_CROSS_SUM'
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

/** NASA-TLX ratings, one number per dimension (1..7 or 1..21). */
export type NasaTlxRatings = {
  mentalDemand: number
  physicalDemand: number
  temporalDemand: number
  performance: number
  effort: number
  frustration: number
}

/**
 * The exact JSON body POSTed to /api/telemetry once a condition is fully
 * complete (lock screen + TLX). Identity (`mTurkId`, `condition`) is supplied
 * by the TLX view from the global store; lock-screen metrics come from
 * `tempTelemetry`; ratings come from the slider state.
 */
export type TelemetrySubmission = {
  mTurkId: string
  condition: PinCondition
  renderTimestamp: number
  timeToFirstTouch: number | null
  totalAuthTime: number
  errorCount: number
  submittedErrors: string[]
  keystrokeLog: Keystroke[]
  nasaTlx: NasaTlxRatings
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
  susAnswers: SusAnswers
  phase?: StudyPhase
}

export type FinalizeResponse = {
  ok: boolean
  phase: StudyPhase
  completedAt: string
  participant: {
    _id: string
    mTurkId: string
    basePin: string
    finalize?: {
      day1?: { susAnswers: number[]; completedAt: string }
      day7?: { susAnswers: number[]; completedAt: string }
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
