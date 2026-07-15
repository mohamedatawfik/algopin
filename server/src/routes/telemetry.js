import { Router } from 'express'

import TelemetryLog, {
  CONDITIONS,
  SUS_FIELDS,
  SUS_MAX,
  SUS_MIN,
  TAM_FIELDS,
  TAM_MAX,
  TAM_MIN,
  TECH_AFFINITY_ITEM_COUNT,
} from '../models/TelemetryLog.js'

const router = Router()

/**
 * Normalize an incoming survey payload into the canonical named-field
 * object shape ({ item1, item2, ... }). We accept two wire formats so the
 * frontend can send whichever is more convenient:
 *
 *   1. Canonical object: { item1: 4, item2: 6, ... }
 *   2. Ordered array:    [4, 6, ...]   -> zipped against `fieldNames`
 *
 * Any other shape returns null so the caller can bail with a 400.
 */
function normalizeSurveyPayload(raw, fieldNames) {
  if (Array.isArray(raw)) {
    if (raw.length !== fieldNames.length) return null
    const obj = {}
    for (let i = 0; i < fieldNames.length; i += 1) {
      obj[fieldNames[i]] = raw[i]
    }
    return obj
  }
  if (raw !== null && typeof raw === 'object') {
    return raw
  }
  return null
}

/**
 * Best-effort normalisers for the two optional participant-level blocks a
 * telemetry POST may carry (demographics + attention check). Malformed
 * shapes return null; the route then omits the field rather than failing
 * the entire telemetry write.
 */
function normalizeDemographicsBlock(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const techAffinityRaw = Array.isArray(raw.techAffinity)
    ? raw.techAffinity.filter(
        (v) => typeof v === 'number' && Number.isFinite(v)
      )
    : []
  return {
    birthDate: typeof raw.birthDate === 'string' ? raw.birthDate : '',
    education: typeof raw.education === 'string' ? raw.education : '',
    passwordFrequency:
      typeof raw.passwordFrequency === 'string' ? raw.passwordFrequency : '',
    techAffinity: techAffinityRaw.slice(0, TECH_AFFINITY_ITEM_COUNT),
  }
}

function normalizeAttentionCheckBlock(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  return {
    verificationYear:
      typeof raw.verificationYear === 'string' ? raw.verificationYear : '',
    passedCheck: Boolean(raw.passedCheck),
  }
}

function validateNamedLikertBlock(raw, { name, fieldNames, min, max }) {
  const normalized = normalizeSurveyPayload(raw, fieldNames)
  if (!normalized) {
    return {
      ok: false,
      error: `${name} must be an object with ${fieldNames.length} numeric fields (or an array of ${fieldNames.length} numbers)`,
    }
  }
  const cleaned = {}
  for (const field of fieldNames) {
    const value = normalized[field]
    if (!Number.isInteger(value)) {
      return {
        ok: false,
        error: `${name}.${field} must be an integer`,
      }
    }
    if (value < min || value > max) {
      return {
        ok: false,
        error: `${name}.${field} must be between ${min} and ${max}`,
      }
    }
    cleaned[field] = value
  }
  return { ok: true, value: cleaned }
}

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}

    // The frontend submits `currentCondition`; the schema persists it as `condition`.
    // Accept either to keep the wire format flexible.
    const condition = body.condition ?? body.currentCondition

    if (typeof body.mTurkId !== 'string' || body.mTurkId.trim().length === 0) {
      return res.status(400).json({ error: 'mTurkId is required' })
    }
    if (!CONDITIONS.includes(condition)) {
      return res.status(400).json({
        error: `condition must be one of: ${CONDITIONS.join(', ')}`,
      })
    }
    if (typeof body.renderTimestamp !== 'number') {
      return res
        .status(400)
        .json({ error: 'renderTimestamp must be a number' })
    }
    if (typeof body.totalAuthTime !== 'number') {
      return res.status(400).json({ error: 'totalAuthTime must be a number' })
    }

    const tam = validateNamedLikertBlock(body.tam, {
      name: 'tam',
      fieldNames: TAM_FIELDS,
      min: TAM_MIN,
      max: TAM_MAX,
    })
    if (!tam.ok) {
      return res.status(400).json({ error: tam.error })
    }

    const sus = validateNamedLikertBlock(body.sus, {
      name: 'sus',
      fieldNames: SUS_FIELDS,
      min: SUS_MIN,
      max: SUS_MAX,
    })
    if (!sus.ok) {
      return res.status(400).json({ error: sus.error })
    }

    const demographics = normalizeDemographicsBlock(body.demographics)
    const attentionCheck = normalizeAttentionCheckBlock(body.attentionCheck)

    const doc = await TelemetryLog.create({
      mTurkId: body.mTurkId.trim(),
      condition,
      currentPhase: body.currentPhase,
      expectedPin: body.expectedPin,
      expectedPinLength: body.expectedPinLength,
      renderTimestamp: body.renderTimestamp,
      firstTouchTimestamp: body.firstTouchTimestamp ?? null,
      timeToFirstTouch: body.timeToFirstTouch ?? null,
      totalAuthTime: body.totalAuthTime,
      errorCount: body.errorCount ?? 0,
      returnCount:
        typeof body.returnCount === 'number' && body.returnCount >= 0
          ? body.returnCount
          : 0,
      submittedErrors: Array.isArray(body.submittedErrors)
        ? body.submittedErrors
        : [],
      keystrokeLog: Array.isArray(body.keystrokeLog) ? body.keystrokeLog : [],
      tam: tam.value,
      sus: sus.value,
      ...(demographics ? { demographics } : {}),
      ...(attentionCheck ? { attentionCheck } : {}),
      completedAt: body.completedAt,
      schemaVersion: body.schemaVersion,
    })

    res.status(201).json({ id: doc._id, createdAt: doc.createdAt })
  } catch (err) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})

export default router
