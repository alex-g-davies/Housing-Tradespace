# Build context is the REPO ROOT (the SPA build needs frontend/):
#   docker build -f backend/Dockerfile .
# Spec 006 R1: SPA built in stage 1, slim Python runtime in stage 2,
# data bundled, non-root, uvicorn on $PORT.

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:20-slim AS spa
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: runtime ---------------------------------------------------------
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/data ./data
COPY --from=spa /build/dist ./static

# Single origin (006 R2): the API serves the built SPA at /.
ENV STATIC_DIR=/app/static \
    PORT=8000

RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
