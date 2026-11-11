"""Genera el contorno de México para el mapa de presencia de la ficha.

Descarga Natural Earth 1:50m (dominio público), toma el país con ADM0_A3 == "MEX",
redondea a 2 decimales, quita puntos consecutivos repetidos y escribe
frontend/src/features/connectors/mexico-outline.json. Necesita red; se ejecuta una
vez y el JSON se versiona.

    python scripts/connectors/build_mexico_outline.py
"""
import json
import urllib.request
from pathlib import Path

URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
OUT = Path(__file__).resolve().parents[2] / "frontend/src/features/connectors/mexico-outline.json"
BBOX = [-118.5, 14.5, -86.5, 32.8]
USER_AGENT = "HarvestT-connectors/1.0 (+https://harvestt-production.up.railway.app)"
TIMEOUT = 60


def _ring(points: list) -> list:
    out: list = []
    for lon, lat, *_ in points:
        p = [round(lon, 2), round(lat, 2)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def outline(geojson: dict) -> dict:
    feature = next(f for f in geojson["features"] if f["properties"].get("ADM0_A3") == "MEX")
    geom = feature["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    # Solo el anillo exterior de cada polígono; México no tiene huecos relevantes a esta escala.
    rings = [_ring(poly[0]) for poly in polys]
    return {
        "source": "Natural Earth 1:50m (dominio público)",
        "bbox": BBOX,
        "polygons": [r for r in rings if len(r) >= 4],
    }


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.load(resp)
    result = outline(data)
    OUT.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
    points = sum(len(r) for r in result["polygons"])
    print(f"{OUT}: {len(result['polygons'])} polígonos, {points} puntos, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
