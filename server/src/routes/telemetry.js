import { Router } from 'express'

import TelemetryLog, {
  CONDITIONS,
  NASA_TLX_FIELDS,
  NASA_TLX_MAX,
  NASA_TLX_MIN,
} from '../models/TelemetryLog.js'

const router = Router()

function validateNasaTlx(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'nasaTlx must be an object with the six TLX ratings' }
  }
  const cleaned = {}
  for (const field of NASA_TLX_FIELDS) {
    const value = raw[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return {
        ok: false,
        error: `nasaTlx.${field} must be a number`,
      }
    }
    if (value < NASA_TLX_MIN || value > NASA_TLX_MAX) {
      return {
        ok: false,
        error: `nasaTlx.${field} must be between ${NASA_TLX_MIN} and ${NASA_TLX_MAX}`,
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

    const tlx = validateNasaTlx(body.nasaTlx)
    if (!tlx.ok) {
      return res.status(400).json({ error: tlx.error })
    }

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
      submittedErrors: Array.isArray(body.submittedErrors)
        ? body.submittedErrors
        : [],
      keystrokeLog: Array.isArray(body.keystrokeLog) ? body.keystrokeLog : [],
      nasaTlx: tlx.value,
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
