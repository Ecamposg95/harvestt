"""Seed idempotente: org y superadmin desde env, catálogo inicial. Se ejecuta en cada arranque."""
import logging

import app.models_registry  # noqa: F401
from app.core.db import SessionLocal
from app.modules.catalog import seed as catalog_seed
from app.modules.identity import seed as identity_seed
from app.modules.projects import seed as projects_seed
from app.modules.prototypes import seed as prototypes_seed
from app.modules.telemetry import seed as telemetry_seed

SEEDS = (identity_seed, catalog_seed, projects_seed, prototypes_seed, telemetry_seed)


def run() -> None:
    with SessionLocal() as db:
        for module in SEEDS:
            module.seed(db)
            db.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
    logging.info("seed completado")
