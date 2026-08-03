import { useEffect, useMemo, useState } from 'react'
import { Activity, CalendarDays, CloudSun, Download, Info, Layers3, MapPin, Maximize2, RefreshCw, Share2, Sparkles, ThermometerSun, X } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import './App.css'
import { loadDashboard, loadForecast } from './api'
import type { DashboardData, ForecastData, Metric, Point } from './types'

const metricLabel: Record<Metric, string> = { mean: 'Средняя', max: 'Макс.', min: 'Мин.' }
const PREFERENCES_KEY = 'seasonal-climate-dashboard-preferences'

type DashboardPreferences = {
  cityIds?: string[]
  years?: number[]
  metric?: Metric
  showClimate?: boolean
  showPrediction?: boolean
  showForecast?: boolean
}

function readPreferences(): DashboardPreferences {
  try {
    const query = new URLSearchParams(window.location.search)
    if (query.has('c') || query.has('y')) {
      const metric = query.get('m')
      return {
        cityIds: query.get('c')?.split(',').filter(Boolean),
        years: query.get('y')?.split(',').map(Number).filter(Number.isFinite),
        metric: metric === 'mean' || metric === 'max' || metric === 'min' ? metric : undefined,
        showClimate: query.get('n') === null ? undefined : query.get('n') === '1',
        showPrediction: query.get('p') === null ? undefined : query.get('p') === '1',
        showForecast: query.get('f') === null ? undefined : query.get('f') === '1',
      }
    }
    return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as DashboardPreferences
  } catch {
    return {}
  }
}
const shortDate = (day: number | null | undefined) => {
  if (!day) return 'нет данных'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(new Date(Date.UTC(2025, 0, Math.round(day))))
}
const weekRange = (week: number) => {
  const format = (date: Date) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date)
  const start = new Date(Date.UTC(2025, 0, 1 + (week - 1) * 7))
  const end = new Date(Date.UTC(2025, 0, 7 + (week - 1) * 7))
  return `${format(start)} - ${format(end)}`
}
const weekFromDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.min(52, Math.floor((date.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1)
}
const formatUpdatedAt = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value))
const formatForecastDate = (value: string) => new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
}).format(new Date(`${value}T00:00:00`))

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [cityIds, setCityIds] = useState<string[]>([])
  const [years, setYears] = useState<number[]>([])
  const [metric, setMetric] = useState<Metric>('mean')
  const [showClimate, setShowClimate] = useState(true)
  const [showPrediction, setShowPrediction] = useState(true)
  const [showForecast, setShowForecast] = useState(true)
  const [isChartExpanded, setIsChartExpanded] = useState(false)
  const [isChartClosing, setIsChartClosing] = useState(false)
  const [forecastStatus, setForecastStatus] = useState('Загружаем статус…')
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [exportStatus, setExportStatus] = useState('')

  const closeExpandedChart = () => {
    setIsChartClosing(true)
    window.setTimeout(() => {
      setIsChartExpanded(false)
      setIsChartClosing(false)
    }, 220)
  }
  const refresh = () => {
    setError('')
    loadDashboard().then((result) => {
      const saved = readPreferences()
      const savedCities = saved.cityIds?.filter((id) => result.cities.some((city) => city.id === id)) ?? []
      const savedYears = saved.years?.filter((year) => result.years.includes(year)) ?? []
      setData(result)
      setCityIds(savedCities.length ? savedCities : [result.cities[0]?.id].filter(Boolean))
      setYears(savedYears.length ? savedYears : (window.matchMedia('(max-width: 699px)').matches ? [result.years.at(-1)!] : result.years.slice(-4)))
      if (saved.metric) setMetric(saved.metric)
      if (typeof saved.showClimate === 'boolean') setShowClimate(saved.showClimate)
      if (typeof saved.showPrediction === 'boolean') setShowPrediction(saved.showPrediction)
      if (typeof saved.showForecast === 'boolean') setShowForecast(saved.showForecast)
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Ошибка данных'))
  }
  useEffect(refresh, [])
  useEffect(() => {
    if (!data) return
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ cityIds, years, metric, showClimate, showPrediction, showForecast }))
      const query = new URLSearchParams({ c: cityIds.join(','), y: years.join(','), m: metric, n: showClimate ? '1' : '0', p: showPrediction ? '1' : '0', f: showForecast ? '1' : '0' })
      window.history.replaceState(null, '', `${window.location.pathname}?${query.toString()}${window.location.hash}`)
    } catch {
      // The dashboard still works when browser storage is unavailable.
    }
  }, [cityIds, data, metric, showClimate, showForecast, showPrediction, years])

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1800)
    } catch {
      setShareCopied(false)
    }
  }
  const downloadExcel = async () => {
    if (!data || !cities.length) return
    setExportStatus('Готовим отчёт…')
    try {
      const { exportDashboardToExcel } = await import('./export')
      await exportDashboardToExcel({ data, cities, years, metric, showClimate, showPrediction, showOperationalForecast, chartData })
      setExportStatus('Отчёт скачан')
    } catch {
      setExportStatus('Не удалось создать файл')
    }
    window.setTimeout(() => setExportStatus(''), 2200)
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isChartExpanded) closeExpandedChart()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isChartExpanded])

  const cities = useMemo(() => data?.cities.filter((city) => cityIds.includes(city.id)) ?? [], [data, cityIds])
  const chartData = useMemo(() => {
    if (!data || !cities.length) return []
    const average = (sets: Point[][], week: number) => {
      const values = sets.map((set) => set[week]?.[metric]).filter((value): value is number => value !== null && value !== undefined)
      return values.length ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)) : null
    }
    const rows = Array.from({ length: 52 }, (_, index) => {
      const row: Record<string, number | null> & { week: number } = { week: index + 1 }
      years.forEach((year) => { row[year] = average(cities.map((city) => data.series[city.id]?.[year] ?? []), index) })
      if (showClimate) row.climate = average(cities.map((city) => data.climatology[city.id] ?? []), index)
      return row
    })
    let lastObserved = -1
    if (cities.length === 1) {
      const current = data.series[cities[0].id]?.[data.years.at(-1) ?? 0] ?? []
      lastObserved = current.reduce((last, point, index) => point[metric] === null ? last : index, -1)
    }
    if (showPrediction && cities.length === 1 && years.includes(data.years.at(-1) ?? 0)) {
      const city = cities[0]
      const current = data.series[city.id]?.[data.years.at(-1) ?? 0] ?? []
      const analogs = data.analogs[city.id] ?? []
      const analogSeries = analogs.map((analog) => data.series[city.id]?.[analog.year] ?? [])
      if (lastObserved >= 3 && analogSeries.length >= 2) {
        rows.forEach((row, index) => {
          if (index < lastObserved) return
          if (index === lastObserved) {
            const actual = current[index]?.[metric]
            if (actual !== null && actual !== undefined) {
              row.scenarioBase = actual
              row.scenarioRange = 0
              row.scenarioMedian = actual
            }
            return
          }
          const values = analogSeries.map((series) => series[index]?.[metric]).filter((value): value is number => value !== null && value !== undefined)
          if (values.length < 2) return
          const lower = Math.min(...values)
          const upper = Math.max(...values)
          row.scenarioBase = lower
          row.scenarioRange = upper - lower
          row.scenarioMedian = Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1))
        })
      }
    }
    if (forecast?.daily?.time && forecast.daily.temperature_2m_mean && cities.length === 1 && years.includes(data.years.at(-1) ?? 0)) {
      const byWeek = new Map<number, number[]>()
      forecast.daily.time.forEach((date, index) => {
        const temperature = forecast.daily?.temperature_2m_mean?.[index]
        const week = weekFromDate(date)
        if (typeof temperature === 'number' && week - 1 > lastObserved) {
          byWeek.set(week, [...(byWeek.get(week) ?? []), temperature])
        }
      })
      byWeek.forEach((values, week) => { rows[week - 1].operationalForecast = Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)) })
    }
    return rows
  }, [cities, data, forecast, metric, showClimate, showPrediction, years])

  useEffect(() => {
    const city = cities[0]
    if (!city || cities.length !== 1) {
      setForecast(null)
      setForecastStatus(cities.length > 1 ? 'Выберите один город для прогноза' : 'Выберите город для прогноза')
      return
    }
    setForecastStatus('Загружаем прогноз…')
    loadForecast(city.latitude, city.longitude)
      .then((result) => {
        setForecast(result)
        setForecastStatus(result ? `обновлено ${formatUpdatedAt(result.updatedAt)}` : 'подключите API на Render')
      })
      .catch(() => {
        setForecast(null)
        setForecastStatus('временно недоступен')
      })
  }, [cities])

  const toggleCity = (id: string) => setCityIds((current) => current.includes(id) ? (current.length === 1 ? current : current.filter((item) => item !== id)) : [...current, id])
  const toggleYear = (year: number) => setYears((current) => current.includes(year) ? (current.length === 1 ? current : current.filter((item) => item !== year)) : [...current, year])

  if (error) return <main className="state"><CloudSun size={42} /><h1>Данные пока не готовы</h1><p>{error}</p><button onClick={refresh}>Повторить</button></main>
  if (!data) return <main className="state"><RefreshCw className="spin" size={32} /><p>Загружаем климатическую карту…</p></main>

  const primary = cities[0]
  const analogs = primary ? data.analogs[primary.id] ?? [] : []
  const backtest = primary ? data.backtests?.[primary.id] : undefined
  const transition = primary ? data.transitions[primary.id] : undefined
  const latestYear = data.years.at(-1)
  const canUseSingleCityLayers = cities.length === 1 && latestYear !== undefined && years.includes(latestYear)
  const showScenario = showPrediction && canUseSingleCityLayers && analogs.length >= 2
  const hasOperationalForecast = canUseSingleCityLayers && Boolean(forecast?.daily?.time?.length)
  const showOperationalForecast = showForecast && hasOperationalForecast
  const latestActualIndex = primary && latestYear !== undefined ? (data.series[primary.id]?.[latestYear] ?? []).reduce((last, point, index) => point.mean === null ? last : index, -1) : -1
  const latestActual = primary && latestActualIndex >= 0 && latestYear !== undefined ? data.series[primary.id]?.[latestYear]?.[latestActualIndex]?.mean : null
  const currentNormal = primary && latestActualIndex >= 0 ? data.climatology[primary.id]?.[latestActualIndex]?.mean : null
  const anomaly = latestActual !== null && latestActual !== undefined && currentNormal !== null && currentNormal !== undefined ? Number((latestActual - currentNormal).toFixed(1)) : null
  const forecastPoints = forecast?.daily?.time?.map((date, index) => ({ date, value: forecast.daily?.temperature_2m_mean?.[index] ?? null })).filter((point): point is { date: string; value: number } => typeof point.value === 'number') ?? []
  const forecastHighlights = forecastPoints.length ? [forecastPoints[0], forecastPoints[Math.min(6, forecastPoints.length - 1)], forecastPoints.at(-1)].filter((point): point is { date: string; value: number } => point !== undefined).filter((point, index, list) => list.findIndex((item) => item.date === point.date) === index) : []

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#overview"><span className="brand-mark">SC</span>SeasonalClimate</a>
      <nav className="topnav" aria-label="Навигация"><a href="#faq">FAQ · методология</a><button className="share-button" onClick={downloadExcel} disabled={!cities.length}><Download size={13} />{exportStatus || 'Excel'}</button><button className="share-button" onClick={copyShareLink}><Share2 size={13} />{shareCopied ? 'Ссылка скопирована' : 'Поделиться'}</button></nav>
      <span className="freshness"><i /> Данные: {new Date(data.generatedAt).toLocaleDateString('ru-RU')}</span>
    </header>
    <section className="hero" id="overview">
      <div className="eyebrow"><Sparkles size={15} /> Климатическая карта Казахстана</div>
      <h1>Температура и сезонность</h1>
      <p>11 городов · факт, климатическая норма и сценарии по историческим аналогам.</p>
      <div className="source-line"><span className="hover-tip source-info" tabIndex={0} data-tooltip="Open-Meteo Archive использует ERA5. Это глобальный реанализ погоды с единым методом расчёта и многолетним покрытием. Он подходит для сопоставимой климатической аналитики, но не заменяет наблюдения метеостанции."><Info size={15} /></span> Open-Meteo ERA5 · {data.baseline}</div>
    </section>

    <section className="cluster-overview panel">
      <div className="section-title"><div><span className="section-kicker">КЛИМАТИЧЕСКИЕ КЛАСТЕРЫ</span><h2>Города по похожей температурной динамике</h2></div><span className="info-tip hover-tip" data-tooltip="Города объединены по форме исторической температурной кривой, а не по административному региону."><Info size={18} /></span></div>
      <div className="cluster-cards">{data.clusters.map((cluster) => <button className="cluster-card hover-tip" data-tooltip={`Среднегодовая недельная температура: ${cluster.average} °C. В кластере ${cluster.cities.length} город(а). Нажмите, чтобы выбрать их на графике.`} key={cluster.id} onClick={() => setCityIds(cluster.cities)}><span>КЛАСТЕР {cluster.id}</span><strong>{cluster.average} °C</strong><small>{cluster.cities.map((id) => data.cities.find((city) => city.id === id)?.name).join(' · ')}</small></button>)}</div>
      <div className="timeline-caption"><span className="legend-warm" /> Тёплый сезон: средний период, когда недельная температура выше 5 °C</div>
      <div className="season-timeline">
        <div className="timeline-axis"><span>Город</span><div>{['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map((month) => <i key={month}>{month}</i>)}</div></div>
        {data.cities.map((city) => {
        const dates = data.transitions[city.id]
        const from = dates?.springDay ? (dates.springDay / 365) * 100 : 0
        const width = dates?.springDay && dates.autumnDay ? ((dates.autumnDay - dates.springDay) / 365) * 100 : 0
        const label = `${shortDate(dates?.springDay)} - ${shortDate(dates?.autumnDay)}`
        const warmWeeks = (data.climatology[city.id] ?? []).filter((point) => point.week >= Math.ceil((dates?.springDay ?? 0) / 7) && point.week <= Math.ceil((dates?.autumnDay ?? 0) / 7)).map((point) => point.mean).filter((value): value is number => value !== null)
        const warmAverage = warmWeeks.length ? (warmWeeks.reduce((total, value) => total + value, 0) / warmWeeks.length).toFixed(1) : 'нет данных'
        const duration = dates?.springDay && dates.autumnDay ? Math.round(dates.autumnDay - dates.springDay) : 0
        return <div className="timeline-row" key={city.id}><button onClick={() => setCityIds([city.id])}><b>{city.name}</b><small>{label}</small></button><div className="season-band hover-tip" data-tooltip={`${city.name}: ${label}. Длительность тёплого сезона: ${duration} дней. Средняя температура в периоде: ${warmAverage} °C.`}><i style={{ left: `${from}%`, width: `${width}%` }} /><span className="timeline-start" style={{ left: `${from}%` }}>{shortDate(dates?.springDay)}</span><span className="timeline-end" style={{ left: `${from + width}%` }}>{shortDate(dates?.autumnDay)}</span></div></div>
      })}</div>
    </section>

    <section className="filters panel">
      <div className="filter-heading"><MapPin size={18} /><b>Города</b><small>Можно выбрать несколько</small></div>
      <div className="chips">{data.cities.map((city) => <button className={cityIds.includes(city.id) ? 'chip active' : 'chip'} key={city.id} onClick={() => toggleCity(city.id)}>{city.name}</button>)}</div>
      <div className="filter-heading"><Layers3 size={18} /><b>Выбор по кластеру</b></div>
      <div className="chips">{data.clusters.map((cluster) => <button className="chip cluster-chip" key={cluster.id} onClick={() => setCityIds(cluster.cities)}>{cluster.label}<span>{cluster.cities.length}</span></button>)}</div>
    </section>

    {isChartExpanded && <div className={`chart-backdrop ${isChartClosing ? 'is-closing' : ''}`} onClick={closeExpandedChart} aria-hidden="true" />}
    <section className={`chart-section panel ${isChartExpanded ? 'is-expanded' : ''} ${isChartClosing ? 'is-closing' : ''}`} role={isChartExpanded ? 'dialog' : undefined} aria-modal={isChartExpanded || undefined} aria-label="Расширенный график температуры">
      <div className="section-title"><div><span className="section-kicker">ДИНАМИКА ТЕМПЕРАТУРЫ</span><h2>{cities.length === 1 ? primary?.name : `${cities.length} города, среднее`}</h2></div>
        <div className="chart-actions"><button className="expand-chart" onClick={() => isChartExpanded ? closeExpandedChart() : setIsChartExpanded(true)} title={isChartExpanded ? 'Закрыть расширенный график' : 'Развернуть график'}>{isChartExpanded ? <X size={16} /> : <Maximize2 size={16} />}<span>{isChartExpanded ? 'Закрыть' : 'Развернуть'}</span></button><div className="metric-switch">{(['mean', 'max', 'min'] as Metric[]).map((item) => <button className={metric === item ? 'active' : ''} onClick={() => setMetric(item)} key={item}>{metricLabel[item]}</button>)}</div></div>
      </div>
      <div className="chart-controls"><details className="year-picker"><summary>Годы: выбрано {years.length}</summary><div className="year-menu"><div className="year-presets"><button onClick={() => latestYear !== undefined && setYears([latestYear])}>Текущий</button><button onClick={() => setYears(data.years.slice(-3))}>3 года</button><button onClick={() => setYears(data.years.slice(-5))}>5 лет</button><button onClick={() => setYears(data.years)}>Весь архив</button></div><div className="year-row">{data.years.map((year) => <button className={years.includes(year) ? 'year selected' : 'year'} key={year} onClick={() => toggleYear(year)}>{year}</button>)}</div></div></details><div className="layer-toggles"><label className="toggle"><input type="checkbox" checked={showClimate} onChange={(event) => setShowClimate(event.target.checked)} /> Климатическая норма <span className="hover-tip norm-info" tabIndex={0} data-tooltip="Включает зелёную пунктирную линию: среднюю температуру по завершённым годам. Сравнивайте с ней выбранный год, чтобы видеть отклонение от типичного сезона."><Info size={13} /></span></label><label className={canUseSingleCityLayers && analogs.length >= 2 ? 'toggle' : 'toggle is-disabled'}><input type="checkbox" disabled={!canUseSingleCityLayers || analogs.length < 2} checked={canUseSingleCityLayers && analogs.length >= 2 && showPrediction} onChange={(event) => setShowPrediction(event.target.checked)} /> Аналоговый сценарий <span className="hover-tip norm-info" tabIndex={0} data-tooltip={canUseSingleCityLayers && analogs.length >= 2 ? 'Включает или скрывает пунктирное продолжение текущего года и диапазон top-3 аналогов. Это исторический сценарий, не оперативный прогноз.' : 'Доступен для одного города при выбранном текущем году: у набора городов нет единой исторической траектории для честного подбора аналога.'}><Info size={13} /></span></label><label className={hasOperationalForecast ? 'toggle' : 'toggle is-disabled'}><input type="checkbox" disabled={!hasOperationalForecast} checked={hasOperationalForecast && showForecast} onChange={(event) => setShowForecast(event.target.checked)} /> Оперативный прогноз <span className="hover-tip norm-info" tabIndex={0} data-tooltip={hasOperationalForecast ? 'Включает или скрывает синюю линию прогноза Open-Meteo до 16 дней. Это краткосрочный метеорологический прогноз, а не исторический сценарий.' : canUseSingleCityLayers ? 'Оперативный прогноз появится после загрузки данных Open-Meteo.' : 'Доступен для одного города при выбранном текущем году: прогноз API строится по конкретным координатам.'}><Info size={13} /></span></label></div></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 6 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8edef" /><XAxis dataKey="week" tickLine={false} axisLine={false} interval="preserveStartEnd" /><YAxis tickLine={false} axisLine={false} unit="°" width={44} />
          <Tooltip cursor={{ stroke: '#aab9b6', strokeDasharray: '3 4' }} content={({ active, payload, label }) => {
            if (!active || !payload?.length || typeof label !== 'number') return null
            const scenarioBase = payload.find((item) => item.name === 'scenarioBase')?.value
            const scenarioRange = payload.find((item) => item.name === 'scenarioRange')?.value
            const hasScenarioRange = typeof scenarioBase === 'number' && typeof scenarioRange === 'number'
            return <div className="climate-tooltip">
              <span className="tooltip-week">{label}-я неделя · {weekRange(label)}</span>
              <b>{metricLabel[metric]} температура</b>
              {payload.filter((item) => item.value !== null && item.value !== undefined && item.name !== 'scenarioBase' && item.name !== 'scenarioRange').map((item) => <div className="tooltip-value" key={String(item.name)}><i style={{ background: item.color }} /><span>{item.name === 'climate' ? 'Климатическая норма' : item.name === 'scenarioMedian' ? 'Сценарий top-3' : item.name === 'operationalForecast' ? 'Оперативный прогноз' : item.name}</span><strong>{Number(item.value).toFixed(1)} °C</strong></div>)}
              {hasScenarioRange && <div className="tooltip-range"><span>Диапазон top-3 аналогов</span><strong>{scenarioBase.toFixed(1)} - {(scenarioBase + scenarioRange).toFixed(1)} °C</strong></div>}
              <small>Источник: Open-Meteo ERA5</small>
            </div>
          }} />
          {showClimate && <Line type="monotone" dataKey="climate" stroke="#499175" strokeDasharray="5 4" strokeWidth={2.2} dot={false} connectNulls name="climate" />}
          {showScenario && <><Area type="monotone" dataKey="scenarioBase" stackId="scenario" stroke="none" fill="transparent" name="scenarioBase" /><Area type="monotone" dataKey="scenarioRange" stackId="scenario" stroke="none" fill="#eecb92" fillOpacity={0.48} name="scenarioRange" /></>}
          {years.map((year, index) => <Line key={year} type="monotone" dataKey={String(year)} stroke={year === latestYear ? '#e3632f' : ['#276b69', '#7a8890', '#9ca9af'][index % 3]} strokeWidth={year === latestYear ? 3 : 1.6} dot={false} connectNulls name={String(year)} animationDuration={500} />)}
          {showOperationalForecast && <Line type="monotone" dataKey="operationalForecast" stroke="#3179b7" strokeWidth={3} dot={{ r: 3, strokeWidth: 1, fill: '#fff' }} connectNulls name="operationalForecast" animationDuration={500} />}
          {showScenario && <Line type="monotone" dataKey="scenarioMedian" stroke="#b77922" strokeDasharray="6 5" strokeWidth={2.3} dot={false} connectNulls name="scenarioMedian" animationDuration={500} />}
        </ComposedChart></ResponsiveContainer>
      </div>
      <p className="chart-note"><ThermometerSun size={16} /> Факт показан до последней доступной недели. Пропуски не заменяются нулём. {showOperationalForecast ? 'Синяя линия: оперативный прогноз до 16 дней.' : ''} {showScenario ? 'Пунктир и заливка: средний сценарий и диапазон top-3 аналогов.' : ''}</p>
    </section>

    <section className="insights">
      <article className="panel insight-card"><div className="card-icon blue"><ThermometerSun size={20} /></div><span className="section-kicker">СЕЙЧАС VS НОРМА</span><h3>{anomaly === null ? 'Нет сопоставления' : `${anomaly > 0 ? '+' : ''}${anomaly} °C`}</h3><p>{latestActualIndex >= 0 ? `${latestActualIndex + 1}-я неделя: ${latestActual} °C, норма ${currentNormal} °C` : 'Недостаточно фактических данных'}</p></article>
      <article className="panel insight-card"><div className="card-icon warm"><CalendarDays size={20} /></div><span className="section-kicker">ТЁПЛЫЙ СЕЗОН</span><h3>{transition?.springDay ? `≈ с ${Math.ceil(transition.springDay / 7)}-й недели` : 'Недостаточно данных'}</h3><p title="Средняя дата устойчивого перехода температуры через температурный порог">Весенний переход. Наведите для описания</p></article>
      <article className="panel insight-card"><div className="card-icon blue"><Activity size={20} /></div><span className="section-kicker">АНАЛОГОВЫЙ СЦЕНАРИЙ</span><h3>{analogs[0] ? `${analogs[0].year} год` : 'Рассчитывается'}</h3><p title="Ближайший год по RMSE накопленной недельной температуры">{analogs[0] ? `RMSE ${analogs[0].rmse} °C` : 'Сравниваем исторические годы'}</p></article>
      <article className="panel insight-card forecast-card"><div className="card-icon orange"><CloudSun size={20} /></div><span className="section-kicker">ОПЕРАТИВНАЯ ПОГОДА</span><h3>До 16 дней</h3><p>{forecastStatus}</p>{forecastHighlights.length > 0 && <div className="forecast-highlights">{forecastHighlights.map((point) => <span key={point.date}><small>{formatForecastDate(point.date)}</small><b>{Number(point.value).toFixed(0)} °C</b></span>)}</div>}</article>
    </section>

    <section className="panel analogs"><div className="section-title"><div><span className="section-kicker">БЛИЖАЙШИЕ АНАЛОГИ</span><h2>Годы с похожим началом сезона</h2></div><span className="info-tip hover-tip analog-info" tabIndex={0} data-tooltip="Выбираем завершённые годы с минимальной RMSE: разницей между недельной температурой текущего и прошлого года. Меньше RMSE значит ближе аналог."><Info size={18} /></span></div>
      <div className="analog-grid">{analogs.map((analog) => <div className="analog-row" key={analog.year}><span className="rank">#{analog.rank}</span><strong>{analog.year}</strong><span className="bar"><i style={{ width: `${Math.max(14, 100 - analog.rmse * 13)}%` }} /></span><span>{analog.rmse} °C RMSE</span></div>)}</div>
      <div className="backtest"><Activity size={18} /><div><b>Историческая проверка сценария</b><span>{backtest?.futureRmse !== null && backtest?.futureRmse !== undefined ? `Средняя ошибка на будущем участке: ${backtest.futureRmse} °C. Проверено лет: ${backtest.sampleCount}; для сравнения использовано ${backtest.observedWeeks} первых недель.` : 'Для проверки пока недостаточно завершённых рядов.'}</span></div></div>
    </section>

    <section className="faq panel" id="faq">
      <div><span className="section-kicker">FAQ · МЕТОДОЛОГИЯ</span><h2>Как читать эту аналитику?</h2><p>Коротко о расчётах, источниках и ограничениях.</p></div>
      <div className="faq-list">
        <details><summary>Откуда берётся температура?</summary><p>История поступает из Open-Meteo Archive, который отдаёт реанализ ERA5/ERA5-Land по координатам каждого города. Реанализ объединяет наблюдения со станций, спутников и метеомодели в сплошной сопоставимый ряд. Это хороший источник для сравнения климата между городами, но он не является прямым показанием конкретной метеостанции.</p></details>
        <details><summary>Какой период и как часто обновляются данные?</summary><p>Базовый исторический период указан под заголовком и в источнике данных. GitHub Actions ежедневно заново получает ряд из публичного API, пересчитывает компактные недельные агрегаты и публикует обновление. Ежедневные исходные значения на сервере не хранятся.</p></details>
        <details><summary>Как считаются значения на графике?</summary><p>Для каждого дня используются mean, max и min температуры. Затем значения агрегируются в среднее за неделю года: неделя 1, неделя 2 и так далее. При выборе нескольких городов отображается среднее только из доступных значений; пропуск не становится нулём и не занижает результат.</p></details>
        <details><summary>Как пользоваться выбором городов и кластеров?</summary><p>В блоке «Города» можно выбрать один или несколько городов. При нескольких выбранных городах главный график показывает их среднюю температуру по каждой неделе. Кнопка кластера выбирает все города этой группы. Нажатие на город в шкале тёплого сезона переключает график на этот город.</p></details>
        <details><summary>Что меняют переключатели «Средняя», «Макс.» и «Мин.»?</summary><p>Они меняют одну и ту же метрику во всех рядах графика. «Средняя» показывает среднюю дневную температуру за неделю, «Макс.» показывает среднее недельное значение дневных максимумов, «Мин.» показывает среднее недельное значение дневных минимумов.</p></details>
        <details><summary>Как работает выбор периода и mobile focus?</summary><p>На новом мобильном устройстве по умолчанию включается текущий год, чтобы график оставался читаемым. В меню «Годы» доступны быстрые режимы: текущий год, последние 3 года, последние 5 лет и весь архив. Можно также вручную включать отдельные годы.</p></details>
        <details><summary>Сохраняется ли мой выбор после обновления страницы?</summary><p>Да. Браузер сохраняет выбранные города, годы, температурную метрику и включённые слои в localStorage. При следующем открытии эти настройки восстанавливаются. На сервер и сторонним сервисам эта информация не отправляется.</p></details>
        <details><summary>Как поделиться конкретным видом дашборда?</summary><p>Кнопка «Поделиться» копирует ссылку с текущим набором городов, годами, метрикой и слоями. Открывший ссылку увидит тот же выбранный срез, если нужные города и годы есть в актуальной версии данных.</p></details>
        <details><summary>Что выгружается в Excel?</summary><p>Кнопка «Excel» скачивает текущий срез, а не весь набор без фильтров: выбранные города, годы, метрика и включённые слои. Первый лист содержит готовую сводку с выводами и графиком. Далее доступны недельные значения графика, отдельные ряды каждого выбранного города, границы сезонов, аналоги с backtest и лист с методикой. График встроен в файл как изображение, поэтому его можно открыть и отправить без доступа к дашборду.</p></details>
        <details><summary>Что делает кнопка «Развернуть» у графика?</summary><p>Она открывает график в полноэкранном режиме. Выбор городов, годов, метрики и слоёв сохраняется. Закрыть режим можно кнопкой, клавишей Escape или кликом по затемнённому фону.</p></details>
        <details><summary>На что влияет «Климатическая норма»?</summary><p>Этот переключатель показывает или скрывает зелёную пунктирную линию. Она построена из средних недельных температур всех завершённых лет базового периода и нужна, чтобы быстро увидеть, насколько выбранный год выше или ниже типичного сезонного уровня.</p></details>
        <details><summary>Что показывает карточка «Сейчас vs норма»?</summary><p>Она сравнивает последнюю доступную фактическую неделю с климатической нормой той же недели. Положительное значение означает, что сейчас теплее типичного уровня, отрицательное значение означает, что холоднее.</p></details>
        <details><summary>Что показывают подсказки на графике?</summary><p>При наведении на график подсказка показывает номер недели, календарный диапазон дат, точную температуру каждой включённой линии, климатическую норму и источник данных. Подсказки у кластеров и тёплого сезона объясняют их расчёт и показывают дополнительные значения.</p></details>
        <details><summary>Что такое климатическая норма?</summary><p>Это среднее недельное значение всех завершённых лет базового периода для выбранного города или набора городов. Норма показывает ожидаемую сезонную форму, а не температуру конкретного будущего дня. Она меняется после пересчёта, когда появляется новый завершённый год.</p></details>
        <details><summary>Что такое тёплый сезон?</summary><p>Это рабочая климатическая метка для сравнения городов: период между весенней и осенней границей 5 °C. Она не означает, что весь период каждый день тёплый, и не является календарным сезоном.</p></details>
        <details><summary>Как именно считаются границы тёплого сезона?</summary><p>Весенняя граница появляется после двух последовательных недель со средней температурой не ниже 5 °C. Осенняя граница определяется как последняя из двух последовательных тёплых недель. Затем даты усредняются по историческим годам. Такое правило снижает влияние одиночного краткого потепления или похолодания.</p></details>
        <details><summary>Что означают даты на полосе тёплого сезона?</summary><p>Левая дата: средняя весенняя граница. Правая дата: средняя осенняя. Tooltip по полосе показывает город, обе даты, длительность периода и среднюю температуру внутри него. Это исторические климатические ориентиры, а не прогноз на текущий год.</p></details>
        <details><summary>Почему граница не совпадает с фактической погодой сегодня?</summary><p>Полоса строится из средних дат многих лет. В конкретный год переход может случиться раньше или позже из-за текущей погоды; это нормальная межгодовая изменчивость. Для оперативной ситуации смотрите ряд текущего года и краткосрочный прогноз.</p></details>
        <details><summary>Почему города в разных кластерах?</summary><p>Сейчас города упорядочиваются по средней исторической недельной температуре и делятся на четыре прозрачные температурные группы. Это простой рабочий способ обзора, а не полноценная многомерная кластеризация формы кривой. Административные регионы при расчёте не используются.</p></details>
        <details><summary>Что означает аналоговый год?</summary><p>Это завершённый год с наиболее похожими уже наблюдаемыми неделями текущего года. Для каждого прошлого года считается RMSE, корень из средней квадратичной разницы недельных температур. Чем меньше RMSE, тем ближе аналог. Показываются три лучших результата, чтобы не создавать ложную точность одного «идеального» года.</p></details>
        <details><summary>Можно ли считать аналоговый год прогнозом?</summary><p>Нет. Это исторический сценарий: «как развивалась температура после похожего начала года». Он не учитывает будущую циркуляцию атмосферы, поэтому не заменяет метеопрогноз. На графике заливка показывает минимум и максимум продолжения top-3 аналогов, пунктир показывает их среднее.</p></details>
        <details><summary>Как читать сценарный диапазон на графике?</summary><p>После последней фактической недели пунктирная линия продолжает график средним значением трёх ближайших аналогов. Полупрозрачная область показывает разброс между минимальным и максимальным значением этих аналогов по каждой будущей неделе. Чем шире область, тем сильнее аналоги расходятся.</p></details>
        <details><summary>Что показывает историческая проверка сценария?</summary><p>Для каждого завершённого года алгоритм берёт только его первые наблюдаемые недели, выбирает top-3 аналога среди более ранних лет и сравнивает их среднее продолжение с фактически произошедшей погодой. В карточке показана средняя RMSE ошибки на будущем участке и число таких проверок.</p></details>
        <details><summary>Чем сценарий отличается от прогноза?</summary><p>Короткий прогноз до 16 дней backend получает из Open-Meteo Forecast. Дальше доступен только аналоговый исторический сценарий. В интерфейсе эти типы данных должны быть подписаны раздельно, чтобы исторические значения не выдавались за прогноз.</p></details>
        <details><summary>Где показан оперативный прогноз?</summary><p>Карточка «Оперативная погода» показывает температуры на несколько дат внутри 16-дневного горизонта и время обновления. На графике прогноз отмечен синей линией после последней фактической недели. Он доступен при выборе одного города.</p></details>
        <details><summary>Какие главные ограничения у дашборда?</summary><p>Температура ERA5 имеет пространственное разрешение сетки, поэтому локальные эффекты города, высоты и станции могут отличаться. Кластеры и границы используют текущие простые правила, а не подтверждённую бизнес-методологию. Дашборд анализирует погоду и не использует продажи или спрос.</p></details>
      </div>
    </section>
  </main>
}

export default App
