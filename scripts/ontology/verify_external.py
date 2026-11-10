"""Verifica cada concepto de `external_concepts.json` contra su fuente oficial. Necesita red.

Uso: python -m scripts.ontology.verify_external

Imprime una línea por concepto con `OK`, `FALTA` (no existe, obsoleto o la fuente no respondió) o
`DISTINTO` (existe con otra etiqueta). Termina con código 1 si alguno no es `OK`.

BBCH no tiene servicio consultable: se comprueba que el DOI de la monografía (Meier 2018) resuelve y
el código con su etiqueta se verificó a mano contra la página indicada en `verified_via`.
"""
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import cache
from pathlib import Path

from app.modules.ontology.text import normalize_label

CONCEPTS_FILE = Path(__file__).resolve().parents[2] / "app" / "modules" / "ontology" / "data" / "external_concepts.json"
USER_AGENT = "HarvestT-ontology-verifier/1.0 (+https://harvestt-production.up.railway.app)"
TIMEOUT = 60

OLS_ONTOLOGY = {"po": "po", "peco": "peco", "envo": "envo"}
RDF_DOCUMENTS = {
    "sosa": "https://www.w3.org/ns/sosa/",
    "ssn": "https://www.w3.org/ns/ssn/",
    "geosparql": "http://www.opengis.net/ont/geosparql",
}
BBCH_DOI = "10.5073/20180906-074619"
UCUM_SPEC = "https://ucum.org/ucum"


class Missing(Exception):
    """El identificador no existe en la fuente (o la fuente no respondió)."""


def _get(url: str, accept: str = "application/json") -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise Missing(f"HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise Missing(f"sin respuesta: {exc}") from None


def _json(url: str) -> dict:
    return json.loads(_get(url))


def ncbi_label(external_id: str) -> list[str]:
    time.sleep(0.4)  # NCBI admite 3 solicitudes por segundo sin clave
    data = _json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=taxonomy&retmode=json&id="
        + urllib.parse.quote(external_id)
    )
    doc = data.get("result", {}).get(external_id, {})
    if not doc.get("scientificname") or doc.get("error"):
        raise Missing(doc.get("error", "sin resultado"))
    return [doc["scientificname"]]


def ols_label(scheme: str, external_id: str) -> list[str]:
    data = _json(
        f"https://www.ebi.ac.uk/ols4/api/ontologies/{OLS_ONTOLOGY[scheme]}/terms?obo_id="
        + urllib.parse.quote(external_id)
    )
    terms = [t for t in data.get("_embedded", {}).get("terms", []) if t.get("obo_id") == external_id]
    if not terms:
        raise Missing("sin resultado")
    if all(t.get("is_obsolete") for t in terms):
        raise Missing("obsoleto")
    return [t["label"] for t in terms if not t.get("is_obsolete")]


def agrovoc_label(external_id: str) -> list[str]:
    uri = f"http://aims.fao.org/aos/agrovoc/{external_id}"
    data = _json(
        "https://agrovoc.fao.org/browse/rest/v1/agrovoc/label?lang=en&uri=" + urllib.parse.quote(uri, safe=":/")
    )
    if not data.get("prefLabel"):
        raise Missing("sin prefLabel")
    return [data["prefLabel"]]


@cache
def _rdf_document(url: str) -> str:
    return _get(url, accept="text/turtle")


def rdf_labels(scheme: str, iri: str) -> list[str]:
    """Busca la IRI como sujeto en el documento Turtle de la ontología y devuelve sus etiquetas en inglés."""
    doc = _rdf_document(RDF_DOCUMENTS[scheme])
    tokens = [f"<{iri}>"]
    for prefix, namespace in re.findall(r"@prefix\s+([\w-]*):\s*<([^>]+)>", doc):
        if iri.startswith(namespace) and re.fullmatch(r"[\w-]+", iri[len(namespace):]):
            tokens.append(f"{prefix}:{iri[len(namespace):]}")
    labels, found = [], False
    for token in tokens:
        # Enunciado con la IRI como sujeto: desde el inicio de línea hasta el primer « .» de fin de línea.
        for match in re.finditer(rf"^[ \t]*{re.escape(token)}\s.*?\s\.[ \t]*$", doc, re.MULTILINE | re.DOTALL):
            found = True
            labels += re.findall(r'(?:rdfs:label|skos:prefLabel|prez:label)\s+"([^"]+)"@en', match.group(0))
    if not found:
        raise Missing("IRI ausente del documento")
    return labels


@cache
def _ucum_rows() -> list[list[str]]:
    page = _get(UCUM_SPEC, accept="text/html")
    rows = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.DOTALL):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.DOTALL)
        rows.append([html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in cells])
    return rows


def ucum_labels(code: str) -> list[str]:
    """Nombres de las filas de la tabla de unidades de UCUM cuyo código c/s es `code`."""
    names = [cells[0] for cells in _ucum_rows() if len(cells) > 3 and code in cells[1:5]]
    if not names:
        raise Missing("código ausente de la especificación")
    return names


def bbch_label(concept: dict) -> list[str]:
    data = _json(f"https://doi.org/api/handles/{BBCH_DOI}")
    if data.get("responseCode") != 1:
        raise Missing("el DOI de la monografía no resuelve")
    if "manual" not in concept.get("verified_via", "").lower():
        raise Missing("falta la anotación de verificación manual")
    return [concept["label"]]


def source_labels(concept: dict) -> list[str]:
    scheme, external_id = concept["scheme"], concept["external_id"]
    if scheme == "ncbi_taxon":
        return ncbi_label(external_id)
    if scheme in OLS_ONTOLOGY:
        return ols_label(scheme, external_id)
    if scheme == "agrovoc":
        return agrovoc_label(external_id)
    if scheme in RDF_DOCUMENTS:
        return rdf_labels(scheme, external_id)
    if scheme == "ucum":
        return ucum_labels(external_id)
    if scheme == "bbch":
        return bbch_label(concept)
    raise Missing(f"sin verificador para el esquema {scheme}")


def verify(concept: dict) -> tuple[str, str]:
    try:
        labels = source_labels(concept)
    except Missing as exc:
        return "FALTA", str(exc)
    if normalize_label(concept["label"]) in {normalize_label(label) for label in labels}:
        return "OK", ""
    return "DISTINTO", f"la fuente dice: {' | '.join(labels) or '(sin etiqueta)'}"


def main() -> int:
    concepts = json.loads(CONCEPTS_FILE.read_text(encoding="utf-8"))
    failures = 0
    for concept in concepts:
        status, detail = verify(concept)
        failures += status != "OK"
        line = f"{status:<8} {concept['scheme']:<10} {concept['external_id']:<45} {concept['label']}"
        print(f"{line}  ({detail})" if detail else line, flush=True)
    print(f"\n{len(concepts) - failures}/{len(concepts)} OK")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
