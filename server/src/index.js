import 'dotenv/config'

import { createApp } from './app.js'
import { connectDB, disconnectDB } from './config/db.js'

const PORT = Number(process.env.PORT || 4000)
const MONGODB_URI = process.env.MONGODB_URI
const CORS_ORIGIN = process.env.CORS_ORIGIN

async function start() {
  await connectDB(MONGODB_URI)

  const app = createApp({ corsOrigin: CORS_ORIGIN })
  const server = app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`)
  })

  const shutdown = async (signal) => {
    console.log(`[server] received ${signal}, shutting down`)
    server.close(() => console.log('[server] http server closed'))
    await disconnectDB()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

start().catch((err) => {
  console.error('[server] failed to start:', err)
  process.exit(1)
})
