# SeasonalClimate

Mobile-first климатический дашборд для 11 городов Казахстана. Интерфейс показывает недельную температуру, климатическую норму, сезонные переходы, кластеры и топ-3 аналоговых года.

## Что хранится и где

- `frontend/`: React/Vite приложение для Vercel.
- `backend/`: stateless Fastify API для Render. Он не хранит историю: только получает текущий 16-дневный прогноз из Open-Meteo и отдаёт его с HTTP-кешем.
- `frontend/public/data/dashboard.json`: компактные недельные агрегаты. Их создаёт скрипт из исходных ежедневных данных Open-Meteo Archive/ERA5.
- `.github/workflows/refresh-climate-data.yml`: ежедневное обновление агрегатов по расписанию или вручную.

Ежедневные многолетние ряды не сохраняются. При каждом обновлении генератор заново получает их из публичного API, пересчитывает недельные данные, климатологию, сезонные переходы и аналоги, затем публикует только результат.

## Локальный запуск

Требуется Node.js 22+.

```bash
npm run data:refresh
npm --prefix frontend install
npm --prefix frontend run dev
```

Во втором терминале для прогноза:

```bash
npm --prefix backend install
npm --prefix backend run dev
```

Создайте `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:10000
```

## Vercel

1. Загрузите проект в GitHub.
2. В Vercel импортируйте тот же репозиторий.
3. Укажите **Root Directory**: `frontend`.
4. Build Command: `npm run build`; Output Directory: `dist`.
5. Добавьте Environment Variable `VITE_API_URL`: публичный адрес Render API, например `https://seasonal-climate-api.onrender.com`.
6. Перед первым deploy локально выполните `npm run data:refresh` и закоммитьте `frontend/public/data/dashboard.json`.

## Render

1. Создайте в Render **Blueprint** из репозитория: он прочитает `render.yaml`. Либо создайте Web Service вручную с Root Directory `backend`.
2. Build Command: `npm ci && npm run build`.
3. Start Command: `npm start`.
4. Добавьте `CORS_ORIGIN` со своим Vercel URL, например `https://your-project.vercel.app`.
5. После первого Vercel deploy впишите адрес Render в `VITE_API_URL` и сделайте redeploy frontend.

Проверка API: `https://<render-host>/health`.

## Автообновление

GitHub Actions запускает генератор ежедневно в 02:20 UTC. Он коммитит обновлённый `dashboard.json`; подключённый Vercel автоматически создаст новый deployment. В GitHub можно открыть **Actions → Refresh climate data → Run workflow**, чтобы обновить данные немедленно.

Расписание GitHub Actions на free tier не гарантирует запуск секунду в секунду. Для климатической аналитики задержка в несколько минут обычно несущественна.

## Методология

- Недельные значения: среднее дневных `temperature_2m_mean/max/min`.
- Климатическая норма: среднее недельных значений всех завершённых лет периода.
- Сезонные переходы: средняя неделя устойчивого перехода через 5 °C; в интерфейсе также передаётся межгодовой разброс.
- Группы городов формируются по средней температуре исторических рядов в четыре кластера.
- Аналоги: топ-3 завершённых года по RMSE накопленной недельной температуры текущего года.

Аналоговый ряд: это сценарий на основе истории, а не метеорологический прогноз. Оперативный прогноз отображается отдельно и поступает из Open-Meteo Forecast.
