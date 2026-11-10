# Fixtures de conectores

Respuestas de las fuentes usadas por pruebas sin red. Ningún test toca internet.

## gbif/ (grabadas el 2026-11-10, tomate `taxonKey=2930137`, API `occurrence/search`)

Reales (recortadas a los campos que usa el conector):
- `count_all.json`: `limit=0`, con coordenadas y sin filtro de licencia (solo `offset`, `limit`, `endOfRecords`, `count`).
- `count_licensed_facets.json`: `limit=0`, filtro `CC0_1_0`/`CC_BY_4_0`, `facet=country&facetLimit=10` (campos de cabecera más `facets`).
- `mx_page_0.json`: `country=MX`, `limit=300`, `offset=0`; cada resultado conserva solo `decimalLatitude`, `decimalLongitude` y `license`; se conservan `count` y `endOfRecords`.

Sintéticas (derivadas de `mx_page_0.json`):
- `mx_page_0_small.json` y `mx_page_1_small.json`: los primeros 4 y los 2 siguientes registros reales, con `count: 6` y `endOfRecords` coherente, para probar la paginación con pocas filas.

## wfo/ (grabadas el 2026-11-10 desde `api.checklistbank.org`, dataset 2004, *Lactuca sativa* L.)

Reales (recortadas a los campos que usa el conector):
- `match_lactuca.json`: `match/nameusage?q=Lactuca sativa&authorship=L.` (`type: "exact"`; `usage` reducido a `id`, `name`, `authorship`, `rank`, `status`).
- `synonyms_wfo-0000128816.json`: `taxon/wfo-0000128816/synonyms` (1 homotípico y 27 heterotípicos; cada uno reducido a `id`, `name.scientificName`, `name.authorship`, `status`).
- `dataset_2004.json`: `dataset/2004` recortado a `title`, `license` y `version`.

Sintética:
- `match_fuzzy.json`: copia de `match_lactuca.json` con `type: "variant"`.

## wikidata/ (grabadas el 2026-11-10; lechuga, GBIF 7403263, `Q83193`)

Reales (recortadas):
- `search_P846_7403263.json`: `list=search&srsearch=haswbstatement:P846=7403263`; la lista de resultados se redujo a `ns`, `title` y `pageid` (sin `snippet`).
- `entity_Q83193.json`: `wbgetentities` con `labels|aliases|claims`, `languages=es|en`; solo etiquetas y alias `es`/`en` y las *claims* P846, P685, P7715, P961, P18 y P1843. Cada *claim* conserva `mainsnak`, `type` y `rank` (sin referencias). P18 conserva solo la primera declaración (`Iceberg lettuce in SB.jpg`); P1843 conserva todos los idiomas.
- `commons_Iceberg_lettuce_in_SB.json`: `imageinfo` de Commons; solo `thumburl`, `thumbwidth`, `thumbheight`, `descriptionurl` y, de `extmetadata`, `Artist` (HTML real), `LicenseShortName` (`CC BY 1.0`), `LicenseUrl`, `AttributionRequired` y `UsageTerms`.

Sintéticas:
- `search_two_hits.json`: copia de la búsqueda real con `totalhits: 2` y un segundo resultado inventado (`Q99999999`).
- `commons_nc.json`: copia de la respuesta real de Commons con `LicenseShortName: "CC BY-NC 2.0"`.

## genesys/ (TODAS SINTÉTICAS)

Genesys exige token y no hay API alcanzable sin credenciales, así que ninguna respuesta es real. Se construyeron solo con los campos documentados del `AccessionDTO` (`instituteCode`, `accessionNumber`, `doi`, `origCty`, `sampStat`, `taxonomy.genus`, `taxonomy.species`) y el sobre paginado (`content`, `totalElements`, `number`, `size`, `last`). Los códigos de instituto, números y DOI son inventados.
- `acn_filter_page_0.json` y `acn_filter_page_1.json`: lechuga, 5 accesiones en dos páginas (`totalElements: 5`).
- `acn_filter_wrong_genus.json`: un registro de otro género (*Solanum lycopersicum*), para probar que un filtro no aplicado falla.
