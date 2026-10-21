import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const CONDITIONS = ['Baseline', 'Low', 'Medium', 'High']
export const TEST_CONDITIONS = ['Low', 'Medium', 'High']
export const STUDY_PHASES = ['day1', 'day7']
export const KEY_KINDS = ['digit', 'clear', 'cancel', 'return']

/**
 * Canonical shape of the Phase 2 Prolific completion code. Kept in sync
 * with `src/lib/completionCode.ts` and the `Participant` model.
 */
export const COMPLETION_CODE_REGEX = /^ALGO-PH2-[A-Z0-9]{6}$/

export const BASE_PIN_REGEX = /^\d{4}$/

/**
 * Technology-Acceptance-Model (TAM) items administered immediately after
 * each algorithmic `*_TEST` phase in Phase 1. Phase 2 does not collect
 * TAM, so the subdoc is optional — it stays on the schema so a Compass /
 * CSV export of `telemetrylogs` has the same columns as Phase 1.
 */
export const TAM_ITEM_COUNT = 5
export const TAM_MIN = 1
export const TAM_MAX = 7
export const TAM_FIELDS = ['item1', 'item2', 'item3', 'item4', 'item5']

/**
 * System-Usability-Scale items administered per algorithmic condition in
 * Phase 1. Optional here for the same column-stability reason as TAM.
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

export const TECH_AFFINITY_ITEM_COUNT = 4

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
    // Phase 2 does not collect TAM/SUS. Nested items must stay optional so a
    // document without those survey blocks still passes validation.
    required: false,
    min,
    max,
    validate: {
      validator: (v) => v == null || Number.isInteger(v),
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
    gender: { type: String, default: '', trim: true },
    country: { type: String, default: '', trim: true },
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

/**
 * Lock-screen metrics for one recall test. Field names and types match
 * a Phase 1 per-condition `telemetrylogs` document so the nested
 * `lowTest` / `mediumTest` / `highTest` objects flatten into the same
 * analysis columns (timeToFirstTouch, totalAuthTime, errorCount,
 * skipped, …).
 */
const testResultSchema = new Schema(
  {
    condition: { type: String, enum: TEST_CONDITIONS, required: true },
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
    skipped: { type: Boolean, default: false },
    success: { type: Boolean, default: false },
    completedAt: { type: Number },
  },
  { _id: false }
)

/**
 * One document per Phase 2 participant in the same `telemetrylogs`
 * collection Phase 1 uses. Root identity fields plus the three nested
 * test objects; Phase 1 survey subdocs exist but are not required.
 */
const telemetryLogSchema = new Schema(
  {
    prolificId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    prolificCode: {
      type: String,
      required: false,
      trim: true,
      match: [
        COMPLETION_CODE_REGEX,
        'prolificCode must match ALGO-PH2-XXXXXX (uppercase alphanumeric)',
      ],
      index: true,
    },
    basePin: {
      type: String,
      required: true,
      match: [BASE_PIN_REGEX, 'basePin must be exactly 4 digits'],
    },
    currentPhase: {
      type: String,
      enum: STUDY_PHASES,
      default: 'day7',
    },
    lowTest: { type: testResultSchema, default: null },
    mediumTest: { type: testResultSchema, default: null },
    highTest: { type: testResultSchema, default: null },
    /**
     * Phase 1 survey / follow-up subdocs. Not collected in Phase 2 — none
     * of these are required. They stay on the schema so a Compass / CSV
     * export of `telemetrylogs` has the same columns as Phase 1.
     */
    tam: { type: tamSchema, required: false, default: undefined },
    tamSurveys: { type: Schema.Types.Mixed, required: false, default: undefined },
    sus: { type: susSchema, required: false, default: undefined },
    susSurveys: { type: Schema.Types.Mixed, required: false, default: undefined },
    demographics: { type: demographicsSchema, required: false, default: undefined },
    round2: { type: Schema.Types.Mixed, required: false, default: undefined },
    attentionCheck: {
      type: attentionCheckSchema,
      required: false,
      default: undefined,
    },
    completedAt: { type: Number },
    schemaVersion: { type: Number },
  },
  {
    timestamps: true,
  }
)

const TelemetryLog = model('TelemetryLog', telemetryLogSchema)

export default TelemetryLog
