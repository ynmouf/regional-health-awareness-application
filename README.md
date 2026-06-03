# Health Location Scorer

A browser app that helps immunocompromised people assess whether a location is safe to live in. Combines air quality, infectious disease risk, healthcare access, and climate data into a single risk score.

## Features

- **City/ZIP search with autocomplete** — type "Denver, CO" or "10001"
- **4-factor risk assessment** — air quality, infection risk (flu/COVID), healthcare access, climate & allergens
- **Overall safety score** — 0–100, with risk label (Low/Moderate/Elevated/High/Severe)
- **Customizable weights** — drag sliders to prioritize the factors that matter most for your condition
- **Seasonal calendar** — 12-month heatmap showing which months are safest
- **Compare mode** — side-by-side scoring for two cities or ZIP codes
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

### Optional: Add Google Static Maps (satellite + map images)

1. Enable the **Maps Static API** in [Google Cloud Console](https://console.cloud.google.com/)
2. Create an API key and restrict it to the Maps Static API + your domain
3. Before the main script in `index.html`, set:
   ```html
   <script>
     window.GOOGLE_MAPS_KEY = 'your-key-here';
   </script>
   ```
4. The app will display a satellite view and a road map of the searched location in the results header. Without a key, the image section is hidden.

> **Cost:** ~$2 per 1,000 static map requests. Google provides $200/month free credit — effectively free for personal use.

### Optional: Add Google Places and Pollen APIs

For stronger U.S. healthcare facility matching and more specific pollen forecasts:

1. Enable the **Places API (New)** and/or **Pollen API** in Google Cloud Console.
2. Add keys in `config.local.js`:
   ```html
   <script>
     window.GOOGLE_PLACES_KEY = 'your-places-key';
     window.GOOGLE_POLLEN_KEY = 'your-pollen-key';
   </script>
   ```
3. If separate keys are not provided, the app will try `window.GOOGLE_MAPS_KEY` for Places/Pollen too. Restrict each key to the specific APIs and domains you use.

Without these keys, healthcare access falls back to OpenStreetMap/Overpass and pollen falls back to Open-Meteo.

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
- **APIs:** Free/public fallbacks, with optional AirNow and Google API keys

### Data Sources

| Factor | API | Coverage |
|--------|-----|----------|
| Geocoding | Nominatim (OpenStreetMap) | Global |
| Air Quality | AirNow (EPA) + Open-Meteo | US (AirNow); global (Open-Meteo) |
| Pollen | Google Pollen API + Open-Meteo | Optional keyed Google; global Open-Meteo fallback |
| Respiratory disease | CDC ARI Activity, RESP-NET | US only (state level) |
| Healthcare facilities | Google Places + Overpass API (OSM) | Optional keyed Google; global OSM fallback |
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
│   │   ├── googleHealthcare.js
│   │   ├── googlePollen.js
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
│       └── fips.js           # FIPS codes
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
- CDC acute respiratory illness (ARI) activity level
- Combined respiratory hospitalization rate per 100k
- COVID-19, flu, and RSV hospitalization rates per 100k

**Healthcare Access (30%)**
- Nearest hospital distance within a 50 km search radius
- Pharmacy count within 5 km
- Immunology/allergy specialist within 20 km

**Climate & Allergens (15%)**
- Relative humidity (ideal 30–55%)
- Daily temperature range
- Pollen (grass, ragweed, birch)

## Caveats

- **CDC data is state-level, not city-level** — reflects your state average, not your specific neighborhood
- **Google Places/Pollen are optional keyed APIs** — without keys, the app uses OpenStreetMap and Open-Meteo fallbacks
- **Open-Meteo pollen data is modeled** — species coverage varies by region
- **Overpass queries can be slow** — results are cached for 24h locally when Google Places is unavailable
- **No real-time disease data** — CDC respiratory datasets update weekly, so rapidly changing outbreaks may lag

## Privacy

- **No tracking** — all computation happens in your browser
- **No data sent to our servers** — only to configured/public APIs (Nominatim, AirNow, Open-Meteo, CDC, Google APIs, Overpass)
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
