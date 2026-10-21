import cors from 'cors'
import express from 'express'

import algorithmsRouter from './routes/algorithms.js'
import participantRouter from './routes/participant.js'
import telemetryRouter from './routes/telemetry.js'

const LOCALHOST_ORIGIN_REGEX = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

/**
 * Build the `cors` origin predicate. `CORS_ORIGIN` may be a single origin
 * or a comma-separated list; any localhost origin is always allowed so a
 * Vite dev server that lands on 5174/5175 because 5173 was taken doesn't
 * silently fail the participant's final submission. An unset value allows
 * every origin, which is what the LAN/pilot setup relies on.
 */
function buildCorsOrigin(corsOrigin) {
  const allowed = (corsOrigin || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (allowed.length === 0) return true
  return (origin, callback) => {
    // Same-origin and non-browser callers (curl, health checks) send no
    // Origin header at all.
    if (!origin) return callback(null, true)
    if (allowed.includes(origin) || LOCALHOST_ORIGIN_REGEX.test(origin)) {
      return callback(null, true)
    }
    return callback(null, false)
  }
}

export function createApp({ corsOrigin } = {}) {
  const app = express()

  app.use(
    cors({
      origin: buildCorsOrigin(corsOrigin),
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
