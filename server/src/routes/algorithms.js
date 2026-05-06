import { Router } from 'express'

import PredefinedAlgorithm, {
  COMPLEXITIES,
} from '../models/PredefinedAlgorithm.js'

const router = Router()

router.get('/:complexity', async (req, res, next) => {
  try {
    const { complexity } = req.params

    if (!COMPLEXITIES.includes(complexity)) {
      return res.status(400).json({
        error: `Unknown complexity '${complexity}'. Expected one of: ${COMPLEXITIES.join(', ')}`,
      })
    }

    const algorithms = await PredefinedAlgorithm.find({ complexity })
      .sort({ algorithmId: 1 })
      .lean()

    res.json({ complexity, algorithms })
  } catch (err) {
    next(err)
  }
})

export default router
