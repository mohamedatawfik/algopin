import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const COMPLEXITIES = ['Low', 'Medium', 'High']
export const ALGORITHM_TYPES = [
  'MINUTE_DIGIT',
  'UNREAD_MESSAGES',
  'TIME_CROSS_SUM',
]

const predefinedAlgorithmSchema = new Schema(
  {
    algorithmId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    complexity: {
      type: String,
      required: true,
      enum: COMPLEXITIES,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ALGORITHM_TYPES,
    },
  },
  {
    timestamps: true,
  }
)

const PredefinedAlgorithm = model(
  'PredefinedAlgorithm',
  predefinedAlgorithmSchema
)

export default PredefinedAlgorithm
