import cors from 'cors'
import express from 'express'

import algorithmsRouter from './routes/algorithms.js'
import participantRouter from './routes/participant.js'
import telemetryRouter from './routes/telemetry.js'

export function createApp({ corsOrigin } = {}) {
  const app = express()

  app.use(
    cors({
      origin: corsOrigin || true,
      credentials: false,
    })
  )
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'algopin-server' })
  })

  app.use('/api/algorithms', algorithmsRouter)
  app.use('/api/participant', participantRouter)
  app.use('/api/telemetry', telemetryRouter)

  app.use((req, res) => {
    res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` })
  })

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('[app] unhandled error:', err)
    const status = err.status || 500
    res.status(status).json({
      error: err.message || 'Internal server error',
    })
  })

  return app
}
