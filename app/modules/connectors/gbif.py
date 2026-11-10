"""Conector GBIF: presencia en México por celdas y países, solo registros CC0 / CC BY."""
import math
from collections import Counter
from datetime import date

from app.modules.catalog.models import Species
from app.modules.connectors.base import FetchResult
from app.modules.connectors.http import Fetcher

API = "https://api.gbif.org/v1/occurrence/search"
PAGE = 300
MEXICO_MAX_RECORDS = 3000
CELL_DEG = 0.5
LICENSES = ["CC0_1_0", "CC_BY_4_0"]
LICENSE_QS = "&".join(f"license={lic}" for lic in LICENSES)
LICENSE_TEXT = "CC BY 4.0 (agregado de registros CC0 1.0 y CC BY 4.0)"


def _cell(value: float) -> float:
    return math.floor(value / CELL_DEG) * CELL_DEG + CELL_DEG / 2


class GbifConnector:
    key = "gbif"

    def fetch(self, species: Species, fetch: Fetcher, today: date) -> FetchResult:
        entry = (species.external_ids or {}).get("gbif")
        usage_key = entry.get("id") if isinstance(entry, dict) else None
        if usage_key in (None, ""):
            return FetchResult("not_found", None, {}, None, None, None,
                               reason="La especie no tiene identificador de GBIF en el catálogo")
        usage_key = str(usage_key)
        base = f"{API}?taxonKey={usage_key}&hasCoordinate=true&hasGeospatialIssue=false"
        licensed = f"{base}&{LICENSE_QS}"

        total_all = fetch(f"{base}&limit=0", None)["count"]
        facets = fetch(f"{licensed}&limit=0&facet=country&facetLimit=10", None)
        total = facets["count"]
        counts = (facets.get("facets") or [{}])[0].get("counts", [])
        top = [{"country": c["name"], "count": c["count"]} for c in counts[:10]]

        cells: Counter = Counter()
        sampled = mx_total = fetched = 0
        offset = 0
        while True:
            page = fetch(f"{licensed}&country=MX&limit={PAGE}&offset={offset}", None)
            mx_total = page["count"]
            results = (page.get("results") or [])[: MEXICO_MAX_RECORDS - fetched]
            fetched += len(results)
            for r in results:
                lat, lon = r.get("decimalLatitude"), r.get("decimalLongitude")
                if lat is None or lon is None:
                    continue
                cells[(_cell(lat), _cell(lon))] += 1
                sampled += 1
            offset += PAGE
            if not results or page.get("endOfRecords") or fetched >= min(mx_total, MEXICO_MAX_RECORDS):
                break

        payload = {
            "usage_key": usage_key,
            "occurrences_total": total,
            "excluded_nc": total_all - total,
            "top_countries": top,
            "mexico": {
                "total": mx_total,
                "sampled": sampled,
                "cell_deg": CELL_DEG,
                "cells": [{"lat": la, "lon": lo, "count": n} for (la, lo), n in sorted(cells.items())],
            },
            "licenses": list(LICENSES),
        }
        return FetchResult(
            "ok",
            usage_key,
            payload,
            LICENSE_TEXT,
            f"GBIF.org, consultado el {today.isoformat()}. Ocurrencias con coordenadas y licencia CC0 o CC BY.",
            f"https://www.gbif.org/occurrence/search?taxon_key={usage_key}&country=MX",
        )
