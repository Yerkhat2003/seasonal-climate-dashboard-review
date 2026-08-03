export type Metric = 'mean' | 'max' | 'min'

export type City = {
  id: string
  name: string
  latitude: number
  longitude: number
  cluster: number
}

export type Point = {
  week: number
  mean: number | null
  max: number | null
  min: number | null
}

export type Analog = {
  year: number
  rmse: number
  rank: number
}

export type Transition = {
  springDay: number | null
  autumnDay: number | null
  springStd: number | null
  autumnStd: number | null
}

export type Backtest = {
  sampleCount: number
  observedWeeks: number
  futureRmse: number | null
}

export type ForecastData = {
  updatedAt: string
  daily?: {
    time?: string[]
    temperature_2m_mean?: Array<number | null>
  }
}

export type DashboardData = {
  generatedAt: string
  baseline: string
  cities: City[]
  years: number[]
  clusters: { id: number; cities: string[]; label: string; average: number }[]
  series: Record<string, Record<string, Point[]>>
  climatology: Record<string, Point[]>
  analogs: Record<string, Analog[]>
  backtests: Record<string, Backtest>
  transitions: Record<string, Transition>
}
