# Fixtures de conectores

Respuestas de las fuentes usadas por pruebas sin red. Ningún test toca internet.

## gbif/ (grabadas el 2026-11-10, tomate `taxonKey=2930137`, API `occurrence/search`)

Reales (recortadas a los campos que usa el conector):
- `count_all.json`: `limit=0`, con coordenadas y sin filtro de licencia (solo `offset`, `limit`, `endOfRecords`, `count`).
- `count_licensed_facets.json`: `limit=0`, filtro `CC0_1_0`/`CC_BY_4_0`, `facet=country&facetLimit=10` (campos de cabecera más `facets`).
- `mx_page_0.json`: `country=MX`, `limit=300`, `offset=0`; cada resultado conserva solo `decimalLatitude`, `decimalLongitude` y `license`; se conservan `count` y `endOfRecords`.

Sintéticas (derivadas de `mx_page_0.json`):
- `mx_page_0_small.json` y `mx_page_1_small.json`: los primeros 4 y los 2 siguientes registros reales, con `count: 6` y `endOfRecords` coherente, para probar la paginación con pocas filas.
