import { Router } from 'express'

import Participant from '../models/Participant.js'

const router = Router()

const PIN_REGEX = /^\d{4,8}$/

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

export default router
