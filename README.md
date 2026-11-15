# TrendLens

**Be an Earth System Trend Detective.** TrendLens is Team Cosmosis's entry for the
[2026 NASA Space Apps Challenge](https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/).
Pick a place and a question; TrendLens scans NASA Earth science variables, ranks what is
changing, shows where and by how much, tests honestly whether each change is
statistically significant, and explains why it matters for people.

**Live app: https://trendlens-alpha.vercel.app**

## What it does

| Step | Screen | What happens |
|---|---|---|
| **Ask** | Home, Anywhere, Your region | Choose a topic and a region, spin a 3D globe and tap any place (`#/anywhere`), draw any 2–10° box (`#/region`), or type a question ("Is it getting hazier over Delhi?"). |
| **Find** | Trend Radar (`#/explore/<region>`) | Every variable is tested and ranked by signal-to-noise: how far it moved over its record compared with its normal year-to-year swings. A per-cell map shows where it changes. |
| **Test** | Trend (`#/trend/<region>/<variable>`) | Monthly series with the seasons removed, yearly averages, Theil-Sen trend with a 95% band, Mann-Kendall p-value corrected for autocorrelation, and a fixed-format plain-language verdict. |
| **Explain** | Same page, plus Compare | Start-year sensitivity strip, years-of-data-needed estimate, second-opinion tests, weather-station check, false-discovery-controlled trend map, opposite-trends comparison, an **Impact** panel (why the change matters, from 25 cited sources) and "Check it yourself" links to Giovanni, AppEEARS, Worldview and KNMI. |

Extras: four **Case files** on Home (the detective stories in the data), three guided demos (a
clear trend, a not-yet-significant trend, opposite trends), a **3D globe** of NASA GIBS imagery
(Blue Marble or recent MODIS true colour) for live NASA POWER analysis of any grid cell plus the
nearest NOAA station, **Your region** (live NASA POWER regional data for any box, area-weighted
land mean and per-cell trend map in the browser), a practice lab with synthetic data, CSV export,
share links and citations.

## Data

| Variable | Source | Access | Period |
|---|---|---|---|
| Air temperature, hottest-day temperature, rainfall, relative humidity, wind speed, root-zone soil wetness, land evaporation | MERRA-2 (NASA GMAO) | NASA POWER API | 1981–2025 |
| Sunlight reaching the ground, aerosol optical depth, cloud cover | CERES SYN1deg (NASA LaRC; MODIS aerosols and clouds) | NASA POWER API | 2001–2025 |
| Tree cover | MODIS Terra MOD44B v061 | ORNL DAAC MODIS web service | 2000–2025 |
| Vegetation greenness (NDVI) | MODIS Terra MOD13Q1 v061 | ORNL DAAC MODIS web service | 2001–2025 |
| Station temperature and precipitation (cross-check) | NOAA GSOM | NOAA NCEI Climate Data Online | 1981–2025 |
| Map and globe imagery | Blue Marble, MODIS Terra true colour, borders | NASA GIBS (MapLibre globe, Leaflet maps) | — |

Vegetation greenness comes from 54 MODIS sample sites (nine per region; 3,510 requests in all). The ORNL DAAC service
returns 10 composites per request at roughly 30 seconds each, so `pipeline/modis.py` takes many
hours; it is resumable, and `build.py` adds NDVI everywhere in the app once it is downloaded
(`TRENDLENS_SKIP=ndvi` builds without it).

Challenge resources: **Climate Data Online** (station cross-check, cached and live), **Acker et
al. (2009)** (the monthly-anomaly → yearly-anomaly → trend-test recipe) and **A Comprehensive Guide
to Statistical Significance** (how p-values, α and confidence intervals are explained) shape the
data and method. **Giovanni, AppEEARS, Hydrology Time Series and KNMI Climate Explorer** are linked
from every result page to reproduce it; the Medium trend-tests article and the CSA resources (RCM,
SWOT, SAR tutorial, GEO.ca) appear on the Method and Prairies pages. The *Data & sources* page lists
how each one is used.

Featured regions: Central Sahel, Indo-Gangetic Plain, North China Plain, Southern Amazon,
US Southwest, Canadian Prairies (each ≤ 10° × 10°, land cells only).

## Method

1. Area-weighted (cos latitude) average of land grid cells per month.
2. Quality check: coverage, minimum 15 years.
3. Remove the seasonal cycle (subtract each calendar month's mean, add back the overall mean).
4. Average to yearly values.
5. Mann-Kendall test with an AR(1) effective-sample-size correction (Yue & Wang 2004) using a
   bias-corrected lag-1 autocorrelation (Marriott & Pope 1954). The correction can only widen
   the uncertainty.
6. Theil-Sen slope with the Sen (1968) 95% confidence interval from the same corrected variance.
7. Second opinions: least-squares t-test with effective sample size (Santer et al. 2000) and
   Mann-Kendall on all monthly values.
8. Sensitivity: the test repeated for every start year leaving ≥ 10 years.
9. Maps: the test per grid cell, then Benjamini–Hochberg false-discovery-rate control (q = 0.05).
10. Years needed to detect a trend of this size (Weatherhead et al. 1998).

Validation (`pipeline/test_stats.py`, `pipeline/simulate.py`, `src/lib/stats.test.ts`):

- Matches pymannkendall (original, Hamed–Rao, Yue–Wang) and SciPy (Theil-Sen interval,
  `linregress`, `false_discovery_control`) exactly on random series.
- Recovers a known slope from synthetic 45-year monthly data with seasons and memory;
  the 95% interval covers the truth ~95% of the time.
- False-alarm rate stays at or below 10% (4–10%, against a nominal 5%) with autocorrelated noise,
  where the uncorrected test reaches 30% and Hamed–Rao 26% (numbers on the Method page).
- The browser (TypeScript) implementation reproduces every published Python result.

What we do not claim: no forecasts, no causes, no non-linear models. Non-significant trends
are reported as such.

## Project layout

```
pipeline/        Python: download (power.py, modis.py, cdo.py), statistics (stats.py),
                 build.py -> public/data, tests and Monte Carlo validation
data/            cleaned regional series as CSV (one file per region and variable)
public/data/     JSON read by the web app (catalog, per-region series, maps, station checks)
src/lib/         TypeScript statistics port, data loaders, formatting, demos
src/components/  charts (SVG + d3-scale), maps (Leaflet + NASA GIBS), 3D globe (MapLibre), radar,
                 demo player, impact panel, case files, cross-check links
src/lib/impact.ts     why-it-matters content with sources; src/lib/regional.ts  draw-your-own-region
src/pages/       Home, Explore, Trend, Compare, Anywhere, Region, Method, Sources
```

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # TypeScript statistics tests
npm run build        # static site in dist/
```

Rebuild the data (optional; the repository already contains the processed data):

```bash
cd pipeline
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python modis.py      # slow: ~30 s per request and rate-limited; resumable
.venv/bin/python build.py      # POWER and CDO downloads are cached in pipeline/cache/
.venv/bin/python -m pytest -q
.venv/bin/python simulate.py   # public/data/validation.json
```

## Deploy on Vercel

The app is a static Vite build; `vercel.json` sets the build command and output folder.

```bash
npx vercel          # preview deployment
npx vercel --prod   # production
```

Or import the repository in the Vercel dashboard. No environment variables or server code are
needed: live mode calls NASA POWER, NOAA NCEI and the Open-Meteo geocoder directly from the
browser.

## Acknowledgments

These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded
through the NASA Earth Science/Applied Science Program. MODIS subsets: ORNL DAAC (2018), MODIS
and VIIRS Land Products Global Subsetting and Visualization Tool, doi:10.3334/ORNLDAAC/1379.
We acknowledge the use of imagery from NASA's Global Imagery Browse Services (GIBS), part of
NASA's Earth Science Data and Information System (ESDIS). Station data: NOAA National Centers for
Environmental Information. NASA does not endorse this project.

## License

MIT © Team Cosmosis
