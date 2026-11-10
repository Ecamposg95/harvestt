import copy
import json
from datetime import date
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from app.modules.catalog.models import Species
from app.modules.connectors import wfo, wikidata
from app.modules.connectors.http import FetchError
from app.modules.connectors.sync import CONNECTORS, MIN_INTERVALS
from app.modules.connectors.wfo import WfoConnector
from app.modules.connectors.wikidata import WikidataConnector

FIX = Path(__file__).parent / "fixtures" / "connectors"
TODAY = date(2026, 11, 10)


def load(path):
    return json.loads((FIX / path).read_text())


def lettuce(ids=None):
    ids = {"gbif": {"id": "7403263"}} if ids is None else ids
    return Species(scientific_name="Lactuca sativa L.", authorship="L.", external_ids=ids)


class WfoFetcher:
    def __init__(self, match="wfo/match_lactuca.json", fail_on=None):
        self.urls = []
        self.match = match
        self.fail_on = fail_on

    def __call__(self, url, body=None):
        self.urls.append(url)
        if self.fail_on and self.fail_on in url:
            raise FetchError("La fuente respondió HTTP 503")
        if "/match/nameusage" in url:
            return load(self.match)
        if url.endswith("/synonyms"):
            return load("wfo/synonyms_wfo-0000128816.json")
        if url.endswith("/dataset/2004"):
            return load("wfo/dataset_2004.json")
        raise AssertionError(url)


class WikidataFetcher:
    def __init__(self, search="wikidata/search_P846_7403263.json", commons=None):
        self.urls = []
        self.search = search
        self.commons = commons or load("wikidata/commons_Iceberg_lettuce_in_SB.json")

    def __call__(self, url, body=None):
        self.urls.append(url)
        q = parse_qs(urlparse(url).query)
        host = urlparse(url).netloc
        if host == "commons.wikimedia.org":
            assert q["titles"] == ["File:Iceberg lettuce in SB.jpg"]
            return self.commons
        if q.get("list") == ["search"]:
            return load(self.search)
        if q.get("action") == ["wbgetentities"]:
            return load("wikidata/entity_Q83193.json")
        raise AssertionError(url)


def test_wfo_exact_accepted_with_synonyms():
    fetch = WfoFetcher()
    res = WfoConnector().fetch(lettuce(), fetch, TODAY)
    assert res.status == "ok"
    p = res.payload
    assert p["wfo_id"] == "wfo-0000128816"
    assert p["name"] == "Lactuca sativa" and p["authorship"] == "L."
    assert p["status"] == "accepted"
    assert p["release"] == "World Flora Online Plant List 2026-06"
    assert 0 < len(p["synonyms"]) <= 50
    assert p["synonyms"][0]["name"] == "Lactuca scariola var. sativa"  # homotípico primero
    assert p["synonyms"][0]["authorship"] == "(L.) Moris"
    assert res.external_id == "wfo-0000128816"
    assert res.license == "CC0 1.0"
    assert res.attribution == "World Flora Online Plant List (World Flora Online Plant List 2026-06), vía ChecklistBank."
    assert res.source_url == "https://www.worldfloraonline.org/taxon/wfo-0000128816"
    match_url = next(u for u in fetch.urls if "/match/nameusage" in u)
    q = parse_qs(urlparse(match_url).query)
    assert q["q"] == ["Lactuca sativa"] and q["authorship"] == ["L."]
    assert any(u.endswith("/dataset/2004") for u in fetch.urls)


def test_wfo_synonyms_capped_at_50():
    big = load("wfo/synonyms_wfo-0000128816.json")
    big["heterotypic"] = big["heterotypic"] * 3
    assert len(big["homotypic"]) + len(big["heterotypic"]) > 50

    class Big(WfoFetcher):
        def __call__(self, url, body=None):
            if url.endswith("/synonyms"):
                return big
            return super().__call__(url, body)

    res = WfoConnector().fetch(lettuce(), Big(), TODAY)
    assert len(res.payload["synonyms"]) == 50


def test_wfo_fuzzy_match_is_not_found():
    res = WfoConnector().fetch(lettuce(), WfoFetcher(match="wfo/match_fuzzy.json"), TODAY)
    assert res.status == "not_found"
    assert res.reason == "Sin coincidencia exacta en World Flora Online"
    assert res.payload == {}


def test_wfo_not_accepted_or_empty_is_not_found():
    syn = load("wfo/match_lactuca.json")
    syn["usage"]["status"] = "synonym"
    empty = {"type": "none"}

    for body in (syn, empty):
        class F(WfoFetcher):
            def __call__(self, url, b=None):
                if "/match/nameusage" in url:
                    return body
                return super().__call__(url, b)

        res = WfoConnector().fetch(lettuce(), F(), TODAY)
        assert res.status == "not_found" and res.payload == {}


def test_wfo_failure_raises_and_name_without_authorship():
    with pytest.raises(FetchError):
        WfoConnector().fetch(lettuce(), WfoFetcher(fail_on="/synonyms"), TODAY)
    fetch = WfoFetcher()
    sp = Species(scientific_name="Lactuca sativa", authorship=None, external_ids=None)
    WfoConnector().fetch(sp, fetch, TODAY)
    match_url = next(u for u in fetch.urls if "/match/nameusage" in u)
    assert "authorship" not in parse_qs(urlparse(match_url).query)


def test_wikidata_ids_names_and_images():
    fetch = WikidataFetcher()
    res = WikidataConnector().fetch(lettuce(), fetch, TODAY)
    assert res.status == "ok"
    p = res.payload
    assert p["qid"] == "Q83193"
    assert p["label_es"] == "lechuga"
    assert p["ids"]["ncbi"] == "4236"
    assert p["ids"]["wfo"] == "wfo-0000128816"
    assert p["ids"]["gbif"] == "7403263"
    assert p["ids"]["ipni"] == "228239-1"
    assert "lechuga" in p["common_names"]["es"]
    assert "lettuce" in p["common_names"]["en"]
    for names in p["common_names"].values():
        assert len(names) == len(set(names))
    assert p["common_names"]["es"][0] == "lechuga"
    img = p["images"][0]
    assert img["license"] == "CC BY 1.0"
    assert img["artist"] == "en:User:Geographer"
    assert img["file"] == "Iceberg lettuce in SB.jpg"
    assert img["thumb_url"].startswith("https://thumb.wikimedia.org/")
    assert img["page_url"] == "https://commons.wikimedia.org/wiki/File:Iceberg_lettuce_in_SB.jpg"
    assert img["license_url"] == "https://creativecommons.org/licenses/by/1.0"
    assert len(p["images"]) <= 3
    assert res.external_id == "Q83193"
    assert res.license == "CC0 1.0 (datos); imágenes con licencia propia"
    assert res.source_url == "https://www.wikidata.org/wiki/Q83193"
    assert "2026-11-10" in res.attribution
    assert "haswbstatement:P846=7403263" in unquote(fetch.urls[0])


def test_wikidata_without_gbif_is_not_found():
    for ids in (None, {}, {"gbif": {}}):
        fetch = WikidataFetcher()
        sp = lettuce(ids) if ids is not None else Species(scientific_name="x", external_ids=None)
        res = WikidataConnector().fetch(sp, fetch, TODAY)
        assert res.status == "not_found" and res.reason and res.payload == {}
        assert fetch.urls == []


def test_wikidata_two_items_is_ambiguous():
    res = WikidataConnector().fetch(lettuce(), WikidataFetcher(search="wikidata/search_two_hits.json"), TODAY)
    assert res.status == "not_found"
    assert res.reason == "Varios ítems de Wikidata con este ID de GBIF"
    assert res.payload == {}


def test_wikidata_zero_items_is_not_found():
    class Empty(WikidataFetcher):
        def __call__(self, url, body=None):
            if "list=search" in url:
                return {"query": {"searchinfo": {"totalhits": 0}, "search": []}}
            return super().__call__(url, body)

    res = WikidataConnector().fetch(lettuce(), Empty(), TODAY)
    assert res.status == "not_found"
    assert res.reason == "Sin ítem de Wikidata con este ID de GBIF"


def _with_info(**changes):
    doc = load("wikidata/commons_Iceberg_lettuce_in_SB.json")
    info = next(iter(doc["query"]["pages"].values()))["imageinfo"][0]
    for k, v in changes.items():
        if k in ("Artist", "LicenseShortName"):
            info["extmetadata"][k] = {"value": v}
        elif v is None:
            info.pop(k, None)
        else:
            info[k] = v
    return doc


def test_commons_rejects_nc_and_strips_html():
    res = WikidataConnector().fetch(lettuce(), WikidataFetcher(commons=load("wikidata/commons_nc.json")), TODAY)
    assert res.status == "ok" and res.payload["images"] == []

    html = '<a href="https://x.org/?a=1&amp;b=2">Ana &amp; Luis</a><br/> <b>Pérez</b> &#169;'
    res = WikidataConnector().fetch(lettuce(), WikidataFetcher(commons=_with_info(Artist=html)), TODAY)
    artist = res.payload["images"][0]["artist"]
    assert artist == "Ana & Luis Pérez ©"
    assert "<" not in artist and "&amp;" not in artist

    for bad in (_with_info(Artist="<span> </span>"), _with_info(thumburl=None), _with_info(LicenseShortName="All rights reserved")):
        res = WikidataConnector().fetch(lettuce(), WikidataFetcher(commons=bad), TODAY)
        assert res.payload["images"] == []


@pytest.mark.parametrize(
    "name",
    ["CC0", "CC0 1.0", "Public domain", "CC BY 4.0", "CC BY", "CC BY-SA 3.0", "CC BY-SA 2.5"],
)
def test_commons_license_whitelist_accepts(name):
    res = WikidataConnector().fetch(lettuce(), WikidataFetcher(commons=_with_info(LicenseShortName=name)), TODAY)
    assert len(res.payload["images"]) == 1


@pytest.mark.parametrize("name", ["CC BY-NC 2.0", "CC BY-ND 4.0", "CC BY-NC-SA 3.0", "GFDL", "Fair use", "CC BY 4.0 extra"])
def test_commons_license_whitelist_rejects(name):
    res = WikidataConnector().fetch(lettuce(), WikidataFetcher(commons=_with_info(LicenseShortName=name)), TODAY)
    assert res.payload["images"] == []


def test_registered_and_pacing_in_sync_only():
    assert isinstance(CONNECTORS["wfo"], WfoConnector)
    assert isinstance(CONNECTORS["wikidata"], WikidataConnector)
    assert MIN_INTERVALS["wfo"] == 0.5 and MIN_INTERVALS["wikidata"] == 1.0
    assert not hasattr(wfo, "MIN_INTERVAL") and not hasattr(wikidata, "MIN_INTERVAL")
