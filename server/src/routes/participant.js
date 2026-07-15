import { Router } from 'express'

import Participant, {
  COMPLETION_CODE_REGEX,
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

    // `susAnswers` is legacy — the current study collects SUS per
    // condition through /api/telemetry. Only validate it if the client
    // still bothers to send it.
    let susValue
    if (body.susAnswers !== undefined && body.susAnswers !== null) {
      const sus = validateSusAnswers(body.susAnswers)
      if (!sus.ok) {
        return res.status(400).json({ error: sus.error })
      }
      susValue = sus.value
    }

    // The MTurk completion code is required from `CompletionView` — this
    // is the token we cross-reference against the paste on the HIT page.
    if (typeof body.completionCode !== 'string') {
      return res
        .status(400)
        .json({ error: 'completionCode is required' })
    }
    if (!COMPLETION_CODE_REGEX.test(body.completionCode)) {
      return res.status(400).json({
        error:
          'completionCode must match Algopin-mta-XXXXXX (6 uppercase alphanumeric chars)',
      })
    }

    const trimmedId = body.mTurkId.trim()
    const completedAt = new Date()

    const finalizePayload = { completedAt }
    if (susValue !== undefined) {
      finalizePayload.susAnswers = susValue
    }

    const participant = await Participant.findOneAndUpdate(
      { mTurkId: trimmedId },
      {
        $set: {
          completionCode: body.completionCode,
          [`finalize.${phase}`]: finalizePayload,
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
      completionCode: body.completionCode,
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
