import { Router } from 'express'

import Participant, {
  COMPLETION_CODE_REGEX,
  STUDY_PHASES,
  SUS_ITEM_COUNT,
  SUS_MAX,
  SUS_MIN,
  TECH_AFFINITY_ITEM_COUNT,
} from '../models/Participant.js'

const router = Router()

const PIN_REGEX = /^\d{4,8}$/
const DEFAULT_FINALIZE_PHASE = 'day1'

/**
 * Normalize demographics-like sub-payloads to their canonical shape and
 * reject clearly malformed values. Both blocks are optional on the wire.
 */
function normalizeDemographics(raw) {
  if (raw == null) return { ok: true, value: undefined }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'demographics must be an object' }
  }
  const techAffinityRaw = raw.techAffinity
  let techAffinity = []
  if (techAffinityRaw !== undefined && techAffinityRaw !== null) {
    if (!Array.isArray(techAffinityRaw)) {
      return { ok: false, error: 'demographics.techAffinity must be an array' }
    }
    if (techAffinityRaw.length > TECH_AFFINITY_ITEM_COUNT) {
      return {
        ok: false,
        error: `demographics.techAffinity must have at most ${TECH_AFFINITY_ITEM_COUNT} entries`,
      }
    }
    for (let i = 0; i < techAffinityRaw.length; i += 1) {
      const v = techAffinityRaw[i]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return {
          ok: false,
          error: `demographics.techAffinity[${i}] must be a finite number`,
        }
      }
    }
    techAffinity = techAffinityRaw
  }
  return {
    ok: true,
    value: {
      birthDate: typeof raw.birthDate === 'string' ? raw.birthDate : '',
      education: typeof raw.education === 'string' ? raw.education : '',
      passwordFrequency:
        typeof raw.passwordFrequency === 'string' ? raw.passwordFrequency : '',
      techAffinity,
    },
  }
}

function normalizeAttentionCheck(raw) {
  if (raw == null) return { ok: true, value: undefined }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'attentionCheck must be an object' }
  }
  const verificationYear =
    typeof raw.verificationYear === 'string' ? raw.verificationYear : ''
  const passedCheck = Boolean(raw.passedCheck)
  return { ok: true, value: { verificationYear, passedCheck } }
}

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
          'completionCode must match ALGOPIN-MTA-XXXXXX (6 uppercase alphanumeric chars)',
      })
    }

    const demographics = normalizeDemographics(body.demographics)
    if (!demographics.ok) {
      return res.status(400).json({ error: demographics.error })
    }
    const attentionCheck = normalizeAttentionCheck(body.attentionCheck)
    if (!attentionCheck.ok) {
      return res.status(400).json({ error: attentionCheck.error })
    }

    const trimmedId = body.mTurkId.trim()
    const completedAt = new Date()

    const finalizePayload = { completedAt }
    if (susValue !== undefined) {
      finalizePayload.susAnswers = susValue
    }

    const setUpdate = {
      completionCode: body.completionCode,
      [`finalize.${phase}`]: finalizePayload,
    }
    if (demographics.value !== undefined) {
      setUpdate.demographics = demographics.value
    }
    if (attentionCheck.value !== undefined) {
      setUpdate.attentionCheck = attentionCheck.value
    }

    const participant = await Participant.findOneAndUpdate(
      { mTurkId: trimmedId },
      { $set: setUpdate },
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
