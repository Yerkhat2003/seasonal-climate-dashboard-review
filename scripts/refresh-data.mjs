import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cities = [
  ['aktobe', 'Актобе', 50.2839, 57.167], ['almaty', 'Алматы', 43.2389, 76.8897],
  ['astana', 'Астана', 51.1694, 71.4491], ['atyrau', 'Атырау', 47.0945, 51.9239],
  ['karaganda', 'Караганда', 49.806, 73.085], ['kostanay', 'Костанай', 53.2144, 63.6246],
  ['pavlodar', 'Павлодар', 52.2873, 76.9674], ['petropavl', 'Петропавловск', 54.8728, 69.143],
  ['semey', 'Семей', 50.4111, 80.2275], ['oskemen', 'Усть-Каменогорск', 49.9483, 82.6285],
  ['shymkent', 'Шымкент', 42.3417, 69.5901],
].map(([id, name, latitude, longitude]) => ({ id, name, latitude, longitude }))

const currentYear = new Date().getUTCFullYear()
const startYear = 2011
const warmSeasonThreshold = 5
const dateKey = (date) => date.toISOString().slice(0, 10)
const weekOfYear = (value) => {
  const date = new Date(`${value}T00:00:00Z`)
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.min(52, Math.floor((date - first) / 86_400_000 / 7) + 1)
}
const mean = (values) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
const round = (value) => value === null ? null : Number(value.toFixed(1))
const std = (values) => {
  const average = mean(values)
  return average === null ? null : Math.sqrt(mean(values.map((value) => (value - average) ** 2)))
}
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function weatherAll(requestedCities) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.search = new URLSearchParams({
    latitude: requestedCities.map((city) => city.latitude).join(','),
    longitude: requestedCities.map((city) => city.longitude).join(','),
    start_date: `${startYear}-01-01`, end_date: dateKey(new Date()),
    daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min', timezone: 'UTC',
  }).toString()
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url)
    if (response.ok) {
      const payload = await response.json()
      return Array.isArray(payload) ? payload : [payload]
    }
    if (response.status !== 429 || attempt === 5) throw new Error(`Open-Meteo returned ${response.status}`)
    const retryAfter = Number(response.headers.get('retry-after')) || 30
    console.log(`Rate limit reached; retrying batch in ${retryAfter}s`)
    await sleep(retryAfter * 1_000)
  }
}

function aggregate(payload) {
  const records = new Map()
  payload.daily.time.forEach((date, index) => {
    const year = Number(date.slice(0, 4)); const week = weekOfYear(date)
    const key = `${year}-${week}`
    if (!records.has(key)) records.set(key, { year, week, mean: [], max: [], min: [], days: [] })
    const item = records.get(key)
    for (const metric of ['mean', 'max', 'min']) {
      const value = payload.daily[`temperature_2m_${metric}`][index]
      if (typeof value === 'number') item[metric].push(value)
    }
    item.days.push({ date, value: payload.daily.temperature_2m_mean[index] })
  })
  const series = {}
  for (const item of records.values()) {
    series[item.year] ??= Array.from({ length: 52 }, (_, index) => ({ week: index + 1, mean: null, max: null, min: null }))
    series[item.year][item.week - 1] = { week: item.week, mean: round(mean(item.mean)), max: round(mean(item.max)), min: round(mean(item.min)) }
  }
  return { series, records: [...records.values()] }
}

function transitions(records) {
  const byYear = new Map()
  records.forEach((record) => { const list = byYear.get(record.year) ?? []; list.push(record); byYear.set(record.year, list) })
  const spring = []; const autumn = []
  for (const year of byYear.values()) {
    const weeks = year.sort((a, b) => a.week - b.week)
    const springWeek = weeks.find((week, index) => week.week >= 8 && week.week <= 30 && mean(week.mean) <= warmSeasonThreshold && mean(weeks[index + 1]?.mean ?? []) <= warmSeasonThreshold)?.week
    const autumnWeek = [...weeks].reverse().find((week, reverseIndex, reversed) => week.week >= 28 && week.week <= 48 && mean(week.mean) <= warmSeasonThreshold && mean(reversed[reverseIndex + 1]?.mean ?? []) <= warmSeasonThreshold)?.week
    if (springWeek) spring.push(springWeek * 7)
    if (autumnWeek) autumn.push(autumnWeek * 7)
  }
  return { springDay: round(mean(spring)), autumnDay: round(mean(autumn)), springStd: round(std(spring)), autumnStd: round(std(autumn)) }
}

function calculateAnalogs(series) {
  const current = series[currentYear] ?? []
  const observed = current.map((item) => item.mean).filter((value) => value !== null).length
  if (observed < 4) return []
  return Object.entries(series).filter(([year]) => Number(year) < currentYear).map(([year, points]) => {
    const pairs = points.slice(0, observed).map((point, index) => [point.mean, current[index]?.mean]).filter(([a, b]) => a !== null && b !== null)
    const rmse = Math.sqrt(pairs.reduce((total, [a, b]) => total + (a - b) ** 2, 0) / pairs.length)
    return { year: Number(year), rmse: Number(rmse.toFixed(2)) }
  }).sort((a, b) => a.rmse - b.rmse).slice(0, 3).map((item, index) => ({ ...item, rank: index + 1 }))
}

function calculateBacktest(series) {
  const currentObserved = (series[currentYear] ?? []).filter((point) => point.mean !== null).length
  const observedWeeks = Math.min(currentObserved, 36)
  const years = Object.keys(series).map(Number).filter((year) => year < currentYear).sort((a, b) => a - b)
  if (observedWeeks < 4) return { sampleCount: 0, observedWeeks, futureRmse: null }
  const errors = []
  for (const targetYear of years) {
    const candidates = years.filter((year) => year < targetYear)
    if (candidates.length < 3) continue
    const target = series[targetYear]
    const top = candidates.map((year) => {
      const pairs = series[year].slice(0, observedWeeks).map((point, index) => [point.mean, target[index]?.mean]).filter(([a, b]) => a !== null && b !== null)
      const rmse = Math.sqrt(pairs.reduce((total, [a, b]) => total + (a - b) ** 2, 0) / pairs.length)
      return { year, rmse }
    }).sort((a, b) => a.rmse - b.rmse).slice(0, 3)
    const future = []
    for (let week = observedWeeks; week < 52; week += 1) {
      const prediction = mean(top.map(({ year }) => series[year][week]?.mean).filter((value) => value !== null))
      const actual = target[week]?.mean
      if (prediction !== null && actual !== null) future.push((prediction - actual) ** 2)
    }
    if (future.length) errors.push(Math.sqrt(mean(future)))
  }
  return { sampleCount: errors.length, observedWeeks, futureRmse: round(mean(errors)) }
}

const output = { generatedAt: new Date().toISOString(), baseline: `${startYear}-${currentYear - 1}`, cities: [], years: Array.from({ length: currentYear - startYear + 1 }, (_, i) => startYear + i), clusters: [], series: {}, climatology: {}, analogs: {}, backtests: {}, transitions: {} }
const temperatures = []
const payloads = await weatherAll(cities)
for (const [index, city] of cities.entries()) {
  console.log(`Downloading ${city.name}`)
  const { series, records } = aggregate(payloads[index])
  const annualMean = mean(Object.values(series).flat().map((point) => point.mean).filter((value) => value !== null))
  temperatures.push({ city, annualMean })
  output.series[city.id] = series
  output.transitions[city.id] = transitions(records)
  output.analogs[city.id] = calculateAnalogs(series)
  output.backtests[city.id] = calculateBacktest(series)
  output.climatology[city.id] = Array.from({ length: 52 }, (_, index) => {
    const all = Object.entries(series).filter(([year]) => Number(year) < currentYear).map(([, points]) => points[index])
    return { week: index + 1, mean: round(mean(all.map((point) => point?.mean).filter((value) => value !== null))), max: round(mean(all.map((point) => point?.max).filter((value) => value !== null))), min: round(mean(all.map((point) => point?.min).filter((value) => value !== null))) }
  })
}
temperatures.sort((a, b) => a.annualMean - b.annualMean).forEach((item, index) => { item.city.cluster = Math.min(4, Math.floor(index / Math.ceil(cities.length / 4)) + 1); output.cities.push(item.city) })
for (let id = 1; id <= 4; id++) {
  const group = temperatures.filter((item) => item.city.cluster === id)
  output.clusters.push({ id, label: `Кластер ${id}`, cities: group.map((item) => item.city.id), average: round(mean(group.map((item) => item.annualMean))) })
}
await mkdir(resolve('frontend/public/data'), { recursive: true })
await writeFile(resolve('frontend/public/data/dashboard.json'), JSON.stringify(output))
console.log('Saved frontend/public/data/dashboard.json')
