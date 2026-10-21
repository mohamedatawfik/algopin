import type { Keystroke } from '../hooks/useLockScreenTelemetry'
import type { PinCondition } from '../store/studyStore'

const DEFAULT_API_BASE = 'http://localhost:4000'

/**
 * Resolve the API origin used by `fetch`.
 *
 * Prefer `VITE_API_BASE_URL` when set (deploy.sh bakes the public HTTPS
 * origin in). Otherwise use same-origin (`''`) when the page is not on
 * localhost so a phone never tries to reach `http://localhost:4000`, and
 * fall back to the local Express default for Vite/dev.
 */
export function getApiBaseUrl(): string {
  const fromEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
          ?.VITE_API_BASE_URL
      : undefined
  if (fromEnv) return fromEnv
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return ''
  }
  return DEFAULT_API_BASE
}

/**
 * Map low-level fetch / Safari network errors ("Load failed", "Failed to
 * fetch") onto a participant-facing message. Server validation messages
 * are passed through unchanged.
 */
export function formatApiErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : fallback
  const normalized = raw.trim().toLowerCase()
  if (
    normalized === 'load failed' ||
    normalized === 'failed to fetch' ||
    normalized === 'networkerror when attempting to fetch resource.' ||
    normalized === 'network error' ||
    normalized.includes('networkrequestfailed')
  ) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return raw || fallback
}

/**
 * Lock-screen outcome for a single Phase 2 recall test, written by
 * `LockScreenView` when the participant either unlocks or uses the
 * 5-failure skip failsafe.
 */
export type Phase2TestResult = {
  condition: PinCondition
  expectedPin: string
  expectedPinLength: number
  renderTimestamp: number
  firstTouchTimestamp: number | null
  timeToFirstTouch: number | null
  totalAuthTime: number
  errorCount: number
  submittedErrors: string[]
  keystrokeLog: Keystroke[]
  /** True when the participant used the skip failsafe instead of unlocking. */
  skipped: boolean
  /** True only when the entered PIN matched; always false on skip. */
  success: boolean
  completedAt: number
}

/**
 * The Phase 2 payload POSTed from `CompletionView` to `/api/telemetry`.
 * Nested test objects use the same metric fields as a Phase 1
 * `telemetrylogs` document so the collections can be merged on column
 * name. Demographics / TAM / SUS are omitted — they exist on the schema
 * but are not collected in this session.
 */
export type Phase2Submission = {
  prolificId: string
  prolificCode: string
  basePin: string
  lowTest: Phase2TestResult | null
  mediumTest: Phase2TestResult | null
  highTest: Phase2TestResult | null
}

export type Phase2Response = {
  ok: boolean
  id: string
  prolificCode: string
  completedAt: string
}

export type ParticipantInitResponse = {
  created: boolean
  participant: unknown
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function initParticipant(
  prolificId: string,
  basePin: string
): Promise<ParticipantInitResponse> {
  return request<ParticipantInitResponse>('/api/participant/init', {
    method: 'POST',
    body: JSON.stringify({ prolificId, basePin }),
  })
}

export async function postTelemetry(
  submission: Phase2Submission
): Promise<Phase2Response> {
  return request<Phase2Response>('/api/telemetry', {
    method: 'POST',
    body: JSON.stringify(submission),
  })
}
