# Deploy to the cloud (AWS or Azure): reference architectures + required changes

> Tracking doc for a future production deployment. No deployment work is done yet —
> this captures the approach so it can be picked up another day. (Mirror of the
> intended GitHub issue of the same title.)

## Summary

Deploy **tradespace** (FastAPI API + static React/Vite SPA + read-only per-state
data files + a server-side Mapbox token). The app is **stateless with no
database**, so this is mostly **packaging + hosting + CI/CD**. Goal: a single HTTPS
domain serving the SPA and `/api/*`, with the Mapbox token kept server-side (R5).

## What needs hosting

- **API** — stateless FastAPI/uvicorn. Runtime deps: fastapi, uvicorn, httpx,
  pydantic-settings, tzdata, shapely (**not** pandas — build-only). In-memory LRU
  caches (fine per instance; the service is stateless and scales horizontally).
  Makes outbound calls to `api.mapbox.com` (isochrone + geocode).
- **SPA** — static `frontend/dist` (Vite build); calls a **relative `/api`**.
- **Data** — read-only files under `backend/data/` (`states/*.geojson`,
  `states/*.zhvi.json`, `regions.json`, `isochrone_fixture.json`). ~12 MB for the
  current demo states, ~80–100 MB if all ~51 states are shipped. Bundle in the API
  image, or put in object storage (S3/Blob).
- **Secret** — `MAPBOX_TOKEN` (env var, server-side only; never in the client).
  Optional: `CORS_ORIGINS`.

## Required app changes (small)

- [ ] **Backend `Dockerfile`** (+ `.dockerignore`): `python:3.12-slim`, install the
  runtime requirements only, copy `app/` + `data/`, run
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or gunicorn with uvicorn
  workers). `.dockerignore` excludes `.venv`, `tests/`, `.env`, `node_modules`,
  `scripts/raw`.
- [ ] **Same-origin routing** so the SPA and `/api/*` share one domain → no CORS and
  the relative `/api` just works. If split origins are chosen instead: set
  `CORS_ORIGINS` on the API (already a `Settings` field in `app/config.py`) and add
  a build-time `VITE_API_BASE` for the SPA (`frontend/src/config.ts` `API_BASE`).
- [ ] **Inject `MAPBOX_TOKEN`** from the platform secret store (never commit `.env`).
  The Mapbox production token needs **no URL restriction** — server-side calls send
  no `Referer`, so a URL-restricted token would 403.

## Reference architecture — AWS

- **SPA**: S3 (private) + **CloudFront** (Origin Access Control, ACM TLS cert,
  Route 53 domain).
- **API**: container image in **ECR** → **AWS App Runner** (simplest: autoscaling,
  managed HTTPS, health check `/api/health`) or **ECS Fargate + ALB** (more
  control). Lambda + API Gateway (via Mangum) is possible but the always-on nature
  and bundled data favor a long-running container.
- **One origin**: CloudFront with two origins — default behavior → S3 (static),
  behavior `/api/*` → App Runner/ALB. Token stays server-side; no CORS.
- **Secret**: Secrets Manager or SSM Parameter Store → `MAPBOX_TOKEN` env.
- **CI/CD**: GitHub Actions — build/push image to ECR & deploy; build the SPA → sync
  to S3 → CloudFront invalidate. IaC: CDK or Terraform (optional).

## Reference architecture — Azure

- **SPA**: **Azure Static Web Apps** (global CDN, managed HTTPS, custom domain) — or
  Blob static website + Azure Front Door.
- **API**: image in **ACR** → **Azure Container Apps** (serverless containers,
  autoscale, managed HTTPS, health probes) or **App Service (Web App for
  Containers)**.
- **One origin**: Static Web Apps "linked backend" routes `/api/*` to Container Apps
  on the same hostname (no CORS) — or Front Door routing.
- **Secret**: Key Vault (or a Container Apps secret) → `MAPBOX_TOKEN` env.
- **CI/CD**: GitHub Actions (`azure/static-web-apps-deploy` + `azure/container-apps`
  deploy). IaC: Bicep or Terraform (optional).

## Recommendation

Lowest-ops path: **AWS** = S3 + CloudFront + App Runner; **Azure** = Static Web Apps
+ Container Apps. Both keep one origin (no CORS), the token server-side, and the
data bundled in the API image.

## Decisions to make

- [ ] Cloud: AWS vs Azure.
- [ ] Compute: serverless-container (App Runner / Container Apps) vs orchestrated
  (Fargate / App Service).
- [ ] Origin model: single-origin (recommended) vs split origins (+CORS/`VITE_API_BASE`).
- [ ] Data delivery: bundle in image vs object storage (matters at ~100 MB, or to
  refresh data without a redeploy).
- [ ] Custom domain + TLS; CI/CD (GitHub Actions) + IaC tool (CDK/Terraform/Bicep).
- [ ] Mapbox production token + rate limits/cost; CARTO basemap usage limits.

## Acceptance criteria

- [ ] One HTTPS domain serves the SPA and `/api/*`.
- [ ] `MAPBOX_TOKEN` comes from a secret store; no token appears in the client bundle
  or any client request (R5). `/api/health` is green behind the load balancer.
- [ ] Region switch, hover popups, and the live isochrone all work in production.
- [ ] Reproducible deploy (documented or IaC) with CI/CD on push.
