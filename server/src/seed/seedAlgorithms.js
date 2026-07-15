import 'dotenv/config'

import { connectDB, disconnectDB } from '../config/db.js'
import PredefinedAlgorithm from '../models/PredefinedAlgorithm.js'

const ALGORITHMS = [
  {
    algorithmId: 'low-minute-digit',
    complexity: 'Low',
    type: 'MINUTE_DIGIT',
    description:
      'Replace the last digit of the base PIN with the last digit of the current minute.',
  },
  {
    algorithmId: 'medium-minute-plus-battery',
    complexity: 'Medium',
    type: 'MINUTE_PLUS_BATTERY',
    description:
      'Replace the last digit of the base PIN with the last digit of (the current minute plus the battery percentage). If the sum is two digits, use only the last digit so the PIN length stays the same.',
  },
  {
    algorithmId: 'high-minute-plus-triple-battery',
    complexity: 'High',
    type: 'MINUTE_PLUS_TRIPLE_BATTERY',
    description:
      'Replace the last digit of the base PIN with the last digit of ((minute + battery) × 3). Add the last digits of the minute and battery first, then multiply that sum by 3. If the result is two digits, use only the last digit so the PIN length stays the same.',
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
