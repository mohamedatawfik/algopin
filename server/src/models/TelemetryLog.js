import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const CONDITIONS = ['Baseline', 'Low', 'Medium', 'High']
export const STUDY_PHASES = ['day1', 'day7']
export const KEY_KINDS = ['digit', 'clear', 'cancel']

const keystrokeSchema = new Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: KEY_KINDS, required: true },
    timestamp: { type: Number, required: true },
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
    completedAt: { type: Number },
    schemaVersion: { type: Number },
  },
  {
    timestamps: true,
  }
)

const TelemetryLog = model('TelemetryLog', telemetryLogSchema)

export default TelemetryLog
