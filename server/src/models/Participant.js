import mongoose from 'mongoose'

const { Schema, model } = mongoose

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
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
)

const Participant = model('Participant', participantSchema)

export default Participant
