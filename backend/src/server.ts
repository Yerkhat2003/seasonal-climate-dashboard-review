import Fastify from 'fastify'
import cors from '@fastify/cors'

const app = Fastify({ logger: true })
await app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') ?? true })

app.get('/health', async () => ({ ok: true, service: 'seasonal-climate-api', timestamp: new Date().toISOString() }))

app.get<{ Querystring: { latitude?: string; longitude?: string } }>('/api/forecast', async (request, reply) => {
  const latitude = Number(request.query.latitude)
  const longitude = Number(request.query.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return reply.code(400).send({ error: 'latitude and longitude are required numbers' })
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '16',
  }).toString()
  const upstream = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!upstream.ok) return reply.code(502).send({ error: 'Open-Meteo forecast is unavailable' })
  const payload = await upstream.json()
  reply.header('Cache-Control', 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400')
  return { updatedAt: new Date().toISOString(), source: 'Open-Meteo Forecast', ...payload }
})

const port = Number(process.env.PORT ?? 10000)
await app.listen({ port, host: '0.0.0.0' })
