import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const STUDY_PHASES = ['day1', 'day7']
export const SUS_ITEM_COUNT = 10
export const SUS_MIN = 1
export const SUS_MAX = 5

/**
 * Canonical shape of the MTurk completion code the participant sees on
 * the terminal `CompletionView` and pastes into the HIT page:
 * `ALGOPIN-MTA-XXXXXX`, where XXXXXX is 6 uppercase alphanumeric chars.
 * Kept in sync with `src/lib/completionCode.ts` on the frontend.
 */
export const COMPLETION_CODE_REGEX = /^ALGOPIN-MTA-[A-Z0-9]{6}$/

/**
 * Length of the tech-affinity questionnaire administered in the
 * DEMOGRAPHICS phase. Kept in sync with the schema on `TelemetryLog`.
 */
export const TECH_AFFINITY_ITEM_COUNT = 4

const demographicsSchema = new Schema(
  {
    birthDate: { type: String, default: '', trim: true },
    education: { type: String, default: '', trim: true },
    passwordFrequency: { type: String, default: '', trim: true },
    techAffinity: {
      type: [Number],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= TECH_AFFINITY_ITEM_COUNT &&
          arr.every((v) => typeof v === 'number' && Number.isFinite(v)),
        message: `techAffinity must be an array of up to ${TECH_AFFINITY_ITEM_COUNT} finite numbers`,
      },
    },
  },
  { _id: false }
)

const attentionCheckSchema = new Schema(
  {
    verificationYear: { type: String, default: '', trim: true },
    passedCheck: { type: Boolean, default: false },
  },
  { _id: false }
)

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
      // Suppress Mongoose's implicit `[]` default for array fields.
      // Without this, a `finalize.day1` subdoc created from just
      // `{ completedAt }` is materialized with `susAnswers: []`, and
      // the validator below then rejects the empty array because its
      // length isn't SUS_ITEM_COUNT. Persisting nothing means "no SUS
      // answers were provided", which is the intended semantics.
      default: undefined,
      validate: {
        validator: (arr) =>
          arr == null || arr.length === 0 || validSusAnswers(arr),
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
        'completionCode must match ALGOPIN-MTA-XXXXXX (uppercase alphanumeric)',
      ],
      index: true,
    },
    /**
     * Self-reported demographics captured in the DEMOGRAPHICS phase and
     * flushed to the participant record on finalize. Optional so legacy
     * participants without this data still validate.
     */
    demographics: { type: demographicsSchema, default: undefined },
    /**
     * Attention-check snapshot captured inline at the top of the terminal
     * completion screen (birth-year re-verification) and flushed on
     * finalize.
     */
    attentionCheck: { type: attentionCheckSchema, default: undefined },
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
