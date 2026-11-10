"""Contrato de los conectores."""
from dataclasses import dataclass
from datetime import date
from typing import Literal, Protocol

from app.modules.catalog.models import Species
from app.modules.connectors.http import Fetcher


@dataclass
class FetchResult:
    status: Literal["ok", "not_found"]
    external_id: str | None
    payload: dict
    license: str | None
    attribution: str | None
    source_url: str | None
    reason: str | None = None


class Connector(Protocol):
    key: str

    def fetch(self, species: Species, fetch: Fetcher, today: date) -> FetchResult:
        """Lanza FetchError si la fuente falla; not_found solo si no hay coincidencia exacta."""
        ...
