# tradespace

Decide where you could live by overlaying **housing cost** and **commute time**.
The MVP (spec [`specs/001-mvp`](specs/001-mvp)) renders a Seattle-metro map that
shades each ZIP by median home value, de-emphasizes ZIPs over a budget, and
overlays a drive-time isochrone from a work location you can move by dragging the
pin (default: the Museum of Flight). Later specs add richer per-ZIP metrics and a
metric switcher ([`002`](specs/002-data-enrichment)) and an adjustable commute
time (15/30/45/60 min) with time-of-day reach variation
([`003`](specs/003-commute-depth)). Specs 002–003 go beyond the original MVP scope.

The map is the product: a FastAPI backend serves preprocessed aggregate data and
proxies the (token-bearing) Mapbox Isochrone call; a React + MapLibre frontend
renders the two layers on a keyless basemap.

## Prerequisites

- **Python 3.11+.** A 3.13 interpreter is present at
  `C:\Users\Alex\AppData\Local\Programs\Python\Python313\python.exe` (not on PATH).
- **Node.js 18+ / npm** — required to run the frontend (install from nodejs.org).
- **Mapbox token** — *optional*. Without one, the isochrone overlay is served
  from a committed fixture. With one, it's fetched live. The token is read only on
  the backend and never reaches the browser (R5).

## Backend (`backend/`)

```powershell
cd backend
# Create a venv with the Python 3.13 interpreter, then install deps:
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

# Run the API (http://localhost:8000):
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# Test & lint:
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check . ; .\.venv\Scripts\python.exe -m ruff format .
```

Endpoints:

| Method/Path           | Purpose                                                        |
| --------------------- | ------------------------------------------------------------- |
| `GET /api/health`     | Liveness check.                                               |
| `GET /api/housing`    | Per-ZIP median home values (R1).                              |
| `GET /api/zips.geojson` | ZIP polygons with `median_value` merged in (R2).            |
| `GET /api/isochrone`  | 30-min driving contour — fixture or live Mapbox (R3/R5).      |

### Configuration

Copy `backend/.env.example` to `backend/.env` and set values. `.env` is gitignored.
With `MAPBOX_TOKEN` blank, `/api/isochrone` serves `data/isochrone_fixture.json`;
set the token (and `WORK_LAT`/`WORK_LON`) to fetch a live, road-bounded contour.

## Frontend (`frontend/`)

```powershell
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxies /api -> backend on :8000)
npm run test     # vitest
npm run build
```

Run the backend first so the frontend's `/api` proxy has something to talk to.

## Data

The app is **national, region-on-demand**: pick a state and only that state's ZIPs
load. `backend/scripts/build_data.py` processes the national ZHVI (grouped by
state), joins each state's value→geometry on a 5-char ZIP, simplifies, and writes
`backend/data/states/{ST}.geojson` + `{ST}.zhvi.json` plus a `regions.json` index
(name/bbox/center/count for the picker). Per ZIP it derives (spec 002): **YoY %**,
**5-year CAGR**, a quarterly **price-history** series, plus optional **$/sqft**.

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\build_data.py --states WA,OR,CA   # just these (dev)
.\.venv\Scripts\python.exe scripts\build_data.py                     # ALL states (~1 GB DL)
.\.venv\Scripts\python.exe scripts\build_data.py --states WA --redfin-url  # + national $/sqft
```

The committed repo ships a few states (WA/OH/CA). Building **all ~51** produces
~80–100 MB of geometry — track `backend/data/states/*.geojson` with **git-lfs** (or
host them) if you commit the full set. Largest state (CA ~1,500 ZIPs ≈ 5 MB) still
renders in ~1–2 s; only the selected state is fetched.

Sources (free / aggregate):

- **Zillow ZHVI** by ZIP — median home value + history. © Zillow Research.
  (ZHVI is smoothed/seasonally adjusted and may **restate** prior months on
  re-download, so historical YoY/CAGR can shift slightly between builds.)
- **ZCTA ZIP boundaries** — © U.S. Census Bureau (via the OpenDataDE mirror).
- **Redfin** `zip_code_market_tracker` — `MEDIAN_PPSF` (median **sold** price per
  square foot, All Residential) for `$/sqft`. © Redfin Data Center. **Optional**
  and **large** (>4 GB uncompressed): off unless you pass
  `--redfin-url`/`--redfin-path`; streamed in chunks and filtered to a tiny
  committed file. Without it, $/sqft renders as "no data" and the app works
  normally.

The committed `backend/data/isochrone_fixture.json` is a single drive-time polygon
served only in **fixture mode** (no `MAPBOX_TOKEN`) as one "typical" band. With a
token, `/api/isochrone` instead returns three live traffic-aware bands (off-peak /
midday / rush hour) for the selected time, so the fixture is just an offline
fallback — keep it a single Polygon feature.

## Deployment (spec [`006`](specs/006-deployment))

The app ships as **one container, one origin**: a multi-stage
[`backend/Dockerfile`](backend/Dockerfile) builds the SPA and serves it from
the FastAPI app (`STATIC_DIR`), so production needs no CORS and the relative
`/api` calls work unchanged. [`render.yaml`](render.yaml) deploys it to
Render (Starter plan) with health checks and autodeploy from `main`;
[CI](.github/workflows/ci.yml) gates every push with lint, tests, and a
Docker smoke run in fixture mode.

```powershell
# Local production-image smoke test (from the repo root):
docker build -f backend/Dockerfile -t tradespace .
docker run --rm -p 8000:8000 -e MAPBOX_TOKEN=$env:MAPBOX_TOKEN tradespace
# -> http://localhost:8000 serves the SPA; /api/* the API.
```

First-time Render setup (manual, once):

1. Push the repo to GitHub and create a **Blueprint** on Render pointing at it
   (`render.yaml` is picked up automatically).
2. Set `MAPBOX_TOKEN` in the Render dashboard (it is `sync: false` in the
   blueprint — it never lives in the repo).
3. Protect the `main` branch on GitHub (require the CI checks) so Render's
   autodeploy only ever sees green commits.

**Mapbox spend guardrails:** set a spending limit *and* a usage alert in the
Mapbox dashboard. The production token needs no URL restriction (server-side
calls send no Referer). The backend additionally enforces per-IP rate limits
and a daily upstream-call budget (`MAPBOX_DAILY_CALL_BUDGET`, spec 004). If
the token ever leaks, rotate it in Mapbox and update the Render env var.

## License & data attribution

Code is licensed under **AGPL-3.0** (see [LICENSE](LICENSE)): you may use and
modify it, but a service run on a modified version must publish its source.

Data and tiles are third-party, free/aggregate, **research-and-attribution
use** — commercial use of this app would require revisiting these terms:

- Housing values: **Zillow Home Value Index (ZHVI)** © Zillow Research.
- ZIP boundaries: **ZCTA** geometries © U.S. Census Bureau (OpenDataDE mirror).
- $/sqft (optional): © **Redfin** Data Center.
- Basemap tiles: © **CARTO**, © OpenStreetMap contributors.
- Isochrones & geocoding: **Mapbox** APIs (server-side, token required).

## Verifying the MVP (spec acceptance criteria)

1. Page load shows the ZIP choropleth + color legend. *(choropleth → R1/R2)*
2. Entering a budget de-emphasizes over-budget ZIPs. *(→ R4)*
3. The drive-time reach is visible and road-bounded — with a live token, not a
   circle. Dragging the pin moves it and refetches; an address search relocates
   it. *(→ R3)*
4. The browser Network tab shows no Mapbox token in any client request — only
   `/api/*` calls to your own origin. *(→ R5)*
5. The metric switcher reshades the map and swaps the legend (Value / YoY /
   $/sqft); YoY shows falling ZIPs in a distinct hue. *(spec 002 → R4)*
6. Hovering/tapping a ZIP shows value, YoY, 5-year CAGR, $/sqft, and a sparkline.
   *(spec 002 → R5)*
7. Choosing 15/30/45/60 min redraws the reach; three departure bands (off-peak /
   midday / rush hour) render with distinct outlines, and the panel shows the
   peak-vs-off-peak reach (mi²) and shrink %. *(spec 003 → R1–R3)*
8. `pytest` (backend) and `npm run test` (frontend) pass.

The human walks this list against the running app; the implementer does not
self-certify done.
