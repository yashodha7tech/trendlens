# TrendLens: submission package

Team Cosmosis · NASA Space Apps Challenge 2026 · *Be an Earth System Trend Detective!*

- **Live app:** https://trendlens-alpha.vercel.app
- **Code:** https://github.com/yashodha7tech/trendlens

Numbers below come from the data build of 15 November 2026 (MERRA-2 and CERES via NASA POWER,
MODIS via ORNL DAAC, NOAA Climate Data Online). Re-running `pipeline/build.py` (data) and
`pipeline/simulate.py` (validation) regenerates them; every number in the app is read from that
build, never typed by hand.

---

## Project summary (for the submission form)

**TrendLens turns anyone into an Earth data detective.** Pick a place and a question. TrendLens
tests every NASA variable it holds for that place, ranks what is changing, shows where it is
changing and by how much, says honestly whether each change is statistically significant or could
still be chance, and explains why the change matters for people.

Students and the public face three walls: they don't know which of NASA's hundreds of variables
to check, they can't easily pull a regional time series, and they don't know how to test a trend
properly. TrendLens removes all three in one guided workflow:

1. **Ask.** Choose a topic (heat, water and rain, vegetation, air and sunlight) and one of six
   featured regions, spin a 3D globe and tap any place, draw your own region, or type a question
   such as "Is it getting hazier over Delhi?".
2. **Find.** The Trend Radar tests 11 NASA variables (air and hottest-day temperature, rainfall,
   humidity, root-zone soil wetness, land evaporation, tree cover, aerosol optical depth, sunlight
   reaching the ground, cloud cover, wind speed) and ranks them by signal-to-noise. Each comes with
   a plain-language definition, its NASA source and a significance badge.
3. **Test.** Open a variable: 25 to 45 years of data (monthly with the seasonal cycle removed;
   yearly for tree cover), yearly averages, a Theil-Sen trend line with its 95% band, and a
   Mann-Kendall test corrected for year-to-year memory. The verdict is always written in the same
   sentence format.
4. **Explain.** A start-year sensitivity strip, a years-of-data-needed estimate, second-opinion
   tests, a check against NOAA weather stations, a per-grid-cell trend map with false-discovery-rate
   control, an opposite-trends comparison, and an **Impact** panel: what a change like this means for
   health, food, water, energy and ecosystems, who is affected, and how people use the information,
   from 25 published sources (IPCC AR6, WHO, NASA, FAO, peer-reviewed studies).

Home opens with four **Case files**, the detective stories the data tells, and three guided demos.
**Anywhere** mode puts a 3D globe of NASA GIBS imagery in your hands: tap any spot and TrendLens
fetches live NASA POWER data and runs every test in the browser. **Your region** does the same for
any 2–10° box: it downloads every grid cell, averages the land by area, and maps the trend cell by
cell.

## How it meets the challenge objectives

| Objective | TrendLens |
|---|---|
| Identify variables of interest | Guided questions, keyword question matching, Trend Radar ranking of 11 variables, plain-language definitions, impact notes |
| Acquire data for a region | Six featured regions (area-weighted land cells, cached), **any region you draw** (live NASA POWER regional data), and any point on a 3D globe |
| Generate and visualise a long time series | 1981–2025 for MERRA-2, 2000/2001–2025 for CERES and MODIS; raw and seasons-removed views; per-cell trend maps |
| Rate of change and significance | Theil-Sen slope per decade with 95% interval, Mann-Kendall p-value corrected for autocorrelation, least-squares t-test |

## Judging criteria

**Relevance.** All four objectives in one workflow, built for the audience the challenge names:
every variable is defined in plain words, every result is a sentence, and the demos and case files
show the tool before you use it. Every resource on the challenge's Resources tab is used or linked
(see *Data & sources* in the app).

**Validity.**
- Autocorrelation-aware significance. In 2,000-run simulations the plain Mann-Kendall test raises
  false alarms up to 30% of the time when years remember the year before, and the popular
  Hamed–Rao correction up to 26%. TrendLens's correction stays at or below 10%. Results are on the
  Method page.
- Known-answer tests: on synthetic 45-year monthly series the slope is recovered (0.297 found vs
  0.30 true) and the 95% interval covers the truth 95.2% of the time.
- Exact agreement with pymannkendall and SciPy. A second, independent TypeScript implementation
  reproduces every published Python result, and the in-browser *Your region* analysis of the
  Indo-Gangetic Plain box matches the published pipeline on 50 of 50 checks.
- Benjamini–Hochberg false-discovery control on every map.
- An independent check: NOAA station records. In the US Southwest, 57 stations track MERRA-2 with
  r = 0.96 for temperature and 62 stations with r = 0.97 for rainfall, and both sources show
  significant warming and drying.
- Honest reporting: "not significant yet" with an estimate of the years of data needed, and no
  forecasts or causal claims. Impact text is labelled as research context, never as a conclusion
  of the test.

**Creativity.**
- Trend Radar ranking and an automatic opposite-trend finder (31 opposite pairs across 9 variables).
- A start-year sensitivity strip that reveals non-linear stories (North China haze: not
  significant from 2001, significant from 2005 onward).
- A 3D globe and draw-your-own-region analysis, live, anywhere on Earth.
- Case files that turn results into detective stories.
- A practice lab where you plant a trend in fake data and see whether the test can find it.

**Influence.** A free, static website that works on a phone, needs no login and teaches the
reasoning, not just the answer. Each result says why it matters for people, and points to NASA
tools (Giovanni, AppEEARS, Worldview) to check it independently. Teachers can share any result as a
link, and students can download the CSV and redo the analysis in a spreadsheet.

**Presentation.** A NASA-inspired interface (deep-space navy, NASA blue and red accents, Inter and
DM Mono, the nasa.gov typefaces), NASA GIBS imagery on maps and the globe, accessible colours
(contrast-checked; direction always shown with an arrow and a word as well) and a table view under
every chart.

## Findings worth showing

| Case | Result |
|---|---|
| Southern Amazon, air temperature | +0.48 °C per decade (95%: +0.31 to +0.64), p < 0.001. Significant from 29 of 36 possible start years |
| Southern Amazon, hottest-day temperature and humidity | +0.76 °C and −2.6 percentage points of humidity per decade, both p < 0.001 |
| Southern Amazon, rainfall | −0.48 mm/day per decade (−9.7% of average), p < 0.001 |
| Southern Amazon, tree cover | −6.4 percentage points per decade, p < 0.001 |
| Canadian Prairies, air temperature | +0.15 °C per decade, p = 0.26, not significant yet; a trend this size needs ≈ 75 years of data (we have 45). 25 NOAA stations agree that neither trend is significant (r = 0.97) |
| Indo-Gangetic Plain vs North China Plain, sunlight at the ground | −0.70 vs +0.55 MJ/m²/day per decade, both significant: opposite directions |
| Indo-Gangetic Plain vs North China Plain, cloud cover | +4.2 vs −1.9 percentage points per decade, both significant: opposite directions |
| Indo-Gangetic Plain, aerosol optical depth | +0.088 per decade, p < 0.001 |
| North China Plain, aerosol optical depth | Not significant from 2001 (rise then fall); significant decline for any start year from 2005 |

39 of 66 region–variable trends are significant at the 5% level.

## Demo video script (about 2 min 50 s)

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:10 | Home hero | "NASA measures hundreds of things about our planet. But is any one of them really changing where you live, or is it just noise?" |
| 0:10–0:30 | Case files | "TrendLens is a detective's notebook. Each case starts with a question, follows the clues in NASA data, and ends with an honest verdict and what it means for people." |
| 0:30–1:00 | Case 01 → Trend Radar for the southern Amazon, then the map | "Case one: the southern Amazon. The Trend Radar tests 11 NASA variables and ranks them by how far they moved compared with normal year-to-year swings. Hotter, drier, fewer trees: several variables, one story. The map shows it grid cell by grid cell, with false-discovery control so luck doesn't paint the map." |
| 1:00–1:25 | Air temperature result, sensitivity strip, Impact panel | "+0.48 °C per decade, p below 0.001. 29 of 36 start years give the same verdict. And here's why it matters: heat, harvests, water. The test says whether it changed; published research says why that matters." |
| 1:25–1:45 | Case 03: Canadian Prairies | "Honesty matters too. Prairie temperatures rise 0.15 °C per decade, but we can't rule out chance. A trend this size needs about 75 years of data; we have 45. Not guilty yet." |
| 1:45–2:05 | Case 02 → Compare: sunlight, India vs China | "Same variable, opposite directions. Sunlight at the ground is falling over India and rising over China, where air pollution was cut. One process, haze, explains both." |
| 2:05–2:30 | Anywhere: spin the globe, tap a town; then Your region: draw a box | "And it works anywhere. Spin the globe, tap your town, and TrendLens pulls live NASA data and runs every test in your browser. Or draw your own region, and get the full analysis cell by cell." |
| 2:30–2:50 | Method page, then Data & sources | "Every number is tested: simulations, trusted libraries and two independent implementations, and every result links to NASA tools to check it yourself. Be a trend detective." |

## References and resources

Listed in full on the in-app *Data & sources* page and in `README.md`: MERRA-2 (Gelaro et al.
2017), CERES SYN1deg (Doelling et al. 2013), MODIS MOD44B and MOD13Q1 v061, NASA POWER, ORNL DAAC
MODIS web service, NOAA GSOM / Climate Data Online, NASA GIBS; Mann (1945), Kendall (1975), Sen
(1968), Hamed & Rao (1998), Yue & Wang (2004), Marriott & Pope (1954), Santer et al. (2000),
Weatherhead et al. (1998), Benjamini & Hochberg (1995), Wilks (2016), Acker et al. (2009). Impact
context: IPCC AR6 WGI and WGII, WHO fact sheets, NASA Earth Observatory and Earthdata, FAO, and
peer-reviewed studies (Gatti et al. 2021, Smith et al. 2023, Butt et al. 2023, Williams et al. 2022,
Burney & Ramanathan 2014, Zhang et al. 2019, Sweerts et al. 2019, Wild 2009, Rodell et al. 2009).
Challenge resources: Climate Data Online, Acker et al. (2009) and the Statsig significance guide
shape the data and method; Giovanni, AppEEARS, Hydrology Time Series, KNMI Climate Explorer, the
Medium trend-tests article and the CSA resources are linked where they help a user check or extend
a result. Maps and the globe use NASA GIBS imagery (Blue Marble, MODIS true colour) and MapLibre.
