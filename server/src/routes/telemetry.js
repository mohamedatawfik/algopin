import { Router } from 'express'

import TelemetryLog, { CONDITIONS } from '../models/TelemetryLog.js'

const router = Router()

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
