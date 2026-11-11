"""Etiquetas del estado biológico de la accesión (SAMPSTAT).

Fuente: FAO/Bioversity Multi-Crop Passport Descriptors V.2.1 (Alercia, Diulgheroff y Mackay, 2015),
descriptor «Biological status of accession» (SAMPSTAT). Códigos verificados el 2026-11-10 contra la
lista publicada por Genesys (https://www.genesys-pgr.org/descriptors/e2f86832-65f1-4204-8a81-d81f2c9307a2),
que reproduce ese descriptor; el PDF original no se pudo abrir desde el entorno.
"""

SAMPSTAT_LABELS: dict[int, str] = {
    100: "Silvestre",
    110: "Natural",
    120: "Seminatural/silvestre",
    130: "Seminatural/sembrado",
    200: "Maleza",
    300: "Variedad tradicional o criolla",
    400: "Material de mejoramiento o investigación",
    410: "Línea de mejorador",
    411: "Población sintética",
    412: "Híbrido",
    413: "Población base",
    414: "Línea endogámica",
    415: "Población segregante",
    416: "Selección clonal",
    420: "Material genético",
    421: "Mutante",
    422: "Material citogenético",
    423: "Otro material genético",
    500: "Cultivar mejorado",
    600: "OGM",
    999: "Otro",
}


def sampstat_label(code: int | None) -> str | None:
    if code is None:
        return None
    return SAMPSTAT_LABELS.get(code, f"Código MCPD {code}")
