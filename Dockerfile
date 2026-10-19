# --- 1. Frontend ---
FROM node:20-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- 2. Dependencias Python ---
FROM python:3.12-slim AS deps
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

# --- 3. Runtime ---
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:$PATH" TZ=America/Mexico_City
WORKDIR /srv
RUN useradd --create-home --uid 1000 app
COPY --from=deps /opt/venv /opt/venv
COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts
COPY --from=web /web/dist ./frontend/dist
RUN mkdir -p /srv/storage && chown -R app:app /srv
USER app
EXPOSE 8000
# Migraciones y seed en el arranque (la fase de release de Railway no tiene red privada)
CMD ["sh", "-c", "alembic upgrade head && python -m scripts.seed && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
