"""Sincroniza las copias locales de los bancos de datos.

Uso: python -m scripts.connectors.sync [--source gbif|wfo|wikidata|genesys|all]
Imprime una línea por fuente; sale con código 1 si alguna termina en `error`.
"""
import argparse
import sys
from datetime import datetime, timezone

from app.core.db import SessionLocal
from app.modules.connectors.sync import CONNECTORS, SyncRefused, run_sync

SOURCE_KEYS = list(CONNECTORS)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", choices=[*SOURCE_KEYS, "all"], default="all")
    args = parser.parse_args(argv)
    keys = SOURCE_KEYS if args.source == "all" else [args.source]
    failed = False
    with SessionLocal() as db:
        for key in keys:
            try:
                sync = run_sync(db, key, None, datetime.now(timezone.utc))
            except SyncRefused as exc:
                print(f"{key}: rechazada ({exc.code}) {exc.message}")
                continue
            except Exception as exc:  # noqa: BLE001
                print(f"{key}: error ({type(exc).__name__})")
                failed = True
                continue
            print(f"{key}: {sync.status} {sync.species_ok}/{sync.species_total}" + (f" - {sync.error}" if sync.error else ""))
            failed = failed or sync.status == "error"
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
