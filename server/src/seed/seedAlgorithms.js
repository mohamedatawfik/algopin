import 'dotenv/config'

import { connectDB, disconnectDB } from '../config/db.js'
import PredefinedAlgorithm from '../models/PredefinedAlgorithm.js'

const ALGORITHMS = [
  {
    algorithmId: 'low-minute-digit',
    complexity: 'Low',
    type: 'MINUTE_DIGIT',
    description:
      'Replace the participant-chosen digit of the base PIN with d, the units digit of the current minute.',
  },
  {
    algorithmId: 'medium-minute-plus-battery',
    complexity: 'Medium',
    type: 'MINUTE_PLUS_BATTERY',
    description:
      'Replace the participant-chosen digit of the base PIN with (d + b) mod 10, where d is the units digit of the current minute and b is the units digit of the battery percentage shown on the lock screen. The resulting digit is always a single 0..9 character, so the PIN length is preserved.',
  },
  {
    algorithmId: 'high-minute-plus-triple-battery',
    complexity: 'High',
    type: 'MINUTE_PLUS_TRIPLE_BATTERY',
    description:
      'Replace the participant-chosen digit of the base PIN with (d + 3 * b) mod 10, where d is the units digit of the current minute and b is the units digit of the battery percentage. The resulting digit is always a single 0..9 character, so the PIN length is preserved.',
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
