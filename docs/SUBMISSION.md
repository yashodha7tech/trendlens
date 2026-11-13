# TrendLens: submission package

Team Cosmosis · NASA Space Apps Challenge 2026 · *Be an Earth System Trend Detective!*

Numbers below come from the data build of 13 November 2026 (MERRA-2 and CERES via NASA POWER,
MODIS via ORNL DAAC, NOAA Climate Data Online). Re-running `pipeline/build.py` regenerates them.

---

## Project summary (for the submission form)

**TrendLens turns anyone into an Earth data detective.** Pick a place and a question. TrendLens
tests every NASA variable it holds for that place, ranks what is changing, shows where it is
changing and by how much, and says honestly whether each change is statistically significant or
could still be chance.

Students and the public face three walls: they don't know which of NASA's hundreds of variables
to check, they can't easily pull a regional time series, and they don't know how to test a trend
properly. TrendLens removes all three in one guided workflow:

1. **Ask.** Choose a topic (heat, water and rain, vegetation, air and sunlight) and one of six
   featured regions, click any point on Earth, or type a question such as "Is it getting hazier
   over Delhi?".
2. **Find.** The Trend Radar tests seven variables (air temperature, rainfall, root-zone soil
   wetness, land evaporation, tree cover, aerosol optical depth, sunlight reaching the ground) and
   ranks them by signal-to-noise. Each comes with a plain-language definition, its NASA source and
   a significance badge.
3. **Test.** Open a variable: 25 to 45 years of monthly data with the seasonal cycle removed, yearly
   averages, a Theil-Sen trend line with its 95% band, and a Mann-Kendall test corrected for
   year-to-year memory. The verdict is always written in the same sentence format.
4. **Explain.** A start-year sensitivity strip, a years-of-data-needed estimate, two second-opinion
   tests, a check against NOAA weather stations, a per-grid-cell trend map with false-discovery-rate
   control, and an opposite-trends comparison between regions.

Three guided demos walk through a clear trend, a trend that is not significant yet, and one
variable moving in opposite directions in two regions. **Anywhere** mode fetches live NASA POWER
data for any grid cell on Earth and runs every test in the browser.

## How it meets the challenge objectives

| Objective | TrendLens |
|---|---|
| Identify variables of interest | Guided questions, keyword question matching, Trend Radar ranking, plain-language definitions |
| Acquire data for a region | Six featured regions (area-weighted land cells, cached) plus live data for any point |
| Generate and visualise a long time series | 1981–2025 for MERRA-2, 2000/2001–2025 for CERES and MODIS; raw and seasons-removed views |
| Rate of change and significance | Theil-Sen slope per decade with 95% interval, Mann-Kendall p-value, least-squares t-test |

## Judging criteria

**Relevance.** All four objectives in one workflow, built for the audience the challenge names:
every variable is defined in plain words, every result is a sentence, and the demos show the tool
before you use it.

**Validity.**
- Autocorrelation-aware significance. In 2,000-run simulations the plain Mann-Kendall test raises
  false alarms up to 30% of the time when years remember the year before, and the popular
  Hamed–Rao correction up to 26%. TrendLens's correction stays at or below 10%. Results are on the
  Method page.
- Known-answer tests: on synthetic 45-year monthly series the slope is recovered (0.297 found vs
  0.30 true) and the 95% interval covers the truth 95.2% of the time.
- Exact agreement with pymannkendall and SciPy. A second, independent TypeScript implementation
  reproduces every published Python result.
- Benjamini–Hochberg false-discovery control on every map.
- An independent check: NOAA station records. In the US Southwest, 57 stations track MERRA-2 with
  r = 0.96 for temperature, and both show significant warming and drying.
- Honest reporting: "not significant yet" with an estimate of the years of data needed, and no
  forecasts or causal claims.

**Creativity.**
- Trend Radar ranking.
- A start-year sensitivity strip that reveals non-linear stories (North China haze: not
  significant from 2001, significant from 2005 onward).
- An automatic opposite-trend finder.
- Live analysis anywhere on Earth.
- A practice lab where you plant a trend in fake data and see whether the test can find it.

**Influence.** A free, static website that works on a phone, needs no login and teaches the
reasoning, not just the answer. Teachers can share any result as a link, and students can download
the CSV and redo the analysis in a spreadsheet.

**Presentation.** A NASA-style interface (Inter and DM Mono, the nasa.gov typefaces), NASA GIBS
imagery, accessible colours (validated for colour-blind readers; direction always shown with an
arrow and a word as well) and a table view under every chart.

## Findings worth showing

| Case | Result |
|---|---|
| Southern Amazon, air temperature | +0.48 °C per decade (95%: +0.31 to +0.64), p < 0.001. Significant from 29 of 36 possible start years |
| Southern Amazon, rainfall | −0.48 mm/day per decade (−9.7% of average), p < 0.001 |
| Southern Amazon, tree cover | −6.4 percentage points per decade, p < 0.001 |
| Canadian Prairies, air temperature | +0.15 °C per decade, p = 0.26, not significant yet; a trend this size needs ≈ 75 years of data (we have 45). 25 NOAA stations agree (r = 0.975, also not significant) |
| Indo-Gangetic Plain vs North China Plain, sunlight at the ground | −0.70 vs +0.55 MJ/m²/day per decade, both significant: opposite directions |
| Indo-Gangetic Plain, aerosol optical depth | +0.088 per decade, p < 0.001 |
| North China Plain, aerosol optical depth | Not significant from 2001 (rise then fall); significant decline for any start year from 2005 |

27 of 42 region–variable trends are significant at the 5% level.

## Demo video script (about 2 min 40 s)

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:10 | Home hero | "NASA measures hundreds of things about our planet. But is any one of them really changing where you live, or is it just noise?" |
| 0:10–0:30 | Ask panel: Southern Amazon → Find what's changing | "TrendLens starts with a question and a place. Here, the southern Amazon, where forest meets farmland." |
| 0:30–1:00 | Trend Radar, then the map | "The Trend Radar tests seven NASA variables and ranks them by how far they moved compared with normal year-to-year swings. The map shows the change grid cell by grid cell, with false-discovery control so luck doesn't paint the map." |
| 1:00–1:30 | Air temperature result, cards, sensitivity strip | "Air temperature: +0.48 °C per decade, p below 0.001, significant. And it isn't a fluke of when we start counting: almost every start year gives the same verdict." |
| 1:30–1:50 | Demo 2: Canadian Prairies | "Here's honesty: Prairie temperatures rise 0.15 °C per decade, but with winters this wild we can't rule out chance. A trend this size needs about 75 years of data; we have 45. NOAA weather stations agree." |
| 1:50–2:10 | Compare: sunlight, India vs China | "Same variable, opposite directions. Sunlight at the ground is falling over India and rising over China. One process, haze, explains both." |
| 2:10–2:30 | Method page: validation tables, practice lab | "Every number is tested: simulations, trusted libraries and two independent implementations. Students can even plant a trend in fake data and see if the test finds it." |
| 2:30–2:40 | Anywhere: click your home town | "And it works anywhere on Earth. Be a trend detective." |

## References and resources

Listed in full on the in-app *Data & sources* page and in `README.md`: MERRA-2 (Gelaro et al.
2017), CERES SYN1deg (Doelling et al. 2013), MODIS MOD44B v061, NASA POWER, ORNL DAAC MODIS web
service, NOAA GSOM / Climate Data Online, NASA GIBS; Mann (1945), Kendall (1975), Sen (1968),
Hamed & Rao (1998), Yue & Wang (2004), Marriott & Pope (1954), Santer et al. (2000), Weatherhead
et al. (1998), Benjamini & Hochberg (1995), Wilks (2016), Acker et al. (2009). Statistical
significance guide: Statsig, *A Comprehensive Guide to Statistical Significance*.
