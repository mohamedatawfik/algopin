import 'dotenv/config'

import { connectDB, disconnectDB } from '../config/db.js'
import PredefinedAlgorithm from '../models/PredefinedAlgorithm.js'

const ALGORITHMS = [
  {
    algorithmId: 'low-minute-digit',
    complexity: 'Low',
    type: 'MINUTE_DIGIT',
    description:
      'Replace each chosen position of the base PIN with the units digit of the current minute.',
  },
  {
    algorithmId: 'medium-unread-messages',
    complexity: 'Medium',
    type: 'UNREAD_MESSAGES',
    description:
      'Replace each chosen position of the base PIN with the units digit of the simulated unread messages count.',
  },
  {
    algorithmId: 'high-time-cross-sum',
    complexity: 'High',
    type: 'TIME_CROSS_SUM',
    description:
      'Replace each chosen position of the base PIN with the units digit of the cross-sum of the current time (HH+MM).',
  },
]

async function seed() {
  await connectDB(process.env.MONGODB_URI)

  for (const alg of ALGORITHMS) {
    const result = await PredefinedAlgorithm.findOneAndUpdate(
      { algorithmId: alg.algorithmId },
      { $set: alg },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    console.log(
      `[seed] upserted ${result.algorithmId} (${result.complexity} / ${result.type})`
    )
  }

  console.log(`[seed] done. ${ALGORITHMS.length} algorithm(s) ensured.`)
}

seed()
  .catch((err) => {
    console.error('[seed] failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectDB()
  })
