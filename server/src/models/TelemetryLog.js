import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const CONDITIONS = ['Baseline', 'Low', 'Medium', 'High']
export const STUDY_PHASES = ['day1', 'day7']
export const KEY_KINDS = ['digit', 'clear', 'cancel']

// NASA-TLX ratings. The classic scale is 1-21; a simplified Likert (1-7) is
// also acceptable, so we validate the inclusive 1..21 range to support both.
export const NASA_TLX_MIN = 1
export const NASA_TLX_MAX = 21
export const NASA_TLX_FIELDS = [
  'mentalDemand',
  'physicalDemand',
  'temporalDemand',
  'performance',
  'effort',
  'frustration',
]

const keystrokeSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: KEY_KINDS, required: true },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
)

const tlxRating = {
  type: Number,
  required: true,
  min: NASA_TLX_MIN,
  max: NASA_TLX_MAX,
}

const nasaTlxSchema = new Schema(
  {
    mentalDemand: tlxRating,
    physicalDemand: tlxRating,
    temporalDemand: tlxRating,
    performance: tlxRating,
    effort: tlxRating,
    frustration: tlxRating,
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
    submittedErrors: { type: [String], default: [] },
    keystrokeLog: { type: [keystrokeSchema], default: [] },
    nasaTlx: { type: nasaTlxSchema, required: true },
    completedAt: { type: Number },
    schemaVersion: { type: Number },
  },
  {
    timestamps: true,
  }
)

const TelemetryLog = model('TelemetryLog', telemetryLogSchema)

export default TelemetryLog
