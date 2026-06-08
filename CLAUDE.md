# CLAUDE.md

Standing context for the **tradespace** project. This file describes *how we
work here*. It is loaded into every session, so keep it lean and durable.
Feature requirements, acceptance criteria, and scope do **not** belong here —
those live in `specs/`.

## What this is

tradespace helps people decide where they could live by overlaying housing
cost and commute time around fixed constraints (a work location and a budget).
It renders a map that shades areas by median home value and overlays drive-time
**isochrones** — contours of equal travel time — so a user can see which areas
are both affordable and commutable. Later work adds a blended cost surface,
optimization, and forecasting.

## Tech stack

- **Backend:** Python 3.11+, FastAPI, run with uvicorn. Numerical/analytical
  work uses numpy/scipy.
- **Frontend:** React + Vite. MapLibre GL for map rendering; d3-contour /
  turf.js for derived surfaces.
- **Data:** static aggregate datasets (Zillow ZHVI, Redfin Data Center),
  committed as small preprocessed files. **No database for the MVP.**
- **External APIs:** Mapbox Isochrone API for commute contours — called from
  the backend only.

## Repository layout

```
backend/      FastAPI app, isochrone proxy, data loading, tests
frontend/     React + Vite SPA, MapLibre map
specs/        One spec per feature (the source of truth for what to build)
```

## Commands

Backend (run from `backend/`):
- Install: `pip install -r requirements.txt`
- Dev server: `uvicorn app.main:app --reload`
- Test: `pytest`
- Lint/format: `ruff check .` and `ruff format .`

Frontend (run from `frontend/`):
- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Test: `npm run test`

## Conventions

- Python: type hints on all public functions; format with ruff; small,
  single-purpose modules. Prefer pure functions for analytical/transform logic
  so they are unit-testable.
- React: functional components and hooks; keep components focused.
- Commits: reference the active spec's requirement ID where relevant
  (e.g. `R3: overlay drive-time isochrone`).
- When building UI, commit to a deliberate aesthetic rather than defaulting to
  generic patterns; the map is the product, so prioritize legibility of the
  cost/commute layers.

## Hard constraints (do not violate)

- Use **only free/aggregate** housing data. Never scrape listing sites or use
  any data source whose terms forbid it.
- API keys and tokens are read **only on the backend** from environment
  variables. They must never appear in the frontend bundle or in any
  client-side network request.
- No personal user data is persisted in the MVP.

## How we work (spec-driven)

- Every feature has a spec in `specs/`. **Read the relevant spec before
  planning or writing code.**
- The loop is: **spec → plan → implement → review → test**, with a human review
  between phases.
- Build the thinnest end-to-end slice first; generalize only once it works.
- **Definition of done** = the spec's Acceptance Criteria all pass and each
  traces to a requirement ID. Do not self-declare done — the human verifies the
  implementation against the spec.