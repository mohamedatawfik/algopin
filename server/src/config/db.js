import mongoose from 'mongoose'

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is not set')
  }

  mongoose.set('strictQuery', true)

  try {
    await mongoose.connect(uri)
    const { host, name } = mongoose.connection
    console.log(`[db] connected to mongodb://${host}/${name}`)
  } catch (err) {
    console.error('[db] connection error:', err.message)
    throw err
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected')
  })

  mongoose.connection.on('error', (err) => {
    console.error('[db] error:', err.message)
  })

  return mongoose.connection
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
