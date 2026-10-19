PY ?= $(if $(wildcard $(HOME)/.venvs/harvestt/bin/python),$(HOME)/.venvs/harvestt/bin/python,python3)

.PHONY: setup dev dev-api dev-web db migrate seed-demo test-critical test build

setup:
	$(PY) -m pip install -r requirements-dev.txt
	cd frontend && npm ci

db:
	docker compose up -d db

migrate:
	$(PY) -m alembic upgrade head

seed-demo:
	$(PY) -m scripts.seed

dev-api:
	$(PY) -m uvicorn app.main:app --reload --port 8000

dev-web:
	cd frontend && npm run dev

dev: db migrate seed-demo
	@echo "Ejecuta en dos terminales: make dev-api  y  make dev-web"

test-critical test:
	$(PY) -m pytest
	cd frontend && npx tsc -b && npx vitest run

build:
	cd frontend && npm run build
	docker build -t harvestt-cortex .
