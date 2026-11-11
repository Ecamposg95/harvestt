"""Conector Wikidata / Wikimedia Commons: nombres comunes, identificadores cruzados e imágenes con licencia abierta."""
import html
import re
import unicodedata
from datetime import date
from urllib.parse import quote, urlencode

from app.modules.catalog.models import Species
from app.modules.connectors.base import FetchResult
from app.modules.connectors.http import Fetcher
from app.modules.connectors.wfo import _bare_name

WIKIDATA_API = "https://www.wikidata.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
LANGS = ("es", "en")
MAX_IMAGES = 3
ID_PROPS = {"gbif": "P846", "ncbi": "P685", "wfo": "P7715", "ipni": "P961"}
LICENSE_OK = re.compile(r"(CC0( 1\.0)?|Public domain|CC BY( \d\.\d)?|CC BY-SA( \d\.\d)?)")
LATIN_BINOMIAL = re.compile(r"^[A-Z][a-z]+ [a-z]+(?:-[a-z]+)?$")
TAGS = re.compile(r"<[^>]*>")
LICENSE_TEXT = "CC0 1.0 (datos); imágenes con licencia propia"


def _plain(value: str | None) -> str:
    return " ".join(html.unescape(TAGS.sub(" ", value or "")).split())


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def _claim_values(claims: dict, prop: str) -> list:
    out = []
    for c in claims.get(prop) or []:
        snak = c.get("mainsnak") or {}
        if snak.get("snaktype") == "value":
            out.append(snak["datavalue"]["value"])
    return out


def _https(url: str | None) -> str | None:
    return url if isinstance(url, str) and url.startswith("https://") else None


def _is_latin_alias(alias: str, genus: str) -> bool:
    """Los alias de Wikidata suelen ser sinónimos latinos (R13): se descartan; etiqueta y P1843 no."""
    first = alias.split(" ", 1)[0]
    return _fold(first) == _fold(genus) or bool(LATIN_BINOMIAL.match(alias))


def _common_names(entity: dict, lang: str, scientific: str) -> list[str]:
    names = []
    label = (entity.get("labels") or {}).get(lang)
    if label:
        names.append(label["value"])
    genus = scientific.split(" ", 1)[0]
    names += [
        a["value"] for a in (entity.get("aliases") or {}).get(lang) or [] if not _is_latin_alias(a["value"], genus)
    ]
    for v in _claim_values(entity.get("claims") or {}, "P1843"):
        if isinstance(v, dict) and v.get("language") == lang:
            names.append(v["text"])
    # Wikidata a veces usa el nombre científico como etiqueta: no es un nombre común.
    names = [n for n in names if _fold(n) != _fold(scientific)]
    return list(dict.fromkeys(names))


def _image(file: str, fetch: Fetcher) -> dict | None:
    params = {
        "action": "query", "titles": f"File:{file}", "prop": "imageinfo",
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": 800, "format": "json",
    }
    data = fetch(f"{COMMONS_API}?{urlencode(params, quote_via=quote)}", None) or {}
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        for info in page.get("imageinfo") or []:
            meta = info.get("extmetadata") or {}
            lic = (meta.get("LicenseShortName") or {}).get("value", "")
            artist = _plain((meta.get("Artist") or {}).get("value"))
            thumb = _https(info.get("thumburl"))
            if not LICENSE_OK.fullmatch(lic) or not thumb or not artist:
                return None
            return {
                "file": file,
                "thumb_url": thumb,
                "page_url": _https(info.get("descriptionurl")),
                "license": lic,
                "license_url": _https((meta.get("LicenseUrl") or {}).get("value")),
                "artist": artist,
            }
    return None


class WikidataConnector:
    key = "wikidata"

    def fetch(self, species: Species, fetch: Fetcher, today: date) -> FetchResult:
        entry = (species.external_ids or {}).get("gbif")
        gbif_id = entry.get("id") if isinstance(entry, dict) else None
        if gbif_id in (None, ""):
            return FetchResult("not_found", None, {}, None, None, None,
                               reason="La especie no tiene identificador de GBIF en el catálogo")
        gbif_id = str(gbif_id)
        search = urlencode({
            "action": "query", "list": "search", "srsearch": f"haswbstatement:P846={gbif_id}", "format": "json",
        })
        hits = ((fetch(f"{WIKIDATA_API}?{search}", None) or {}).get("query") or {}).get("search") or []
        if len(hits) == 0:
            return FetchResult("not_found", None, {}, None, None, None,
                               reason="Sin ítem de Wikidata con este ID de GBIF")
        if len(hits) > 1:
            return FetchResult("not_found", None, {}, None, None, None,
                               reason="Varios ítems de Wikidata con este ID de GBIF")
        qid = hits[0]["title"]

        ent = urlencode({
            "action": "wbgetentities", "ids": qid, "props": "labels|aliases|claims",
            "languages": "|".join(LANGS), "format": "json",
        })
        entity = ((fetch(f"{WIKIDATA_API}?{ent}", None) or {}).get("entities") or {}).get(qid) or {}
        claims = entity.get("claims") or {}

        ids = {}
        for key, prop in ID_PROPS.items():
            values = _claim_values(claims, prop)
            ids[key] = str(values[0]) if values else None

        images = []
        for file in _claim_values(claims, "P18")[:MAX_IMAGES]:
            img = _image(file, fetch)
            if img:
                images.append(img)

        label_es = (entity.get("labels") or {}).get("es")
        payload = {
            "qid": qid,
            "label_es": label_es["value"] if label_es else None,
            "common_names": {lang: _common_names(entity, lang, _bare_name(species)) for lang in LANGS},
            "ids": ids,
            "images": images,
        }
        return FetchResult(
            "ok",
            qid,
            payload,
            LICENSE_TEXT,
            f"Wikidata (CC0 1.0) y Wikimedia Commons, consultados el {today.isoformat()}. "
            "Cada imagen conserva autor y licencia.",
            f"https://www.wikidata.org/wiki/{qid}",
        )
