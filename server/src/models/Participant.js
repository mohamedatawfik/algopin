import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const STUDY_PHASES = ['day1', 'day7']
export const SUS_ITEM_COUNT = 10
export const SUS_MIN = 1
export const SUS_MAX = 5

function validSusAnswers(arr) {
  if (!Array.isArray(arr) || arr.length !== SUS_ITEM_COUNT) return false
  return arr.every(
    (v) => Number.isInteger(v) && v >= SUS_MIN && v <= SUS_MAX
  )
}

const phaseFinalizeSchema = new Schema(
  {
    susAnswers: {
      type: [Number],
      required: true,
      validate: {
        validator: validSusAnswers,
        message: `susAnswers must be an array of ${SUS_ITEM_COUNT} integers between ${SUS_MIN} and ${SUS_MAX}`,
      },
    },
    completedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
)

const participantSchema = new Schema(
  {
    mTurkId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    basePin: {
      type: String,
      required: true,
      match: [/^\d{4,8}$/, 'basePin must be 4-8 digits'],
    },
    /**
     * Per-phase wrap-up payload. `finalize.day1` is written when the
     * participant submits the SUS at the end of Phase 1; `finalize.day7`
     * is reserved for the (future) Day-7 follow-up.
     */
    finalize: {
      day1: { type: phaseFinalizeSchema, default: undefined },
      day7: { type: phaseFinalizeSchema, default: undefined },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

const Participant = model('Participant', participantSchema)

export default Participant
