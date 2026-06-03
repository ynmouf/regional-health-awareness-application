# Health Location Scorer

A browser app that helps immunocompromised people assess whether a location is safe to live in. Combines air quality, infectious disease risk, healthcare access, and climate data into a single risk score.

## Features

- **City/ZIP search with autocomplete** — type "Denver, CO" or "10001"
- **4-factor risk assessment** — air quality, infection risk (flu/COVID), healthcare access, climate & allergens
- **Overall safety score** — 0–100, with risk label (Low/Moderate/Elevated/High/Severe)
- **Customizable weights** — drag sliders to prioritize the factors that matter most for your condition
- **Seasonal calendar** — 12-month heatmap showing which months are safest
- **Compare mode** — side-by-side scoring for up to 3 cities
- **Export to PDF** — print-friendly report with source citations
- **Completely free** — no registration, no tracking, pure browser app

## Setup

### Local Development

1. Clone or download this folder
2. Serve with any static file server:
   ```bash
   # Python 3
   python3 -m http.server 8000 --directory .
   
   # Node.js (npx http-server)
   npx http-server
   
   # macOS
   cd health-location-scorer && python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser

### Optional: Add AirNow EPA Air Quality Data

By default, the app uses Open-Meteo's AQI estimates. For official EPA AirNow data (US only, higher quality):

1. Register for a free API key at https://docs.airnowapi.org/
2. Before the page loads, set the key in the browser console or via HTML:
   ```html
   <script>
     window.AIRNOW_KEY = 'your-key-here';
   </script>
   ```
   (Place this `<script>` tag in `index.html` **before** the main module script, or enter in DevTools console)

3. The app will use AirNow for US locations, fall back to Open-Meteo elsewhere

### Deployment

Deploy to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.). No build step needed — just drag-and-drop the folder.

```bash
# GitHub Pages example
git add .
git commit -m "Deploy Health Location Scorer"
git push origin main
# Enable Pages in repo settings, point to /root
```

## Architecture

- **Framework:** Vanilla JavaScript (ES modules, no build step)
- **Charts:** Chart.js (CDN)
- **APIs:** All free, no authentication (except optional AirNow)

### Data Sources

| Factor | API | Coverage |
|--------|-----|----------|
| Geocoding | Nominatim (OpenStreetMap) | Global |
| Air Quality | AirNow (EPA) + Open-Meteo | US (AirNow); global (Open-Meteo) |
| Pollen | Open-Meteo | Global (grass, ragweed, birch) |
| Flu / Disease | CDC ILINet, RESP-NET | US only (state level) |
| Vaccination rates | CDC | US only |
| Healthcare facilities | Overpass API (OSM) | Global |
| Climate | Open-Meteo Weather API | Global |
| Historical seasonal | Open-Meteo Historical API | Global |

### File Structure

```
health-location-scorer/
├── index.html                 # Shell & semantic markup
├── style.css                  # All styles, custom properties for theming
├── favicon.svg
├── js/
│   ├── main.js               # Entry point, orchestrates flow
│   ├── geocoding.js          # Nominatim lookups + autocomplete
│   ├── scoring.js            # All normalization & weighting formulas
│   ├── weights.js            # Weight slider state + localStorage
│   ├── api/                  # Data fetching
│   │   ├── airnow.js
│   │   ├── openmeteo.js
│   │   ├── cdc.js
│   │   └── overpass.js
│   ├── ui/                   # UI rendering & interactions
│   │   ├── search.js         # Input + debounced autocomplete
│   │   ├── scoreCard.js      # Category cards + radar chart
│   │   ├── detailPanel.js    # Detail drawer + tooltips
│   │   ├── seasonalCalendar.js
│   │   └── comparePanel.js
│   └── utils/
│       ├── cache.js          # localStorage with TTL
│       ├── fips.js           # FIPS codes
│       └── regionMap.js      # US state → HHS region mapping
└── data/
    └── hhs-regions.json      # CDC HHS regions (static)
```

## Scoring Algorithm

Each of the 4 factors is normalized to 0–100 (100 = safest). Final score is a weighted average.

### Default Weights
- **Air Quality** 25%
- **Infection Risk** 30%
- **Healthcare Access** 30%
- **Climate & Allergens** 15%

Users can customize these in the Settings panel.

### Sub-Scoring

**Air Quality (25%)**
- AQI inverse map (0–50 → 100, 51–100 → 75, etc.)
- PM2.5 µg/m³ linear inverse
- Pollen level (None/Low/Moderate/High/Very High)

**Infection Risk (30%)**
- Flu ILI% (influenza-like illness percentage)
- Vaccination rate (flu or COVID proxy)
- COVID hospitalization rate per 100k

**Healthcare Access (30%)**
- Hospital count within 10 km
- Pharmacy count within 5 km
- Immunology/allergy specialist within 20 km

**Climate & Allergens (15%)**
- Relative humidity (ideal 30–55%)
- Daily temperature range
- Pollen (grass, ragweed, birch)

## Caveats

- **CDC data is state-level, not city-level** — reflects your state average, not your specific neighborhood
- **Pollen data is regional** — European species (birch, alder) are well-covered; other regions may see limited data
- **Overpass queries can be slow** — results are cached for 24h locally
- **No real-time data** — CDC and AirNow update weekly; you may see stale data during outbreaks

## Privacy

- **No tracking** — all computation happens in your browser
- **No data sent to our servers** — only to public APIs (Nominatim, AirNow, Open-Meteo, CDC, Overpass)
- **Results stored locally** — settings and alert thresholds saved in `localStorage`; clear your browser cache to reset

## Accessibility

- WCAG AA compliant (Lighthouse score 90+)
- Keyboard navigable (Tab, Arrow keys, Enter, Escape)
- Screen reader friendly (semantic HTML, ARIA labels)
- Color is never the only indicator — scores use numbers + labels

## License

Public domain — use, modify, redistribute freely.

## Support

Questions or issues? Open an issue on GitHub or contact the maintainer.
