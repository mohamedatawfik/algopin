import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const CONDITIONS = ['Baseline', 'Low', 'Medium', 'High']
export const STUDY_PHASES = ['day1', 'day7']
export const KEY_KINDS = ['digit', 'clear', 'cancel', 'return']

/**
 * Technology-Acceptance-Model (TAM) items administered immediately after
 * each `*_TEST` phase. Frontend renders 5 items on a 1..7 Likert scale;
 * each is persisted as a named integer field inside the `tam` subdoc so
 * the survey structure is self-describing in the DB, mirroring how the
 * (removed) `nasaTlx` subdoc used named dimensions.
 */
export const TAM_ITEM_COUNT = 5
export const TAM_MIN = 1
export const TAM_MAX = 7
export const TAM_FIELDS = ['item1', 'item2', 'item3', 'item4', 'item5']

/**
 * System-Usability-Scale items administered per condition, right after
 * the TAM survey. 10 canonical Brooke items on a 1..5 Likert scale, each
 * persisted as a named integer field inside the `sus` subdoc.
 */
export const SUS_ITEM_COUNT = 10
export const SUS_MIN = 1
export const SUS_MAX = 5
export const SUS_FIELDS = [
  'item1',
  'item2',
  'item3',
  'item4',
  'item5',
  'item6',
  'item7',
  'item8',
  'item9',
  'item10',
]

/**
 * Demographics self-reported by the participant in the DEMOGRAPHICS phase
 * (between ONBOARDING and STATIC_SETUP). `techAffinity` captures answers to
 * a 4-item tech-affinity questionnaire as an ordered array of numbers so
 * item order is preserved verbatim.
 */
export const TECH_AFFINITY_ITEM_COUNT = 4

/**
 * Attention-check probe captured inline at the top of the terminal
 * completion screen (birth-year re-verification). `verificationYear` is
 * the raw string typed by the participant; `passedCheck` is the boolean
 * the frontend derived by comparing it against the expected answer.
 */

const keystrokeSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: KEY_KINDS, required: true },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
)

function makeLikertRating({ min, max }) {
  return {
    type: Number,
    required: true,
    min,
    max,
    validate: {
      validator: Number.isInteger,
      message: (props) => `${props.path} must be an integer`,
    },
  }
}

const tamRating = makeLikertRating({ min: TAM_MIN, max: TAM_MAX })

const tamSchema = new Schema(
  {
    item1: tamRating,
    item2: tamRating,
    item3: tamRating,
    item4: tamRating,
    item5: tamRating,
  },
  { _id: false }
)

const susRating = makeLikertRating({ min: SUS_MIN, max: SUS_MAX })

const susSchema = new Schema(
  {
    item1: susRating,
    item2: susRating,
    item3: susRating,
    item4: susRating,
    item5: susRating,
    item6: susRating,
    item7: susRating,
    item8: susRating,
    item9: susRating,
    item10: susRating,
  },
  { _id: false }
)

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

const telemetryLogSchema = new Schema(
  {
    mTurkId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    condition: {
      type: String,
      required: true,
      enum: CONDITIONS,
      index: true,
    },
    currentPhase: {
      type: String,
      enum: STUDY_PHASES,
    },
    expectedPin: { type: String },
    expectedPinLength: { type: Number },
    renderTimestamp: { type: Number, required: true },
    firstTouchTimestamp: { type: Number, default: null },
    timeToFirstTouch: { type: Number, default: null },
    totalAuthTime: { type: Number, required: true },
    errorCount: { type: Number, default: 0 },
    returnCount: { type: Number, default: 0 },
    submittedErrors: { type: [String], default: [] },
    keystrokeLog: { type: [keystrokeSchema], default: [] },
    /**
     * Two distinct per-phase survey subdocs. Both are required — a
     * telemetry document only lands here after the participant submits
     * the SUS for the matching `*_TEST` condition, at which point both
     * `tam` and `sus` are guaranteed to be present on the payload.
     */
    tam: { type: tamSchema, required: true },
    sus: { type: susSchema, required: true },
    /**
     * Participant-level demographics collected once in the DEMOGRAPHICS
     * phase. Optional on any given telemetry doc because the same values
     * are also written to the `Participant` record at finalize time; the
     * subdoc is available on every telemetry POST so per-condition
     * analyses can join without a second lookup.
     */
    demographics: { type: demographicsSchema, default: undefined },
    /**
     * Optional final-phase attention-check snapshot. Only populated on the
     * last telemetry doc for a participant (or is written to the
     * Participant record at finalize time).
     */
    attentionCheck: { type: attentionCheckSchema, default: undefined },
    completedAt: { type: Number },
    schemaVersion: { type: Number },
  },
  {
    timestamps: true,
  }
)

const TelemetryLog = model('TelemetryLog', telemetryLogSchema)

export default TelemetryLog
