"""Conector World Flora Online, vía la WFO Plant List publicada en ChecklistBank (dataset 2004)."""
from datetime import date
from urllib.parse import urlencode

from app.modules.catalog.models import Species
from app.modules.connectors.base import FetchResult
from app.modules.connectors.http import Fetcher

WFO_CLB_DATASET = 2004
API = f"https://api.checklistbank.org/dataset/{WFO_CLB_DATASET}"
MAX_SYNONYMS = 50
NOT_FOUND = "Sin coincidencia exacta en World Flora Online"


def _bare_name(species: Species) -> str:
    name = (species.scientific_name or "").strip()
    authorship = (species.authorship or "").strip()
    if authorship and name.endswith(authorship):
        name = name[: -len(authorship)].strip()
    return name


class WfoConnector:
    key = "wfo"

    def fetch(self, species: Species, fetch: Fetcher, today: date) -> FetchResult:
        params = {"q": _bare_name(species)}
        if species.authorship:
            params["authorship"] = species.authorship.strip()
        match = fetch(f"{API}/match/nameusage?{urlencode(params)}", None) or {}
        usage = match.get("usage") or {}
        if match.get("type") != "exact" or usage.get("status") != "accepted" or not usage.get("id"):
            return FetchResult("not_found", None, {}, None, None, None, reason=NOT_FOUND)
        wfo_id = usage["id"]

        syn = fetch(f"{API}/taxon/{wfo_id}/synonyms", None) or {}
        synonyms = []
        for group in ("homotypic", "heterotypic"):
            for item in syn.get(group) or []:
                name = item.get("name") or {}
                synonyms.append({"name": name.get("scientificName"), "authorship": name.get("authorship")})
        release = (fetch(API, None) or {}).get("title")

        payload = {
            "wfo_id": wfo_id,
            "name": usage.get("name"),
            "authorship": usage.get("authorship"),
            "status": "accepted",
            "synonyms": synonyms[:MAX_SYNONYMS],
            "release": release,
        }
        return FetchResult(
            "ok",
            wfo_id,
            payload,
            "CC0 1.0",
            f"World Flora Online Plant List ({release}), vía ChecklistBank.",
            f"https://www.worldfloraonline.org/taxon/{wfo_id}",
        )
