"""Conector Genesys: solo conteos en la copia local; la lista de accesiones se consulta en vivo.

Los términos de Genesys permiten usar los datos pero prohíben redistribuirlos: nunca se guardan accesiones.
"""
from collections import Counter
from datetime import date

from pydantic import BaseModel

from app.modules.catalog.models import Species
from app.modules.connectors.base import FetchResult
from app.modules.connectors.http import FetchError, Fetcher

API = "https://api.genesys-pgr.org/api/v2/acn/filter"
PAGE_SIZE = 1000
MAX_RECORDS = 5000
OVERVIEW_URL = "https://www.genesys-pgr.org/a/overview"
LICENSE = "Términos de uso de Genesys"
FILTER_ERROR = "El filtro taxonómico de Genesys no se aplicó; revisar filter_body"


class AccessionOut(BaseModel):
    institute_code: str
    accession_number: str
    doi: str | None = None
    origin_country: str | None = None
    sampstat: int | None = None
    url: str


def filter_body(genus: str, species: str) -> dict:
    # NO VERIFICADO: la documentación v2 no publica el nombre del filtro taxonómico. Confirmar en la primera corrida con token.
    return {"taxonomy.genus": [genus], "taxonomy.species": [species]}


def accession_url(doi: str | None) -> str:
    return f"https://doi.org/{doi}" if doi else OVERVIEW_URL


def _genus_species(species: Species) -> tuple[str, str]:
    name = (species.scientific_name or "").strip()
    authorship = (species.authorship or "").strip()
    if authorship and name.endswith(authorship):
        name = name[: -len(authorship)].strip()
    parts = name.split()
    if len(parts) < 2:
        raise FetchError("El nombre científico no tiene género y especie")
    return parts[0], parts[1]


def _pages(species: Species, fetch: Fetcher, max_records: int):
    """Genera (total, registros validados) página a página hasta `last`, `totalElements` o el tope."""
    genus, sp = _genus_species(species)
    body = filter_body(genus, sp)
    seen = 0
    page = 0
    while True:
        data = fetch(f"{API}?p={page}&l={PAGE_SIZE}", body)
        if not isinstance(data, dict) or not isinstance(data.get("content"), list):
            raise FetchError("Genesys devolvió una respuesta inesperada")
        total = int(data.get("totalElements") or 0)
        content = data["content"]
        for rec in content:
            tax = (rec or {}).get("taxonomy") or {}
            if tax.get("genus") != genus or tax.get("species") != sp:
                raise FetchError(FILTER_ERROR)
        seen += len(content)
        yield total, content
        if data.get("last") or not content or seen >= min(total, max_records):
            return
        page += 1


def list_accessions_live(species: Species, fetch: Fetcher, limit: int = 50) -> list[AccessionOut]:
    out: list[AccessionOut] = []
    for _, content in _pages(species, fetch, limit):
        for rec in content:
            doi = rec.get("doi") or None
            out.append(AccessionOut(
                institute_code=rec.get("instituteCode") or "",
                accession_number=rec.get("accessionNumber") or "",
                doi=doi,
                origin_country=rec.get("origCty") or None,
                sampstat=rec.get("sampStat"),
                url=accession_url(doi),
            ))
            if len(out) >= limit:
                return out
    return out


def _ranked(counter: Counter, key: str) -> list[dict]:
    items = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0] is None, str(kv[0])))
    return [{key: k, "count": n} for k, n in items]


class GenesysConnector:
    key = "genesys"

    def fetch(self, species: Species, fetch: Fetcher, today: date) -> FetchResult:
        countries: Counter = Counter()
        sampstats: Counter = Counter()
        total = sampled = 0
        for total, content in _pages(species, fetch, MAX_RECORDS):
            for rec in content:
                if sampled >= MAX_RECORDS:
                    break
                countries[rec.get("origCty") or None] += 1
                sampstats[rec.get("sampStat")] += 1
                sampled += 1
        payload = {
            "total": total,
            "by_country": _ranked(countries, "country"),
            "by_sampstat": _ranked(sampstats, "code"),
            "sampled": sampled,
        }
        return FetchResult(
            "ok", None, payload, LICENSE,
            f"Datos consultados en Genesys (https://www.genesys-pgr.org), {today.isoformat()}.",
            OVERVIEW_URL,
        )
