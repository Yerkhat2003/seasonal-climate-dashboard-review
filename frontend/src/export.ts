import writeXlsxFile from 'write-excel-file/browser'
import type { Cell, Row } from 'write-excel-file/browser'
import type { City, DashboardData, Metric } from './types'

export type ChartExportRow = { week: number } & Record<string, number | null | undefined>

type ExportOptions = {
  data: DashboardData
  cities: City[]
  years: number[]
  metric: Metric
  showClimate: boolean
  showPrediction: boolean
  showOperationalForecast: boolean
  chartData: ChartExportRow[]
}

const palette = ['#E3632F', '#276B69', '#6F7E87', '#A46E37', '#6E659A', '#3A7891', '#9A5D68']
const colors = { climate: '#499175', forecast: '#3179B7', scenario: '#B77922', range: '#EECB92', ink: '#183D3E', muted: '#65797B', grid: '#DCE8E4' }
const metricLabel: Record<Metric, string> = {
  mean: 'Средняя температура',
  max: 'Средний дневной максимум',
  min: 'Средний дневной минимум',
}

const header = (value: string): Cell => ({ value, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: colors.ink })
const section = (value: string): Cell => ({ value, fontWeight: 'bold', textColor: '#183D3E', backgroundColor: '#DCEEE8' })
const title = (value: string): Cell => ({ value, fontWeight: 'bold', fontSize: 16, textColor: '#183D3E' })
const kpiValue = (value: string | number): Cell => ({ value, fontWeight: 'bold', fontSize: 14, textColor: '#183D3E', backgroundColor: '#F4F8F6' })

const weekRange = (week: number) => {
  const format = (date: Date) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date)
  const start = new Date(Date.UTC(2025, 0, 1 + (week - 1) * 7))
  const end = new Date(Date.UTC(2025, 0, 7 + (week - 1) * 7))
  return `${format(start)} - ${format(end)}`
}

const dayToDate = (day: number | null | undefined) => {
  if (!day) return 'нет данных'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(Date.UTC(2025, 0, Math.round(day))))
}

const number = (value: number | null | undefined, digits = 1) => typeof value === 'number' ? Number(value.toFixed(digits)) : null

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
}[character] ?? character))

const linePath = (rows: ChartExportRow[], key: string, x: (week: number) => number, y: (value: number) => number) => {
  let started = false
  return rows.reduce((path, row) => {
    const value = row[key]
    if (typeof value !== 'number') {
      started = false
      return path
    }
    const command = started ? 'L' : 'M'
    started = true
    return `${path}${command}${x(row.week).toFixed(1)},${y(value).toFixed(1)} `
  }, '')
}

async function chartImage(rows: ChartExportRow[], years: number[], titleText: string): Promise<Blob | null> {
  if (!rows.length) return null
  const values = rows.flatMap((row) => [
    ...years.map((year) => row[String(year)]),
    row.climate,
    row.scenarioBase,
    row.scenarioBase !== null && row.scenarioBase !== undefined && row.scenarioRange !== null && row.scenarioRange !== undefined ? row.scenarioBase + row.scenarioRange : null,
    row.operationalForecast,
  ]).filter((value): value is number => typeof value === 'number')
  if (!values.length) return null

  const width = 1120
  const height = 480
  const left = 64
  const right = 28
  const top = 76
  const bottom = 62
  const minimum = Math.floor((Math.min(...values) - 2) / 5) * 5
  const maximum = Math.ceil((Math.max(...values) + 2) / 5) * 5
  const range = Math.max(1, maximum - minimum)
  const x = (week: number) => left + ((week - 1) / 51) * (width - left - right)
  const y = (value: number) => top + ((maximum - value) / range) * (height - top - bottom)
  const yTicks = Array.from({ length: 5 }, (_, index) => minimum + (range * index) / 4)
  const xTicks = [1, 13, 26, 39, 52]
  const yearLegend = years.map((year, index) => `<g transform="translate(${left + index * 112},42)"><circle cx="0" cy="0" r="5" fill="${palette[index % palette.length]}"/><text x="10" y="4">${year}</text></g>`).join('')
  const climateLegend = rows.some((row) => typeof row.climate === 'number') ? `<g transform="translate(${left + years.length * 112},42)"><circle cx="0" cy="0" r="5" fill="${colors.climate}"/><text x="10" y="4">Норма</text></g>` : ''
  const scenarioLegend = rows.some((row) => typeof row.scenarioMedian === 'number') ? `<g transform="translate(${left + years.length * 112 + 108},42)"><circle cx="0" cy="0" r="5" fill="${colors.scenario}"/><text x="10" y="4">Сценарий</text></g>` : ''
  const forecastLegend = rows.some((row) => typeof row.operationalForecast === 'number') ? `<g transform="translate(${left + years.length * 112 + 230},42)"><circle cx="0" cy="0" r="5" fill="${colors.forecast}"/><text x="10" y="4">Прогноз</text></g>` : ''
  const rangeRows = rows.filter((row) => typeof row.scenarioBase === 'number' && typeof row.scenarioRange === 'number')
  const scenarioArea = rangeRows.length > 1
    ? `<path d="${rangeRows.map((row, index) => `${index ? 'L' : 'M'}${x(row.week).toFixed(1)},${y(row.scenarioBase! + row.scenarioRange!).toFixed(1)}`).join(' ')} ${rangeRows.slice().reverse().map((row) => `L${x(row.week).toFixed(1)},${y(row.scenarioBase!).toFixed(1)}`).join(' ')} Z" fill="${colors.range}" opacity=".52"/>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#FFFFFF"/>
    <text x="${left}" y="24" fill="${colors.ink}" font-family="Arial, sans-serif" font-size="18" font-weight="700">${escapeXml(titleText)}</text>
    <g fill="${colors.muted}" font-family="Arial, sans-serif" font-size="12">${yearLegend}${climateLegend}${scenarioLegend}${forecastLegend}</g>
    ${yTicks.map((tick) => `<g><line x1="${left}" x2="${width - right}" y1="${y(tick)}" y2="${y(tick)}" stroke="${colors.grid}" stroke-width="1"/><text x="${left - 10}" y="${y(tick) + 4}" text-anchor="end" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="11">${tick.toFixed(0)}°</text></g>`).join('')}
    ${xTicks.map((tick) => `<g><line x1="${x(tick)}" x2="${x(tick)}" y1="${top}" y2="${height - bottom}" stroke="${colors.grid}" stroke-width="1"/><text x="${x(tick)}" y="${height - 34}" text-anchor="middle" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="11">${tick}-я нед.</text></g>`).join('')}
    ${scenarioArea}
    ${rows.some((row) => typeof row.climate === 'number') ? `<path d="${linePath(rows, 'climate', x, y)}" fill="none" stroke="${colors.climate}" stroke-width="3" stroke-dasharray="7 5"/>` : ''}
    ${years.map((year, index) => `<path d="${linePath(rows, String(year), x, y)}" fill="none" stroke="${palette[index % palette.length]}" stroke-width="${index === years.length - 1 ? 4 : 2.5}"/>`).join('')}
    ${rows.some((row) => typeof row.operationalForecast === 'number') ? `<path d="${linePath(rows, 'operationalForecast', x, y)}" fill="none" stroke="${colors.forecast}" stroke-width="4"/>` : ''}
    ${rows.some((row) => typeof row.scenarioMedian === 'number') ? `<path d="${linePath(rows, 'scenarioMedian', x, y)}" fill="none" stroke="${colors.scenario}" stroke-width="3" stroke-dasharray="8 6"/>` : ''}
    <text x="${left}" y="${height - 10}" fill="${colors.muted}" font-family="Arial, sans-serif" font-size="11">Недельная температура, °C · факт и история из Open-Meteo Archive / ERA5</text>
  </svg>`

  const image = new Image()
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Не удалось подготовить график'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const context = canvas.getContext('2d')
    if (!context) return null
    context.scale(2, 2)
    context.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function exportDashboardToExcel({
  data,
  cities,
  years,
  metric,
  showClimate,
  showPrediction,
  showOperationalForecast,
  chartData,
}: ExportOptions) {
  const visibleChartData: ChartExportRow[] = showOperationalForecast
    ? chartData
    : chartData.map((row): ChartExportRow => ({ ...row, operationalForecast: null }))
  const activeCities = cities.map((city) => city.name).join(', ')
  const latestYear = data.years.at(-1)
  const currentRows = latestYear ? visibleChartData.filter((row) => typeof row[String(latestYear)] === 'number') : []
  const currentRow = currentRows.at(-1)
  const actual = currentRow && latestYear ? currentRow[String(latestYear)] : null
  const normal = currentRow ? cities.map((city) => data.climatology[city.id]?.[currentRow.week - 1]?.[metric]).filter((value): value is number => typeof value === 'number') : []
  const normalAverage = normal.length ? normal.reduce((sum, value) => sum + value, 0) / normal.length : null
  const anomaly = typeof actual === 'number' && typeof normalAverage === 'number' ? actual - normalAverage : null
  const primary = cities.length === 1 ? cities[0] : undefined
  const firstAnalog = primary ? data.analogs[primary.id]?.[0] : undefined
  const transition = primary ? data.transitions[primary.id] : undefined
  const showScenario = showPrediction && cities.length === 1 && latestYear !== undefined && years.includes(latestYear) && (data.analogs[primary?.id ?? '']?.length ?? 0) >= 2
  const visibleLayers = [
    'выбранные исторические годы',
    showClimate ? 'климатическая норма' : null,
    showScenario ? 'аналоговый сценарий top-3 и диапазон' : null,
    showOperationalForecast ? 'оперативный прогноз Open-Meteo' : null,
  ].filter(Boolean).join(' · ')
  const chart = await chartImage(visibleChartData, years, cities.length === 1 ? `Температура: ${cities[0].name}` : `Средняя температура: ${cities.length} городов`)

  const weeklyHeader: string[] = ['Неделя', 'Период']
  years.forEach((year) => weeklyHeader.push(String(year)))
  if (showClimate) weeklyHeader.push('Климатическая норма')
  if (showScenario) weeklyHeader.push('Сценарий top-3: среднее', 'Сценарий top-3: минимум', 'Сценарий top-3: максимум')
  if (showOperationalForecast) weeklyHeader.push('Оперативный прогноз')
  const weeklyRows: Row[] = visibleChartData.map((row) => {
    const values: Array<string | number | null> = [row.week, weekRange(row.week)]
    years.forEach((year) => values.push(number(row[String(year)])))
    if (showClimate) values.push(number(row.climate))
    if (showScenario) {
      values.push(number(row.scenarioMedian), number(row.scenarioBase))
      values.push(typeof row.scenarioBase === 'number' && typeof row.scenarioRange === 'number' ? number(row.scenarioBase + row.scenarioRange) : null)
    }
    if (showOperationalForecast) values.push(number(row.operationalForecast))
    return values
  })

  const detailedRows: Row[] = cities.flatMap((city) => years.flatMap((year) => (data.series[city.id]?.[year] ?? []).map((point) => [
    city.name,
    year,
    point.week,
    weekRange(point.week),
    number(point[metric]),
    number(data.climatology[city.id]?.[point.week - 1]?.[metric]),
  ])))

  const cityRows: Row[] = cities.map((city) => {
    const dates = data.transitions[city.id]
    return [
      city.name,
      city.latitude,
      city.longitude,
      city.cluster,
      dayToDate(dates?.springDay),
      dayToDate(dates?.autumnDay),
      dates?.springStd ?? null,
      dates?.autumnStd ?? null,
    ]
  })

  const analogRows: Row[] = cities.flatMap((city) => {
    const backtest = data.backtests[city.id]
    return (data.analogs[city.id] ?? []).map((analog) => [
      city.name,
      analog.rank,
      analog.year,
      number(analog.rmse),
      backtest?.sampleCount ?? null,
      backtest?.observedWeeks ?? null,
      number(backtest?.futureRmse),
    ])
  })

  const reportData: Row[] = [
    [title('SeasonalClimate · климатический отчёт')],
    [{ value: 'Срез сформирован по текущим фильтрам дашборда', textColor: colors.muted, fontStyle: 'italic' }],
    [],
    [section('ПАРАМЕТРЫ ОТЧЁТА')],
    [header('Города'), activeCities],
    [header('Метрика'), metricLabel[metric]],
    [header('Выбранные годы'), years.join(', ')],
    [header('Слои в отчёте'), visibleLayers],
    [header('Период источника'), data.baseline],
    [header('Данные сформированы'), new Date(data.generatedAt).toLocaleString('ru-RU')],
    [header('Источник'), 'Open-Meteo Archive / ERA5; оперативный прогноз: Open-Meteo Forecast'],
    [],
    [section('КЛЮЧЕВЫЕ ВЫВОДЫ')],
    [header('Последняя фактическая неделя'), currentRow ? `${currentRow.week}-я неделя (${weekRange(currentRow.week)})` : 'нет данных'],
    [header('Температура'), kpiValue(typeof actual === 'number' ? `${actual.toFixed(1)} °C` : 'нет данных')],
    [header('Отклонение от нормы'), kpiValue(typeof anomaly === 'number' ? `${anomaly >= 0 ? '+' : ''}${anomaly.toFixed(1)} °C` : 'нет сопоставления')],
    [header('Ближайший исторический аналог'), kpiValue(firstAnalog ? `${firstAnalog.year} · RMSE ${firstAnalog.rmse.toFixed(1)} °C` : 'доступен при одном городе')],
    [header('Средний тёплый сезон'), kpiValue(transition ? `${dayToDate(transition.springDay)} - ${dayToDate(transition.autumnDay)}` : 'доступен при одном городе')],
    [],
    [section('КАК ЧИТАТЬ ГРАФИК')],
    [{ value: `Сплошные линии: выбранные годы.${showClimate ? ' Зелёный пунктир: климатическая норма.' : ''}${showOperationalForecast ? ' Синяя линия: оперативный прогноз до 16 дней.' : ''}${showScenario ? ' Охристый пунктир и заливка: исторический сценарий top-3 аналогов, не метеорологический прогноз.' : ''}`, textColor: colors.muted }],
  ]

  const workbook = writeXlsxFile([
    {
      sheet: 'Отчёт',
      data: reportData,
      columns: [{ width: 29 }, { width: 84 }],
      showGridLines: false,
      images: chart ? [{ content: chart, contentType: 'image/png', width: 1120, height: 480, dpi: 96, anchor: { row: 22, column: 1 }, title: 'Температурная динамика', description: 'График выбранного среза температуры' }] : undefined,
    },
    {
      sheet: 'Недельные данные',
      data: [[...weeklyHeader.map(header)], ...weeklyRows],
      columns: weeklyHeader.map((value, index) => ({ width: index < 2 ? (index === 0 ? 10 : 20) : Math.max(16, value.length + 2) })),
      stickyRowsCount: 1,
      showGridLines: false,
    },
    {
      sheet: 'По городам',
      data: [[header('Город'), header('Год'), header('Неделя'), header('Период'), header(metricLabel[metric] + ', °C'), header('Норма, °C')], ...detailedRows],
      columns: [{ width: 20 }, { width: 12 }, { width: 10 }, { width: 19 }, { width: 26 }, { width: 16 }],
      stickyRowsCount: 1,
      showGridLines: false,
    },
    {
      sheet: 'Города и сезоны',
      data: [[header('Город'), header('Широта'), header('Долгота'), header('Кластер'), header('Весенняя граница'), header('Осенняя граница'), header('Разброс весны, дни'), header('Разброс осени, дни')], ...cityRows],
      columns: [{ width: 20 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }],
      stickyRowsCount: 1,
      showGridLines: false,
    },
    {
      sheet: 'Аналоги и проверка',
      data: [[header('Город'), header('Ранг'), header('Год-аналог'), header('RMSE, °C'), header('Проверено лет'), header('Наблюдаемых недель'), header('Ошибка будущего участка, °C')], ...analogRows],
      columns: [{ width: 20 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 21 }, { width: 29 }],
      stickyRowsCount: 1,
      showGridLines: false,
    },
    {
      sheet: 'Методика',
      data: [
        [title('Методика и источники')],
        [],
        [section('ИСТОЧНИКИ')],
        [header('Исторические данные'), 'Open-Meteo Archive: ERA5/ERA5-Land по координатам городов. Ряды пересчитываются ежедневно.'],
        [header('Оперативный прогноз'), 'Open-Meteo Forecast: горизонт до 16 дней. Это отдельный от исторического сценария источник.'],
        [],
        [section('РАСЧЁТЫ')],
        [header('Недельные значения'), 'Среднее дневных temperature_2m_mean, temperature_2m_max или temperature_2m_min за неделю года.'],
        [header('Климатическая норма'), 'Среднее недельных значений всех завершённых лет базового периода.'],
        [header('Граница тёплого сезона'), 'Две последовательные недели со средней температурой не ниже 5 °C; дата усредняется по историческим годам.'],
        [header('Аналоги'), 'Три завершённых года с минимальным RMSE по уже наблюдаемым неделям текущего года.'],
        [header('Backtest'), 'Проверка аналогового сценария на завершённых прошлых годах: сравнение будущего участка с фактически произошедшей температурой.'],
        [],
        [section('ОГРАНИЧЕНИЯ')],
        [{ value: 'ERA5 является сеточным реанализом, поэтому локальные эффекты станции и городской застройки могут отличаться. Аналоговый сценарий описывает исторические варианты развития, а не заменяет метеорологический прогноз.', textColor: colors.muted }],
      ],
      columns: [{ width: 30 }, { width: 88 }],
      showGridLines: false,
    },
  ], { fontFamily: 'Calibri', fontSize: 11 })

  const date = new Date().toISOString().slice(0, 10)
  await workbook.toFile(`seasonal-climate-report-${date}.xlsx`)
}
