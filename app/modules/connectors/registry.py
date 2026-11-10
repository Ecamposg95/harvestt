"""Registro de fuentes de bancos de datos de plantas (fijo, en código)."""
from dataclasses import dataclass

from app.core.config import settings

STATUS_LABELS = {
    "active": "Activo",
    "requires_credentials": "Requiere credenciales",
    "in_construction": "En construcción",
    "requires_alliance": "Requiere alianza",
}


@dataclass(frozen=True)
class SourceInfo:
    key: str
    label: str
    contribution: str
    license: str
    url: str
    base_status: str


SOURCES: tuple[SourceInfo, ...] = (
    SourceInfo("gbif", "GBIF", "Presencia georreferenciada", "CC0 1.0 / CC BY 4.0 por registro",
               "https://www.gbif.org", "active"),
    SourceInfo("wfo", "World Flora Online", "Nombre aceptado y sinónimos", "CC0 1.0",
               "https://www.worldfloraonline.org", "active"),
    SourceInfo("wikidata", "Wikidata / Wikimedia Commons",
               "Nombres comunes, identificadores cruzados, imágenes",
               "CC0 1.0; imágenes con su licencia", "https://www.wikidata.org", "active"),
    SourceInfo("genesys", "Genesys", "Accesiones de germoplasma",
               "Términos de uso de Genesys (sin redistribución)", "https://www.genesys-pgr.org", "active"),
    SourceInfo("grin", "USDA GRIN", "Accesiones y evaluaciones", "Dominio público (EE. UU.)",
               "https://npgsweb.ars-grin.gov/gringlobal", "in_construction"),
    SourceInfo("cimmyt", "CIMMYT", "Germoplasma mexicano", "Por convenio",
               "https://www.cimmyt.org", "requires_alliance"),
    SourceInfo("inifap", "INIFAP / CNRG", "Germoplasma mexicano", "Por convenio",
               "https://www.gob.mx/inifap", "requires_alliance"),
)

_BY_KEY = {s.key: s for s in SOURCES}


def get_source(key: str) -> SourceInfo:
    return _BY_KEY[key]


def source_status(key: str) -> str:
    info = get_source(key)
    if key == "genesys":
        return "active" if settings.genesys_api_token else "requires_credentials"
    return info.base_status
