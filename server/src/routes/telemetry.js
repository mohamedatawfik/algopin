import { Router } from 'express'

import Participant, { COMPLETION_CODE_REGEX } from '../models/Participant.js'
import TelemetryLog, {
  BASE_PIN_REGEX,
  SUS_FIELDS,
  SUS_MAX,
  SUS_MIN,
  TAM_FIELDS,
  TAM_MAX,
  TAM_MIN,
  TECH_AFFINITY_ITEM_COUNT,
  TEST_CONDITIONS,
} from '../models/TelemetryLog.js'

const router = Router()

/**
 * Normalize an incoming survey payload into the canonical named-field
 * object shape ({ item1, item2, ... }). Phase 2 does not send these, but
 * the fields stay on the schema so a stray / legacy POST still validates.
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
    gender: typeof raw.gender === 'string' ? raw.gender : '',
    country: typeof raw.country === 'string' ? raw.country : '',
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

/**
 * Normalize one recall-test result. A slot may legitimately be null — a
 * participant who abandons the session mid-flow never produces one — so
 * only a non-null value with a bad shape is an error.
 */
function normalizeTestResult(raw, name) {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: `${name} must be an object or null` }
  }
  if (!TEST_CONDITIONS.includes(raw.condition)) {
    return {
      ok: false,
      error: `${name}.condition must be one of: ${TEST_CONDITIONS.join(', ')}`,
    }
  }
  if (typeof raw.renderTimestamp !== 'number') {
    return { ok: false, error: `${name}.renderTimestamp must be a number` }
  }
  if (typeof raw.totalAuthTime !== 'number') {
    return { ok: false, error: `${name}.totalAuthTime must be a number` }
  }
  const skipped = Boolean(raw.skipped)
  return {
    ok: true,
    value: {
      condition: raw.condition,
      expectedPin: typeof raw.expectedPin === 'string' ? raw.expectedPin : '',
      expectedPinLength:
        typeof raw.expectedPinLength === 'number' ? raw.expectedPinLength : 0,
      renderTimestamp: raw.renderTimestamp,
      firstTouchTimestamp:
        typeof raw.firstTouchTimestamp === 'number'
          ? raw.firstTouchTimestamp
          : null,
      timeToFirstTouch:
        typeof raw.timeToFirstTouch === 'number' ? raw.timeToFirstTouch : null,
      totalAuthTime: raw.totalAuthTime,
      errorCount: typeof raw.errorCount === 'number' ? raw.errorCount : 0,
      returnCount: typeof raw.returnCount === 'number' ? raw.returnCount : 0,
      submittedErrors: Array.isArray(raw.submittedErrors)
        ? raw.submittedErrors
        : [],
      keystrokeLog: Array.isArray(raw.keystrokeLog) ? raw.keystrokeLog : [],
      skipped,
      success: skipped ? false : raw.success === true,
      completedAt:
        typeof raw.completedAt === 'number' ? raw.completedAt : undefined,
    },
  }
}

/**
 * Phase 2 write. Body:
 *
 *   { prolificId, prolificCode, basePin, lowTest, mediumTest, highTest }
 *
 * Optional Phase 1 survey blocks (`tam`, `sus`, `demographics`,
 * `attentionCheck`) are accepted when present and omitted otherwise.
 *
 * Saved with `new TelemetryLog(...).save()` so document validators run
 * on the full payload. A retry for the same `prolificId` updates the
 * existing row instead of colliding on the unique index. The matching
 * `participants` row is finalized with `day7` in the same request.
 */
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {}

    if (
      typeof body.prolificId !== 'string' ||
      body.prolificId.trim().length === 0
    ) {
      return res.status(400).json({ error: 'prolificId is required' })
    }
    if (
      typeof body.prolificCode !== 'string' ||
      !COMPLETION_CODE_REGEX.test(body.prolificCode)
    ) {
      return res.status(400).json({
        error:
          'prolificCode must match ALGO-PH2-XXXXXX (6 uppercase alphanumeric chars)',
      })
    }
    if (typeof body.basePin !== 'string' || !BASE_PIN_REGEX.test(body.basePin)) {
      return res
        .status(400)
        .json({ error: 'basePin must be a string of exactly 4 digits' })
    }

    const slots = {}
    for (const name of ['lowTest', 'mediumTest', 'highTest']) {
      const result = normalizeTestResult(body[name], name)
      if (!result.ok) {
        return res.status(400).json({ error: result.error })
      }
      slots[name] = result.value
    }

    let tamValue
    let susValue
    if (body.tam != null) {
      const tam = validateNamedLikertBlock(body.tam, {
        name: 'tam',
        fieldNames: TAM_FIELDS,
        min: TAM_MIN,
        max: TAM_MAX,
      })
      if (!tam.ok) {
        return res.status(400).json({ error: tam.error })
      }
      tamValue = tam.value
    }
    if (body.sus != null) {
      const sus = validateNamedLikertBlock(body.sus, {
        name: 'sus',
        fieldNames: SUS_FIELDS,
        min: SUS_MIN,
        max: SUS_MAX,
      })
      if (!sus.ok) {
        return res.status(400).json({ error: sus.error })
      }
      susValue = sus.value
    }

    const demographics = normalizeDemographicsBlock(body.demographics)
    const attentionCheck = normalizeAttentionCheckBlock(body.attentionCheck)
    const trimmedId = body.prolificId.trim()
    const completedAt = Date.now()

    const telemetryPayload = {
      prolificId: trimmedId,
      prolificCode: body.prolificCode,
      basePin: body.basePin,
      currentPhase: body.currentPhase === 'day1' ? 'day1' : 'day7',
      completedAt:
        typeof body.completedAt === 'number' ? body.completedAt : completedAt,
      ...(typeof body.schemaVersion === 'number'
        ? { schemaVersion: body.schemaVersion }
        : {}),
      ...(slots.lowTest ? { lowTest: slots.lowTest } : {}),
      ...(slots.mediumTest ? { mediumTest: slots.mediumTest } : {}),
      ...(slots.highTest ? { highTest: slots.highTest } : {}),
      ...(tamValue ? { tam: tamValue } : {}),
      ...(susValue ? { sus: susValue } : {}),
      ...(demographics ? { demographics } : {}),
      ...(attentionCheck ? { attentionCheck } : {}),
    }

    let doc
    try {
      const existing = await TelemetryLog.findOne({ prolificId: trimmedId })
      if (existing) {
        existing.set(telemetryPayload)
        doc = await existing.save()
      } else {
        const newLog = new TelemetryLog(telemetryPayload)
        doc = await newLog.save()
      }
    } catch (error) {
      console.error('Telemetry Save Error:', error)
      if (error?.code === 11000) {
        const raced = await TelemetryLog.findOne({ prolificId: trimmedId })
        if (raced) {
          raced.set(telemetryPayload)
          doc = await raced.save()
        } else {
          throw error
        }
      } else if (error?.name === 'ValidationError') {
        return res.status(400).json({ error: error.message })
      } else {
        throw error
      }
    }

    const finalizePayload = { completedAt: new Date(completedAt) }
    try {
      await Participant.findOneAndUpdate(
        { prolificId: trimmedId },
        {
          $set: {
            basePin: body.basePin,
            prolificCode: body.prolificCode,
            'finalize.day7': finalizePayload,
          },
        },
        { upsert: true, runValidators: true, setDefaultsOnInsert: true }
      )
    } catch (error) {
      console.error('Participant Save Error:', error)
      throw error
    }

    return res.status(201).json({
      ok: true,
      id: doc._id,
      prolificCode: doc.prolificCode,
      completedAt: doc.updatedAt.toISOString(),
    })
  } catch (err) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})

export default router
