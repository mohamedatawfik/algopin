import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const STUDY_PHASES = ['day1', 'day7']
export const SUS_ITEM_COUNT = 10
export const SUS_MIN = 1
export const SUS_MAX = 5

/**
 * Canonical shape of the MTurk completion code the participant sees on
 * the terminal `CompletionView` and pastes into the HIT page:
 * `Algopin-mta-XXXXXX`, where XXXXXX is 6 uppercase alphanumeric chars.
 * Kept in sync with `src/lib/completionCode.ts` on the frontend.
 */
export const COMPLETION_CODE_REGEX = /^Algopin-mta-[A-Z0-9]{6}$/

function validSusAnswers(arr) {
  if (!Array.isArray(arr) || arr.length !== SUS_ITEM_COUNT) return false
  return arr.every(
    (v) => Number.isInteger(v) && v >= SUS_MIN && v <= SUS_MAX
  )
}

const phaseFinalizeSchema = new Schema(
  {
    /**
     * Optional per-phase SUS answers. Legacy Day-1 flows persisted the
     * full 10-item SUS here; the current per-condition SUS lives on
     * `TelemetryLog`, so `finalize.day1` can now be written with just a
     * `completionCode`. Kept optional so both call paths validate.
     */
    susAnswers: {
      type: [Number],
      required: false,
      validate: {
        validator: (arr) => arr == null || validSusAnswers(arr),
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
     * MTurk completion code shown on the terminal `CompletionView` and
     * pasted by the participant into the HIT page for payment. Persisted
     * server-side so we can cross-reference the MTurk submission against
     * the study database.
     */
    completionCode: {
      type: String,
      required: false,
      match: [
        COMPLETION_CODE_REGEX,
        'completionCode must match Algopin-mta-XXXXXX (uppercase alphanumeric)',
      ],
      index: true,
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
