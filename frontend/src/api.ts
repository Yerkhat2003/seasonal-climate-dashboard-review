import type { DashboardData, ForecastData } from './types'

const DATA_URL = '/data/dashboard.json'
const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '')

export async function loadDashboard(): Promise<DashboardData> {
  const response = await fetch(DATA_URL, { cache: 'no-store' })
  if (!response.ok) throw new Error('Не удалось загрузить климатические данные')
  return response.json() as Promise<DashboardData>
}

export async function loadForecast(latitude: number, longitude: number): Promise<ForecastData | null> {
  if (!API_URL) return null
  const response = await fetch(
    `${API_URL}/api/forecast?latitude=${latitude}&longitude=${longitude}`,
  )
  if (!response.ok) throw new Error('Оперативный прогноз сейчас недоступен')
  return response.json() as Promise<ForecastData>
}
