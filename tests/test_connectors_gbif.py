import json
import math
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from app.modules.catalog.models import Species
from app.modules.connectors import gbif
from app.modules.connectors.gbif import GbifConnector
from app.modules.connectors.http import FetchError

FIX = Path(__file__).parent / "fixtures" / "connectors" / "gbif"


def load(name):
    return json.loads((FIX / name).read_text())


class FakeFetcher:
    def __init__(self, mx_pages, fail_offset=None):
        self.urls = []
        self.mx_pages = mx_pages
        self.fail_offset = fail_offset

    def __call__(self, url, body=None):
        self.urls.append(url)
        q = parse_qs(urlparse(url).query)
        if q.get("country") == ["MX"]:
            offset = int(q["offset"][0])
            if offset == self.fail_offset:
                raise FetchError("La fuente respondió HTTP 503")
            return self.mx_pages[offset]
        if "license" in q:
            return load("count_licensed_facets.json")
        return load("count_all.json")


def small_pages():
    return {0: load("mx_page_0_small.json"), 300: load("mx_page_1_small.json")}


def species(ids=None):
    return Species(scientific_name="Solanum lycopersicum", external_ids=ids)


TOMATO = {"gbif": {"id": 2930137}}


def test_gbif_aggregates_cells_and_countries():
    res = GbifConnector().fetch(species(TOMATO), FakeFetcher(small_pages()), date(2026, 11, 10))
    assert res.status == "ok"
    assert res.external_id == "2930137"
    p = res.payload
    assert p["usage_key"] == "2930137"
    assert p["occurrences_total"] == 33655
    assert p["excluded_nc"] == 59550 - 33655
    assert p["top_countries"][0] == {"country": "ES", "count": 6616}
    assert len(p["top_countries"]) <= 10
    mx = p["mexico"]
    assert (mx["total"], mx["sampled"], mx["cell_deg"]) == (6, 6, 0.5)
    assert sum(c["count"] for c in mx["cells"]) == mx["sampled"]
    for c in mx["cells"]:
        assert (c["lat"] - 0.25) % 0.5 == 0 and (c["lon"] - 0.25) % 0.5 == 0
    first = load("mx_page_0_small.json")["results"][0]
    center = (math.floor(first["decimalLatitude"] / 0.5) * 0.5 + 0.25, math.floor(first["decimalLongitude"] / 0.5) * 0.5 + 0.25)
    assert any((c["lat"], c["lon"]) == center for c in mx["cells"])
    assert p["licenses"] == ["CC0_1_0", "CC_BY_4_0"]
    assert res.license == "CC BY 4.0 (agregado de registros CC0 1.0 y CC BY 4.0)"
    assert res.attribution == "GBIF.org, consultado el 2026-11-10. Ocurrencias con coordenadas y licencia CC0 o CC BY."
    assert res.source_url == "https://www.gbif.org/occurrence/search?taxon_key=2930137&country=MX"


def test_gbif_sample_when_over_cap(monkeypatch):
    monkeypatch.setattr(gbif, "MEXICO_MAX_RECORDS", 4)
    fetch = FakeFetcher(small_pages())
    res = GbifConnector().fetch(species(TOMATO), fetch, date(2026, 11, 10))
    mx = res.payload["mexico"]
    assert mx["total"] == 6 and mx["sampled"] == 4 < mx["total"]
    assert sum(c["count"] for c in mx["cells"]) == 4
    assert sum("country=MX" in u for u in fetch.urls) == 1


def test_gbif_cap_is_exact_when_not_multiple_of_page(monkeypatch):
    monkeypatch.setattr(gbif, "MEXICO_MAX_RECORDS", 5)
    res = GbifConnector().fetch(species(TOMATO), FakeFetcher(small_pages()), date(2026, 11, 10))
    mx = res.payload["mexico"]
    assert mx["sampled"] == gbif.MEXICO_MAX_RECORDS == 5
    assert sum(c["count"] for c in mx["cells"]) == 5


def test_gbif_page_failure_does_not_store_partial_cells():
    fetch = FakeFetcher(small_pages(), fail_offset=300)
    with pytest.raises(FetchError):
        GbifConnector().fetch(species(TOMATO), fetch, date(2026, 11, 10))


def test_gbif_without_usage_key_is_not_found():
    for ids in (None, {}, {"gbif": {}}):
        fetch = FakeFetcher(small_pages())
        res = GbifConnector().fetch(species(ids), fetch, date(2026, 11, 10))
        assert res.status == "not_found"
        assert res.reason == "La especie no tiene identificador de GBIF en el catálogo"
        assert res.payload == {} and fetch.urls == []


def test_gbif_url_filters_licenses():
    fetch = FakeFetcher(small_pages())
    GbifConnector().fetch(species(TOMATO), fetch, date(2026, 11, 10))
    assert fetch.urls
    for u in fetch.urls:
        assert "hasCoordinate=true" in u and "hasGeospatialIssue=false" in u and "taxonKey=2930137" in u
    licensed = [u for u in fetch.urls if "license=" in u]
    assert licensed and all("license=CC0_1_0&license=CC_BY_4_0" in u for u in licensed)
    assert any("license=" not in u for u in fetch.urls)
    assert all("license=" in u for u in fetch.urls if "country=MX" in u)
    assert all("limit=300" in u for u in fetch.urls if "country=MX" in u)


def test_gbif_registered_in_sync():
    from app.modules.connectors.sync import CONNECTORS

    assert isinstance(CONNECTORS["gbif"], GbifConnector)
