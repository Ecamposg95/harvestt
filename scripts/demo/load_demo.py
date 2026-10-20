"""Carga los prototipos de demostración a una instancia de HarvestT por su API.

Uso:
  python -m scripts.demo.load_demo --base http://localhost:8080 --email admin@local.test \
      --password ... [--photos-dir DIR] [--replace]

Idempotente por slug: si el prototipo ya existe lo deja como está, salvo con --replace (lo borra y lo recrea).
Las fotos son opcionales; se buscan por nombre en --photos-dir (no se versionan en el repo).
La contraseña también puede venir de la variable HARVESTT_PASSWORD.
"""
import argparse
import json
import mimetypes
import os
import sys
import tempfile
import urllib.error
import urllib.request
import uuid

from scripts.demo.models import delta_grower, geodesic_greenhouse, germinator

PROTOTYPES = [
    {
        "slug": "invernadero-geodesico",
        "build": geodesic_greenhouse,
        "stl": "invernadero-geodesico.stl",
        "stl_caption": "Módulo geodésico",
        "body": {
            "name": "Invernadero Geodésico",
            "codename": "iCAN 2021",
            "purpose": "Invernadero modular y desplegable para cuidar la vida vegetal en condiciones extremas.",
            "status": "design",
            "sort_order": 0,
            "summary": "Proyecto ganador de la Gold Medal iCAN 2021 (Toronto, Canadá): un domo geodésico que protege "
            "cultivos con energías limpias y componentes diseñados para resistir cualquier ambiente.",
            "description": "# Características\n\n"
            "- Estructura de kevlar\n"
            "- Placas traslúcidas a base de matrices termoestables epoxi\n"
            "- Espectrómetro de rayos X por radiación alfa (APXS)\n"
            "- Detector de evaluación de radiación (RAD)\n"
            "- Albedo dinámico de neutrones (DAN)\n"
            "- Celdas fotovoltaicas\n"
            "- Sistema automático de irrigación\n\n"
            "Capacidad de 2.00 m³ de tierra fértil, albergando hasta 4 clases de plantas y vegetales. "
            "Modelo desplegable capaz de retraer sus componentes y reducir el espacio para su mejor manejo y traslado.",
            "specs": [
                {"label": "Reconocimiento", "value": "Gold Medal iCAN 2021"},
                {"label": "Tierra fértil", "value": "2.00", "unit": "m³"},
                {"label": "Clases de cultivo", "value": "Hasta 4"},
                {"label": "Energía", "value": "Fotovoltaica"},
                {"label": "Estructura", "value": "Kevlar"},
            ],
        },
        "photos": [("render-domos.jpg", "Render del conjunto modular"), ("lamina.jpg", "Lámina del proyecto · iCAN 2021")],
    },
    {
        "slug": "cultivador-delta",
        "build": delta_grower,
        "stl": "cultivador-delta.stl",
        "stl_caption": "Gabinete con robot delta",
        "body": {
            "name": "Cultivador Delta",
            "codename": "DELTA",
            "purpose": "Agricultura controlada de precisión con robótica delta y visión por computadora.",
            "status": "testing",
            "sort_order": 1,
            "summary": "Un gabinete vertical que automatiza y monitorea temperatura, humedad y crecimiento de la planta "
            "con inteligencia artificial y lógica difusa.",
            "description": "# Estructura y diseño\n\n"
            "Estructura vertical prismática con chasis metálico y paredes transparentes que permiten la visibilidad "
            "y el aislamiento del entorno. Un recubrimiento interno reflectante distribuye la luz.\n\n"
            "# Movimiento\n\n"
            "En la parte superior, un robot delta de tres brazos articulados posiciona con precisión un cabezal sobre el cultivo.\n\n"
            "# Automatización\n\n"
            "- Placa de procesamiento tipo Raspberry Pi\n"
            "- Cámara y sensores en el efector final para visión por computadora\n"
            "- Iluminación cenital LED para el control del fotoperiodo\n"
            "- Maceta cilíndrica con monitoreo de temperatura, humedad y crecimiento",
            "specs": [
                {"label": "Cinemática", "value": "Delta, 3 brazos"},
                {"label": "Procesamiento", "value": "Raspberry Pi"},
                {"label": "Visión", "value": "Cámara en efector"},
                {"label": "Iluminación", "value": "LED cenital"},
                {"label": "Control", "value": "IA y lógica difusa"},
            ],
        },
        "photos": [
            ("IMG_20190821_184415395.jpg", "Prototipo en invernadero"),
            ("IMG_20190822_033434404.jpg", "Iluminación LED de fotoperiodo"),
        ],
    },
    {
        "slug": "germinador-ecos",
        "build": germinator,
        "stl": "germinador-ecos.stl",
        "stl_caption": "Germinador ECOS v0",
        "body": {
            "name": "Germinador ECOS",
            "codename": "ECOS",
            "purpose": "Germinación doméstica automatizada: luz, riego y monitoreo.",
            "status": "in_construction",
            "sort_order": 2,
            "specs": [{"label": "Iluminación", "value": "LED"}, {"label": "Fotoperiodo", "value": "Configurable"}],
        },
        "photos": [],
    },
]


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/") + "/api/v1"
        self.headers: dict[str, str] = {}

    def call(self, method: str, path: str, body: dict | None = None, raw: bytes | None = None, content_type: str | None = None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = dict(self.headers)
        if data is not None:
            headers["Content-Type"] = content_type or "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                text = res.read()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as err:
            raise SystemExit(f"{method} {path} → {err.code}: {err.read()[:300]!r}") from None

    def upload(self, path: str, filename: str, content: bytes, fields: dict[str, str]):
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n"
        )
        parts.append(f"--{boundary}--\r\n".encode())
        return self.call("POST", path, raw=b"".join(parts), content_type=f"multipart/form-data; boundary={boundary}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", default=os.environ.get("HARVESTT_PASSWORD", ""))
    ap.add_argument("--photos-dir", default="")
    ap.add_argument("--replace", action="store_true")
    args = ap.parse_args()
    if not args.password:
        sys.exit("Falta --password o HARVESTT_PASSWORD")

    api = Api(args.base)
    token = api.call("POST", "/auth/login", {"email": args.email, "password": args.password})["access_token"]
    api.headers["Authorization"] = f"Bearer {token}"
    org = api.call("GET", "/auth/me")["memberships"][0]["organization"]["id"]
    api.headers["X-Organization-ID"] = org

    existing = {p["slug"]: p for p in api.call("GET", "/prototypes")}
    for spec in PROTOTYPES:
        slug = spec["slug"]
        if slug in existing:
            if not args.replace:
                print(f"= {slug} ya existe; se deja igual")
                continue
            api.call("DELETE", f"/prototypes/{existing[slug]['id']}")
        proto = api.call("POST", "/prototypes", {**spec["body"], "slug": slug, "is_public": True})
        mesh, hotspots = spec["build"]()
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, spec["stl"])
            mesh.save(path)
            with open(path, "rb") as fh:
                asset = api.upload(f"/prototypes/{proto['id']}/assets", spec["stl"], fh.read(),
                                   {"is_public": "true", "caption": spec["stl_caption"], "kind": "model_stl"})
        for i, h in enumerate(hotspots):
            api.call("POST", f"/prototypes/{proto['id']}/hotspots", {**h, "asset_id": asset["id"], "sort_order": i})
        for name, caption in spec["photos"]:
            photo = os.path.join(args.photos_dir, name) if args.photos_dir else ""
            if photo and os.path.isfile(photo):
                with open(photo, "rb") as fh:
                    api.upload(f"/prototypes/{proto['id']}/assets", name, fh.read(),
                               {"is_public": "true", "caption": caption, "kind": "image"})
            else:
                print(f"  (sin foto {name})")
        print(f"+ {slug}: {len(mesh.tris)} triángulos, {len(hotspots)} puntos")


if __name__ == "__main__":
    main()
