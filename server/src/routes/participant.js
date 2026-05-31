import { Router } from 'express'

import Participant, {
  STUDY_PHASES,
  SUS_ITEM_COUNT,
  SUS_MAX,
  SUS_MIN,
} from '../models/Participant.js'

const router = Router()

const PIN_REGEX = /^\d{4,8}$/
const DEFAULT_FINALIZE_PHASE = 'day1'

function validateSusAnswers(raw) {
  if (!Array.isArray(raw) || raw.length !== SUS_ITEM_COUNT) {
    return {
      ok: false,
      error: `susAnswers must be an array of ${SUS_ITEM_COUNT} integers`,
    }
  }
  for (let i = 0; i < raw.length; i += 1) {
    const v = raw[i]
    if (!Number.isInteger(v) || v < SUS_MIN || v > SUS_MAX) {
      return {
        ok: false,
        error: `susAnswers[${i}] must be an integer between ${SUS_MIN} and ${SUS_MAX}`,
      }
    }
  }
  return { ok: true, value: raw }
}

router.post('/init', async (req, res, next) => {
  try {
    const { mTurkId, basePin } = req.body || {}

    if (typeof mTurkId !== 'string' || mTurkId.trim().length === 0) {
      return res.status(400).json({ error: 'mTurkId is required' })
    }
    if (typeof basePin !== 'string' || !PIN_REGEX.test(basePin)) {
      return res
        .status(400)
        .json({ error: 'basePin must be a string of 4-8 digits' })
    }

    const trimmedId = mTurkId.trim()
    const existing = await Participant.findOne({ mTurkId: trimmedId }).lean()

    if (existing) {
      return res.status(200).json({
        created: false,
        participant: existing,
      })
    }

    const created = await Participant.create({
      mTurkId: trimmedId,
      basePin,
    })

    return res.status(201).json({
      created: true,
      participant: created.toObject(),
    })
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await Participant.findOne({
        mTurkId: req.body?.mTurkId?.trim?.(),
      }).lean()
      return res.status(200).json({ created: false, participant: existing })
    }
    next(err)
  }
})

router.post('/finalize', async (req, res, next) => {
  try {
    const body = req.body || {}

    if (typeof body.mTurkId !== 'string' || body.mTurkId.trim().length === 0) {
      return res.status(400).json({ error: 'mTurkId is required' })
    }

    const phase =
      typeof body.phase === 'string' ? body.phase : DEFAULT_FINALIZE_PHASE
    if (!STUDY_PHASES.includes(phase)) {
      return res.status(400).json({
        error: `phase must be one of: ${STUDY_PHASES.join(', ')}`,
      })
    }

    const sus = validateSusAnswers(body.susAnswers)
    if (!sus.ok) {
      return res.status(400).json({ error: sus.error })
    }

    const trimmedId = body.mTurkId.trim()
    const completedAt = new Date()

    const participant = await Participant.findOneAndUpdate(
      { mTurkId: trimmedId },
      {
        $set: {
          [`finalize.${phase}`]: {
            susAnswers: sus.value,
            completedAt,
          },
        },
      },
      { new: true, runValidators: true }
    )

    if (!participant) {
      return res
        .status(404)
        .json({ error: `participant not found for mTurkId: ${trimmedId}` })
    }

    return res.status(200).json({
      ok: true,
      phase,
      completedAt: completedAt.toISOString(),
      participant: participant.toObject(),
    })
  } catch (err) {
    if (err?.name === 'ValidationError') {
      return res.status(400).json({ error: err.message })
    }
    next(err)
  }
})

export default router
