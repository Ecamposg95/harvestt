# Hito visual V2 — Hotspots en prototipos STL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un editor marque puntos sobre el modelo STL de un prototipo y que la página pública los muestre como callouts que siguen la rotación, se atenúan cuando quedan detrás del modelo y en móvil se reducen a números con leyenda.

**Architecture:** backend: tabla `prototype_hotspots` (migración `0004`) en el módulo `prototypes`, CRUD interno auditado con límite de 12 por prototipo, y `hotspots` del STL principal en el detalle público. Frontend: helpers puros de three en `features/three/` (colocar el modelo y proyectar puntos 3D a pantalla con oclusión), `StlViewer` que pinta `Callout` encima del canvas y permite "picar" la malla, un editor en el admin y la leyenda en la página pública.

**Tech Stack:** FastAPI 0.127, SQLAlchemy 2 (sync), Alembic, pytest; React 18.3.1, TS 5.6, three 0.170.0 (chunk perezoso), vitest 2.1.9 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-19-hito-visual-design.md` (sección 4, y 3.2 para `Callout`/`useProjectedCallouts`).

**Rama:** `feat/hito-v2-hotspots`, creada desde `fix/hito-v1-pulido` (ese commit reescribe `StlViewer.tsx`; partir de `main` sin él provocaría conflictos). Si `fix/hito-v1-pulido` ya está en `main`, crear desde `main`.

## Global Constraints

- Sin dependencias nuevas (frontend ni backend).
- three solo dentro del chunk perezoso: nada importado por `App.tsx` o las páginas puede importar `three` directa o indirectamente. Los tipos compartidos con las páginas viven en `features/three/types.ts`, que no importa `three`.
- Coordenadas de hotspot = coordenadas crudas del archivo STL (antes de girar a Y-arriba y centrar). Conversión solo con `toWorld`/`toModel` de `features/three/model.ts`.
- Máximo 12 hotspots activos por prototipo (todos sus STL juntos) → 422 con `code: "hotspot_limit"`.
- `label` 1–60 caracteres sin espacios sobrantes; `description` ≤ 500; `x, y, z` finitos en [−1e9, 1e9].
- Lectura de hotspots internos: rol `viewer`; escritura: `editor`. Toda escritura pasa por `record()` con `resource_type="prototype_hotspot"`.
- Respuesta pública: solo `label, description, x, y, z, sort_order` del STL principal (el primer STL público por `sort_order`, `created_at`). Ni `id`, ni `asset_id`, ni autor, ni `organization_id`.
- Borrado lógico (`deleted_at`) en todo; borrar un STL o un prototipo borra lógicamente sus hotspots.
- Copias de UI en español; Tailwind: `text-accent` para texto verde, `bg-lime` solo relleno, opacidades en múltiplos de 5.
- Comandos: backend `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings`; frontend (en `frontend/`) `npx tsc -b`, `npx vitest run`, `npm run build`.

## Review Focus

1. **Modelo girado o con origen lejano:** un STL cuyo origen está a cientos de mm del centro debe mostrar el punto donde se hizo clic, en las dos vistas (admin y pública). Lo cubre la prueba de ida y vuelta de `placeModel`/`toWorld`/`toModel` con una caja desplazada (Task 3).
2. **Rotación automática continua:** la cámara cambia en cada frame; la oclusión por raycast no puede correr 60 veces por segundo sobre mallas grandes. La prueba de `CalloutProjector` fija que la oclusión se recalcula como máximo cada 200 ms y que se pone al día cuando la cámara se detiene (Task 3).
3. **Arrastrar para girar no es un clic:** en modo "Agregar punto", soltar tras arrastrar más de 5 px no debe crear un punto. Lo cubre `isClick` (Task 4).
4. **Borrar el STL con puntos:** los puntos de un STL borrado no deben seguir contando para el límite ni salir en público. Prueba backend de cascada (Task 2).
5. **STL privado o segundo STL:** los puntos de un STL privado nunca salen en la API pública, y en la página pública la leyenda desaparece al cambiar a otro modelo. Pruebas en Task 2 y Task 6.

## Rulings sobre el spec

- `useProjectedCallouts(camera, points)` del spec se implementa como `useProjectedCallouts()` → `{ projected, projector }`, donde `projector` (`CalloutProjector`) recibe cámara y puntos desde el bucle de render del visor. Motivo: la cámara vive dentro del efecto de three y no en estado de React. Costo si está mal: renombrar un hook.
- `GET /prototypes/{id}/hotspots` usa rol `viewer` (como el resto de lecturas del módulo); el spec dice "editor+" para la API interna, lo que dejaría al viewer sin ver los puntos en el admin. Costo si está mal: cambiar una dependencia.

## Mapa de archivos

| Archivo | Tarea | Responsabilidad |
|---|---|---|
| `app/modules/prototypes/models.py` | 1 | `PrototypeHotspot`, `MAX_HOTSPOTS` |
| `alembic/versions/0004_prototype_hotspots.py` | 1 | tabla `prototype_hotspots` |
| `app/modules/prototypes/schemas.py` | 1, 2 | `HotspotCreate/Update/Out`, `PublicHotspotOut`, `PublicPrototypeDetail.hotspots` |
| `app/modules/prototypes/service.py` | 1, 2 | CRUD, límite, cascadas, `public_hotspots` |
| `app/modules/prototypes/router.py` | 1, 2 | rutas internas y campo público |
| `app/modules/home/service.py` | 2 | textos de actividad |
| `tests/test_hotspots.py` | 1, 2 | pruebas backend |
| `frontend/src/features/three/types.ts` | 3 | tipos sin three (`ModelPoint`, `ViewerHotspot`) |
| `frontend/src/features/three/model.ts` | 3 | `placeModel`, `toWorld`, `toModel` |
| `frontend/src/features/three/projection.ts` | 3 | `projectToScreen`, `isOccluded`, `CalloutProjector` |
| `frontend/src/features/three/useProjectedCallouts.ts` | 3 | hook de estado |
| `frontend/src/features/three/three.test.ts` | 3 | pruebas con cámara simulada |
| `frontend/src/components/ui/Callout.tsx` | 4 | prop `index` (números en móvil) y `title` |
| `frontend/src/features/prototypes/pick.ts` | 4 | `isClick` |
| `frontend/src/features/prototypes/StlViewer.tsx` | 4 | callouts superpuestos y pick |
| `frontend/src/features/prototypes/api.ts` | 4 | tipos y llamadas de hotspots |
| `frontend/src/features/prototypes/HotspotEditor.tsx` | 5 | vista previa 3D con editor de puntos |
| `frontend/src/features/prototypes/PrototypeAdminDetailPage.tsx` | 5 | usa `ModelPreview` |
| `frontend/src/features/prototypes/hotspots.test.tsx` | 5 | pruebas del editor |
| `frontend/src/features/prototypes/PrototypePublicPage.tsx` | 6 | callouts y leyenda |
| `frontend/src/features/prototypes/prototypes.test.tsx` | 4, 6 | fixtures con `hotspots`, pruebas públicas |
| `README.md` | 7 | checklist real / simulado / pendiente |

**Paralelismo:** carril backend (Task 1 → Task 2) y carril frontend (Task 3 → Task 4 → {Task 5, Task 6}) son independientes; Task 5 y Task 6 no comparten archivos salvo que Task 6 añade pruebas a `prototypes.test.tsx` (Task 5 escribe las suyas en `hotspots.test.tsx`). Task 7 al final.

---

### Task 1: Modelo, migración y CRUD interno de hotspots

**Files:**
- Modify: `app/modules/prototypes/models.py`
- Create: `alembic/versions/0004_prototype_hotspots.py`
- Modify: `app/modules/prototypes/schemas.py`
- Modify: `app/modules/prototypes/service.py`
- Modify: `app/modules/prototypes/router.py`
- Create: `tests/test_hotspots.py`

**Interfaces:**
- Consumes: `get_prototype`, `scoped`, `record`, `unprocessable`, `not_found`, `AppError` existentes.
- Produces: `PrototypeHotspot`, `MAX_HOTSPOTS = 12`, `HOTSPOT_RESOURCE = "prototype_hotspot"`, `service.active_hotspots(db, proto) -> list[PrototypeHotspot]`, rutas `GET/POST /api/v1/prototypes/{id}/hotspots`, `PATCH/DELETE /api/v1/prototypes/{id}/hotspots/{hid}`. JSON de `HotspotOut`: `{id, prototype_id, asset_id, label, description, x, y, z, sort_order, created_at}`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `tests/test_hotspots.py`:

```python
import pytest

from app.core.config import Settings
from app.modules.audit.models import AuditEvent
from app.modules.prototypes import router as proto_router
from tests.test_prototypes import PNG, binary_stl, create, upload

API = "/api/v1"


@pytest.fixture(autouse=True)
def public_alfa(monkeypatch):
    monkeypatch.setattr(proto_router, "settings", Settings(public_org_slug="alfa"))


def stl(client, headers, proto_id, name="modelo.stl", is_public=True):
    res = upload(client, headers, proto_id, binary_stl(), name, is_public=is_public)
    assert res.status_code == 201, res.text
    return res.json()


def point(asset_id, label="Sensor de humedad", **extra):
    return {"asset_id": asset_id, "label": label, "x": 1.5, "y": -2.0, "z": 30.25, **extra}


def add(client, headers, proto_id, body):
    return client.post(f"{API}/prototypes/{proto_id}/hotspots", json=body, headers=headers)


# ---- CRUD ----


def test_create_list_update_delete_and_audit(client, tenants, db):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])

    res = add(client, h, proto["id"], point(model["id"], label="  LED espectro completo  ", description=" Luz "))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["label"] == "LED espectro completo" and body["description"] == "Luz"
    assert (body["x"], body["y"], body["z"]) == (1.5, -2.0, 30.25)
    assert body["asset_id"] == model["id"] and body["prototype_id"] == proto["id"]
    assert body["sort_order"] == 0

    second = add(client, h, proto["id"], point(model["id"], label="Bomba")).json()
    assert second["sort_order"] == 1

    listed = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=tenants["alfa_viewer"])
    assert listed.status_code == 200
    assert [p["label"] for p in listed.json()] == ["LED espectro completo", "Bomba"]

    patched = client.patch(
        f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}",
        json={"label": "LED", "sort_order": 5, "z": 31.0},
        headers=h,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["label"] == "LED" and patched.json()["z"] == 31.0
    listed = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()
    assert [p["label"] for p in listed] == ["Bomba", "LED"]

    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}", headers=h).status_code == 204
    assert [p["label"] for p in client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()] == ["Bomba"]
    assert client.patch(
        f"{API}/prototypes/{proto['id']}/hotspots/{body['id']}", json={"label": "X"}, headers=h
    ).status_code == 404

    ops = [e.operation for e in db.query(AuditEvent).filter_by(resource_type="prototype_hotspot")]
    assert sorted(ops) == ["create", "create", "delete", "update"]


def test_viewer_cannot_write(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    v = tenants["alfa_viewer"]
    assert add(client, v, proto["id"], point(model["id"])).status_code == 403
    assert client.patch(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", json={"label": "X"}, headers=v).status_code == 403
    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", headers=v).status_code == 403


def test_limit_of_twelve_per_prototype(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    a = stl(client, h, proto["id"], "a.stl")
    b = stl(client, h, proto["id"], "b.stl")
    for i in range(12):
        assert add(client, h, proto["id"], point(a["id"] if i % 2 else b["id"], label=f"P{i}")).status_code == 201
    res = add(client, h, proto["id"], point(a["id"], label="P12"))
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "hotspot_limit"
    # Borrar uno libera el cupo
    first = client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()[0]
    client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{first['id']}", headers=h)
    assert add(client, h, proto["id"], point(a["id"], label="P12")).status_code == 201


def test_asset_must_be_stl_of_same_prototype(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    other = create(client, h, name="Otro")
    img = upload(client, h, proto["id"], PNG, "foto.png").json()
    foreign = stl(client, h, other["id"])
    for asset_id in (img["id"], foreign["id"], "no-existe"):
        res = add(client, h, proto["id"], point(asset_id))
        assert res.status_code == 422, asset_id
        assert res.json()["error"]["details"]["field"] == "asset_id"


@pytest.mark.parametrize(
    "patch",
    [
        {"label": ""},
        {"label": "   "},
        {"label": "x" * 61},
        {"description": "d" * 501},
        {"x": "nan"},
        {"y": "inf"},
        {"z": 2e9},
    ],
)
def test_rejects_invalid_fields(client, tenants, patch):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    res = add(client, h, proto["id"], {**point(model["id"]), **patch})
    assert res.status_code == 422, res.text


def test_tenant_isolation(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    b = tenants["beta_editor"]
    assert client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=b).status_code == 404
    assert add(client, b, proto["id"], point(model["id"])).status_code == 404
    assert client.patch(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", json={"label": "X"}, headers=b).status_code == 404
    assert client.delete(f"{API}/prototypes/{proto['id']}/hotspots/{hid}", headers=b).status_code == 404
    # Un hotspot no se alcanza a través de otro prototipo de la misma org
    other = create(client, h, name="Otro")
    assert client.patch(f"{API}/prototypes/{other['id']}/hotspots/{hid}", json={"label": "X"}, headers=h).status_code == 404
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_hotspots.py -q -p no:warnings`
Expected: FAIL (404 en `POST /hotspots`).

- [ ] **Step 3: Modelo**

En `app/modules/prototypes/models.py`, cambiar la importación de sqlalchemy para incluir `Float`:

```python
from sqlalchemy import JSON, BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
```

Añadir al final del archivo:

```python
MAX_HOTSPOTS = 12


class PrototypeHotspot(UUIDMixin, TenantMixin, AuditMixin, Base):
    """Punto etiquetado sobre un STL. x, y, z en coordenadas crudas del archivo (antes de girar y centrar)."""

    __tablename__ = "prototype_hotspots"

    prototype_id: Mapped[str] = mapped_column(String(36), ForeignKey("prototypes.id"), nullable=False, index=True)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("prototype_assets.id"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    z: Mapped[float] = mapped_column(Float, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

- [ ] **Step 4: Migración**

Crear `alembic/versions/0004_prototype_hotspots.py`:

```python
"""puntos (hotspots) sobre modelos STL de prototipos

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prototype_hotspots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("organization_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("prototype_id", sa.String(36), sa.ForeignKey("prototypes.id"), nullable=False, index=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("prototype_assets.id"), nullable=False, index=True),
        sa.Column("label", sa.String(60), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.Column("z", sa.Float(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("prototype_hotspots")
```

- [ ] **Step 5: Esquemas**

En `app/modules/prototypes/schemas.py`, cambiar la primera importación de typing a `from typing import Annotated, Literal` y añadir después de `AssetUpdate`:

```python
Coord = Annotated[float, Field(ge=-1e9, le=1e9, allow_inf_nan=False)]


def _clean_label(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if not v:
        raise ValueError("la etiqueta es obligatoria")
    return v


class HotspotCreate(BaseModel):
    asset_id: str = Field(min_length=1, max_length=36)
    label: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    x: Coord
    y: Coord
    z: Coord
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_label(v)

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str) -> str:
        return v.strip()


class HotspotUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=500)
    x: Coord | None = None
    y: Coord | None = None
    z: Coord | None = None
    sort_order: int | None = Field(default=None, ge=-100000, le=100000)

    @field_validator("label")
    @classmethod
    def _label(cls, v: str | None) -> str | None:
        return _clean_label(v)

    @field_validator("description")
    @classmethod
    def _strip_description(cls, v: str | None) -> str | None:
        return v.strip() if v is not None else None
```

Y en la sección de salidas internas, después de `AssetOut`:

```python
class HotspotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    prototype_id: str
    asset_id: str
    label: str
    description: str
    x: float
    y: float
    z: float
    sort_order: int
    created_at: datetime
```

- [ ] **Step 6: Servicio**

En `app/modules/prototypes/service.py`:

Cambiar la importación de modelos y esquemas a:

```python
from app.modules.prototypes.models import KIND_IMAGE, KIND_MODEL_STL, MAX_HOTSPOTS, Prototype, PrototypeAsset, PrototypeHotspot
from app.modules.prototypes.schemas import AssetUpdate, HotspotCreate, HotspotUpdate, PrototypeCreate, PrototypeUpdate
```

Añadir debajo de `ASSET_RESOURCE = "prototype_asset"`:

```python
HOTSPOT_RESOURCE = "prototype_hotspot"
```

Añadir antes de la sección `# ---- Público ----`:

```python
# ---- Hotspots ----


def active_hotspots(db: Session, prototype: Prototype) -> list[PrototypeHotspot]:
    stmt = (
        select(PrototypeHotspot)
        .where(
            PrototypeHotspot.prototype_id == prototype.id,
            PrototypeHotspot.organization_id == prototype.organization_id,
            PrototypeHotspot.deleted_at.is_(None),
        )
        .order_by(PrototypeHotspot.sort_order, PrototypeHotspot.created_at)
    )
    return list(db.scalars(stmt))


def list_hotspots(db: Session, ctx: RequestContext, prototype_id: str) -> list[PrototypeHotspot]:
    return active_hotspots(db, get_prototype(db, ctx, prototype_id))


def _get_hotspot(db: Session, ctx: RequestContext, prototype: Prototype, hotspot_id: str) -> PrototypeHotspot:
    hotspot = db.scalar(
        scoped(PrototypeHotspot, ctx).where(
            PrototypeHotspot.id == hotspot_id, PrototypeHotspot.prototype_id == prototype.id
        )
    )
    if hotspot is None:
        raise not_found("punto")
    return hotspot


def create_hotspot(db: Session, ctx: RequestContext, prototype_id: str, data: HotspotCreate) -> PrototypeHotspot:
    proto = get_prototype(db, ctx, prototype_id)
    asset = db.scalar(
        scoped(PrototypeAsset, ctx).where(PrototypeAsset.id == data.asset_id, PrototypeAsset.prototype_id == proto.id)
    )
    if asset is None or asset.kind != KIND_MODEL_STL:
        raise unprocessable("El punto debe pertenecer a un modelo STL de este prototipo", {"field": "asset_id"})
    existing = active_hotspots(db, proto)
    if len(existing) >= MAX_HOTSPOTS:
        raise AppError(
            422, "hotspot_limit", f"Máximo {MAX_HOTSPOTS} puntos por prototipo", {"max": MAX_HOTSPOTS}
        )
    sort_order = (
        data.sort_order if data.sort_order is not None else max((h.sort_order for h in existing), default=-1) + 1
    )
    hotspot = PrototypeHotspot(
        organization_id=ctx.organization_id,
        prototype_id=proto.id,
        asset_id=asset.id,
        label=data.label,
        description=data.description,
        x=data.x,
        y=data.y,
        z=data.z,
        sort_order=sort_order,
    )
    db.add(hotspot)
    db.flush()
    record(db, ctx, HOTSPOT_RESOURCE, hotspot.id, "create", {"prototype_id": proto.id, "asset_id": asset.id, "label": hotspot.label})
    db.commit()
    return hotspot


def update_hotspot(
    db: Session, ctx: RequestContext, prototype_id: str, hotspot_id: str, data: HotspotUpdate
) -> PrototypeHotspot:
    proto = get_prototype(db, ctx, prototype_id)
    hotspot = _get_hotspot(db, ctx, proto, hotspot_id)
    changes: dict = {}
    for attr in ("label", "description", "x", "y", "z", "sort_order"):
        if attr in data.model_fields_set and getattr(data, attr) is not None:
            setattr(hotspot, attr, getattr(data, attr))
            changes[attr] = getattr(data, attr)
    record(db, ctx, HOTSPOT_RESOURCE, hotspot.id, "update", changes)
    db.commit()
    return hotspot


def delete_hotspot(db: Session, ctx: RequestContext, prototype_id: str, hotspot_id: str) -> None:
    proto = get_prototype(db, ctx, prototype_id)
    hotspot = _get_hotspot(db, ctx, proto, hotspot_id)
    hotspot.deleted_at = utcnow()
    record(db, ctx, HOTSPOT_RESOURCE, hotspot.id, "delete", {"prototype_id": proto.id, "label": hotspot.label})
    db.commit()
```

- [ ] **Step 7: Rutas**

En `app/modules/prototypes/router.py`, añadir `HotspotCreate, HotspotOut, HotspotUpdate` a la importación de esquemas (orden alfabético dentro del bloque) y, después de `asset_file`, antes de `# ---- Pública`:

```python
@internal.get("/{prototype_id}/hotspots", response_model=list[HotspotOut])
def list_hotspots(prototype_id: str, ctx: RequestContext = Depends(viewer), db: Session = Depends(get_db)):
    return service.list_hotspots(db, ctx, prototype_id)


@internal.post("/{prototype_id}/hotspots", response_model=HotspotOut, status_code=201)
def create_hotspot(
    prototype_id: str, data: HotspotCreate, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    return service.create_hotspot(db, ctx, prototype_id, data)


@internal.patch("/{prototype_id}/hotspots/{hotspot_id}", response_model=HotspotOut)
def update_hotspot(
    prototype_id: str,
    hotspot_id: str,
    data: HotspotUpdate,
    ctx: RequestContext = Depends(editor),
    db: Session = Depends(get_db),
):
    return service.update_hotspot(db, ctx, prototype_id, hotspot_id, data)


@internal.delete("/{prototype_id}/hotspots/{hotspot_id}", status_code=204)
def delete_hotspot(
    prototype_id: str, hotspot_id: str, ctx: RequestContext = Depends(editor), db: Session = Depends(get_db)
):
    service.delete_hotspot(db, ctx, prototype_id, hotspot_id)
    return Response(status_code=204)
```

- [ ] **Step 8: Correr las pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_hotspots.py -q -p no:warnings`
Expected: PASS. Luego la suite completa: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings` → todo PASS.

- [ ] **Step 9: Migración en Postgres 17**

```bash
docker run -d --rm --name hvt-pg -e POSTGRES_PASSWORD=pg -e POSTGRES_DB=hvt -p 55432:5432 postgres:17
sleep 5
export DATABASE_URL=postgresql://postgres:pg@localhost:55432/hvt
~/.venvs/harvestt/bin/python -m alembic upgrade head
~/.venvs/harvestt/bin/python -m alembic check
~/.venvs/harvestt/bin/python -m alembic downgrade 0003
~/.venvs/harvestt/bin/python -m alembic upgrade head
docker stop hvt-pg
```

Expected: `alembic check` imprime "No new upgrade operations detected."

- [ ] **Step 10: Commit**

```bash
git add app/modules/prototypes alembic/versions/0004_prototype_hotspots.py tests/test_hotspots.py
git commit -m "feat(prototypes): hotspots sobre STL con límite de 12, auditoría y migración 0004"
```

---

### Task 2: Hotspots en la API pública, cascadas y textos de actividad

**Files:**
- Modify: `app/modules/prototypes/schemas.py`
- Modify: `app/modules/prototypes/service.py`
- Modify: `app/modules/prototypes/router.py`
- Modify: `app/modules/home/service.py`
- Modify: `tests/test_hotspots.py`

**Interfaces:**
- Consumes: Task 1 (`PrototypeHotspot`, `active_hotspots`, `add`/`stl`/`point` de las pruebas).
- Produces: `PublicPrototypeDetail.hotspots: list[PublicHotspotOut]` con JSON `{label, description, x, y, z, sort_order}`; `service.public_hotspots(db, asset_id)`.

- [ ] **Step 1: Pruebas que fallan**

Añadir al final de `tests/test_hotspots.py`:

```python
# ---- Público, cascadas y actividad ----

from app.modules.home.service import activity_text  # noqa: E402


def _walk_keys(obj):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield k
            yield from _walk_keys(v)
    elif isinstance(obj, list):
        for item in obj:
            yield from _walk_keys(item)


def test_public_detail_has_hotspots_of_principal_public_stl(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h, name="Germinador ECOS", slug="ecos", is_public=True)
    private_stl = stl(client, h, proto["id"], "interno.stl", is_public=False)
    principal = stl(client, h, proto["id"], "principal.stl")
    second = stl(client, h, proto["id"], "segundo.stl")
    add(client, h, proto["id"], point(private_stl["id"], label="Secreto"))
    add(client, h, proto["id"], point(principal["id"], label="LED", description="Espectro completo", sort_order=2))
    add(client, h, proto["id"], point(principal["id"], label="Sensor", sort_order=1))
    add(client, h, proto["id"], point(second["id"], label="Del segundo"))

    res = client.get(f"{API}/public/prototypes/ecos")
    assert res.status_code == 200
    hotspots = res.json()["hotspots"]
    assert [p["label"] for p in hotspots] == ["Sensor", "LED"]
    assert hotspots[1] == {"label": "LED", "description": "Espectro completo", "x": 1.5, "y": -2.0, "z": 30.25, "sort_order": 2}
    keys = set(_walk_keys(hotspots))
    assert keys == {"label", "description", "x", "y", "z", "sort_order"}
    assert "Secreto" not in res.text and "Del segundo" not in res.text


def test_public_detail_without_stl_has_empty_hotspots(client, tenants):
    create(client, tenants["alfa_editor"], name="Sin modelo", slug="sin-modelo", is_public=True)
    assert client.get(f"{API}/public/prototypes/sin-modelo").json()["hotspots"] == []


def test_deleting_stl_soft_deletes_its_hotspots(client, tenants):
    h = tenants["alfa_editor"]
    proto = create(client, h, slug="p", is_public=True)
    a = stl(client, h, proto["id"], "a.stl")
    b = stl(client, h, proto["id"], "b.stl")
    for i in range(6):
        add(client, h, proto["id"], point(a["id"], label=f"A{i}"))
        add(client, h, proto["id"], point(b["id"], label=f"B{i}"))
    assert client.delete(f"{API}/prototypes/{proto['id']}/assets/{a['id']}", headers=h).status_code == 204
    labels = [p["label"] for p in client.get(f"{API}/prototypes/{proto['id']}/hotspots", headers=h).json()]
    assert labels and all(lbl.startswith("B") for lbl in labels)
    # Los 6 de A ya no cuentan para el límite
    assert add(client, h, proto["id"], point(b["id"], label="nuevo")).status_code == 201
    # b pasó a ser el STL principal público
    assert {p["label"] for p in client.get(f"{API}/public/prototypes/p").json()["hotspots"]} == set(labels) | {"nuevo"}


def test_deleting_prototype_soft_deletes_hotspots(client, tenants, db):
    from app.modules.prototypes.models import PrototypeHotspot

    h = tenants["alfa_editor"]
    proto = create(client, h)
    model = stl(client, h, proto["id"])
    hid = add(client, h, proto["id"], point(model["id"])).json()["id"]
    assert client.delete(f"{API}/prototypes/{proto['id']}", headers=h).status_code == 204
    db.expire_all()
    assert db.get(PrototypeHotspot, hid).deleted_at is not None


@pytest.mark.parametrize(
    "operation,text",
    [("create", "Punto agregado al modelo 3D"), ("update", "Punto del modelo 3D actualizado"), ("delete", "Punto del modelo 3D eliminado")],
)
def test_activity_texts(operation, text):
    event = AuditEvent(resource_type="prototype_hotspot", resource_id="x", operation=operation, data={})
    assert activity_text(event) == text
```

- [ ] **Step 2: Verificar que fallan**

Run: `~/.venvs/harvestt/bin/python -m pytest tests/test_hotspots.py -q -p no:warnings`
Expected: FAIL (`KeyError: 'hotspots'` y textos "Cambio registrado").

- [ ] **Step 3: Esquema público**

En `app/modules/prototypes/schemas.py`, en la sección pública, añadir antes de `PublicPrototypeSummary`:

```python
class PublicHotspotOut(BaseModel):
    label: str
    description: str
    x: float
    y: float
    z: float
    sort_order: int
```

Y en `PublicPrototypeDetail` añadir el campo:

```python
    hotspots: list[PublicHotspotOut]
```

- [ ] **Step 4: Servicio — cascadas y consulta pública**

En `app/modules/prototypes/service.py`:

Dentro de `delete_prototype`, después del bucle `for asset in list_assets(db, proto): asset.deleted_at = now`, añadir:

```python
    for hotspot in active_hotspots(db, proto):
        hotspot.deleted_at = now
```

Dentro de `delete_asset`, después de `asset.deleted_at = utcnow()`, añadir:

```python
    for hotspot in active_hotspots(db, proto):
        if hotspot.asset_id == asset.id:
            hotspot.deleted_at = asset.deleted_at
```

Al final de la sección pública:

```python
def public_hotspots(db: Session, asset_id: str) -> list[PrototypeHotspot]:
    """Puntos de un STL ya verificado como público por quien llama."""
    stmt = (
        select(PrototypeHotspot)
        .where(PrototypeHotspot.asset_id == asset_id, PrototypeHotspot.deleted_at.is_(None))
        .order_by(PrototypeHotspot.sort_order, PrototypeHotspot.created_at)
    )
    return list(db.scalars(stmt))
```

- [ ] **Step 5: Router público**

En `app/modules/prototypes/router.py`, añadir `PublicHotspotOut` a la importación de esquemas y reemplazar el `return PublicPrototypeDetail(...)` de `public_prototype` por:

```python
    principal = next((a for a in assets if a.kind == "model_stl"), None)
    hotspots = service.public_hotspots(db, principal.id) if principal else []
    return PublicPrototypeDetail(
        **_summary_fields(proto, assets),
        description=proto.description,
        specs=proto.specs or [],
        assets=[_public_asset_out(a) for a in assets],
        hotspots=[
            PublicHotspotOut(label=h.label, description=h.description, x=h.x, y=h.y, z=h.z, sort_order=h.sort_order)
            for h in hotspots
        ],
    )
```

(`service.public_assets` ya devuelve solo archivos públicos, no borrados, ordenados por `sort_order, created_at`; por eso `principal` es el primer STL público.)

- [ ] **Step 6: Textos de actividad**

En `app/modules/home/service.py`, añadir al diccionario `_TEXTS`, tras las entradas de `prototype_asset`:

```python
    ("prototype_hotspot", "create"): "Punto agregado al modelo 3D",
    ("prototype_hotspot", "update"): "Punto del modelo 3D actualizado",
    ("prototype_hotspot", "delete"): "Punto del modelo 3D eliminado",
```

- [ ] **Step 7: Correr pruebas**

Run: `~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings`
Expected: todo PASS (incluida `test_public_list_and_detail`, cuyo detalle ahora trae `hotspots: []`, campo que no está en `INTERNAL_FIELDS`).

- [ ] **Step 8: Commit**

```bash
git add app/modules tests/test_hotspots.py
git commit -m "feat(prototypes): hotspots del STL principal en el detalle público, cascadas al borrar y textos de actividad"
```

---

### Task 3: Helpers de three — colocar el modelo y proyectar callouts

**Files:**
- Create: `frontend/src/features/three/types.ts`
- Create: `frontend/src/features/three/model.ts`
- Create: `frontend/src/features/three/projection.ts`
- Create: `frontend/src/features/three/useProjectedCallouts.ts`
- Test: `frontend/src/features/three/three.test.ts`

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces:
  - `types.ts`: `interface ModelPoint { x: number; y: number; z: number }`, `interface ViewerHotspot extends ModelPoint { key: string; label: string; description?: string }`.
  - `model.ts`: `placeModel(geometry, material) -> { mesh: THREE.Mesh; radius: number; floorY: number }`, `toWorld(mesh, p: ModelPoint) -> THREE.Vector3`, `toModel(mesh, world: THREE.Vector3) -> ModelPoint`.
  - `projection.ts`: `projectToScreen(world, camera, width, height) -> { x; y; behind }`, `isOccluded(world, camera, occluders, raycaster?) -> boolean`, `interface CalloutPoint extends ModelPoint { key; label; index }`, `interface ProjectedCallout { key; label; index; x; y; side: 'left' | 'right'; hidden; dimmed }`, `OCCLUSION_INTERVAL_MS = 200`, `class CalloutProjector { constructor(publish); setPoints(points); update(camera, model, width, height, now): boolean }`.
  - `useProjectedCallouts.ts`: `useProjectedCallouts() -> { projected: ProjectedCallout[]; projector: CalloutProjector }`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/three/three.test.ts`:

```ts
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { placeModel, toModel, toWorld } from './model'
import { CalloutProjector, isOccluded, OCCLUSION_INTERVAL_MS, projectToScreen, ProjectedCallout } from './projection'

function camera(z = 10) {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  cam.position.set(0, 0, z)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return cam
}

const box = () => new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())

describe('placeModel', () => {
  it('gira a Y-arriba, centra en el origen y convierte ida y vuelta', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    geometry.translate(10, 20, 30) // origen del STL lejos del centro
    geometry.computeBoundingSphere()
    const { mesh, radius, floorY } = placeModel(geometry, new THREE.MeshBasicMaterial())
    expect(radius).toBeCloseTo(Math.sqrt(3))
    expect(floorY).toBeCloseTo(-1)
    // La cara superior del STL (z = 31 crudo) queda arriba (y = 1) y centrada
    const world = toWorld(mesh, { x: 10, y: 20, z: 31 })
    expect(world.x).toBeCloseTo(0)
    expect(world.y).toBeCloseTo(1)
    expect(world.z).toBeCloseTo(0)
    const back = toModel(mesh, world)
    expect(back.x).toBeCloseTo(10)
    expect(back.y).toBeCloseTo(20)
    expect(back.z).toBeCloseTo(31)
    // No altera la geometría: los puntos guardados siguen en coordenadas crudas
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.min.z).toBeCloseTo(29)
  })
})

describe('proyección', () => {
  it('lleva el centro de la vista al centro de la pantalla', () => {
    const p = projectToScreen(new THREE.Vector3(0, 0, 0), camera(), 200, 100)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
    expect(p.behind).toBe(false)
  })

  it('marca como detrás de la cámara lo que queda a su espalda', () => {
    expect(projectToScreen(new THREE.Vector3(0, 0, 20), camera(), 200, 200).behind).toBe(true)
  })

  it('la cara trasera queda ocluida y la delantera no', () => {
    const mesh = box()
    mesh.updateMatrixWorld()
    expect(isOccluded(new THREE.Vector3(0, 0, 1), camera(), [mesh])).toBe(false)
    expect(isOccluded(new THREE.Vector3(0, 0, -1), camera(), [mesh])).toBe(true)
  })
})

describe('CalloutProjector', () => {
  const points = [
    { key: 'front', label: 'Frente', index: 1, x: 0.5, y: 0, z: 1 },
    { key: 'left', label: 'Izquierda', index: 2, x: -0.5, y: 0, z: 1 },
    { key: 'back', label: 'Atrás', index: 3, x: 0, y: 0, z: -1 },
  ]

  function setup() {
    const published: ProjectedCallout[][] = []
    const projector = new CalloutProjector((c) => published.push(c))
    projector.setPoints(points)
    return { projector, published, mesh: box() }
  }

  it('publica posiciones, lado y oclusión', () => {
    const { projector, published, mesh } = setup()
    expect(projector.update(camera(), mesh, 200, 200, 0)).toBe(true)
    const [front, left, back] = published[0]
    expect(front.x).toBeGreaterThan(100)
    expect(front.side).toBe('right')
    expect(left.side).toBe('left')
    expect(front.dimmed).toBe(false)
    expect(back.dimmed).toBe(true)
    expect(front.hidden).toBe(false)
    expect(front.index).toBe(1)
  })

  it('no vuelve a publicar si la cámara no se movió', () => {
    const { projector, published, mesh } = setup()
    const cam = camera()
    projector.update(cam, mesh, 200, 200, 0)
    expect(projector.update(cam, mesh, 200, 200, 1000)).toBe(false)
    expect(published).toHaveLength(1)
  })

  it('limita la oclusión a una vez por intervalo y se pone al día al detenerse', () => {
    const { projector, published, mesh } = setup()
    const cam = camera(10)
    projector.update(cam, mesh, 200, 200, 0)
    // Gira la cámara al otro lado antes de que pase el intervalo
    cam.position.set(0, 0, -10)
    cam.lookAt(0, 0, 0)
    projector.update(cam, mesh, 200, 200, OCCLUSION_INTERVAL_MS / 2)
    const stale = published[1].find((c) => c.key === 'front')!
    expect(stale.dimmed).toBe(false) // aún sin recalcular
    // La cámara ya no se mueve; al vencer el intervalo se recalcula
    expect(projector.update(cam, mesh, 200, 200, OCCLUSION_INTERVAL_MS + 1)).toBe(true)
    expect(published[2].find((c) => c.key === 'front')!.dimmed).toBe(true)
    expect(published[2].find((c) => c.key === 'back')!.dimmed).toBe(false)
  })

  it('oculta puntos fuera de la vista y republica al cambiar los puntos', () => {
    const publish = vi.fn()
    const projector = new CalloutProjector(publish)
    const cam = camera()
    projector.setPoints([{ key: 'lejos', label: 'Lejos', index: 1, x: 50, y: 0, z: 0 }])
    projector.update(cam, box(), 200, 200, 0)
    expect(publish.mock.calls[0][0][0].hidden).toBe(true)
    projector.setPoints([])
    expect(projector.update(cam, box(), 200, 200, 1)).toBe(true)
    expect(publish.mock.calls[1][0]).toEqual([])
    // Sin puntos, girar la cámara no vuelve a publicar (evita un render de React por frame)
    cam.position.set(5, 0, 5)
    cam.lookAt(0, 0, 0)
    expect(projector.update(cam, box(), 200, 200, 2)).toBe(false)
    expect(publish).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run (en `frontend/`): `npx vitest run src/features/three/three.test.ts`
Expected: FAIL (no existen los módulos).

- [ ] **Step 3: Tipos sin three**

Crear `frontend/src/features/three/types.ts`:

```ts
// Sin importar three: las páginas usan estos tipos sin arrastrar el chunk 3D.

/** Punto en coordenadas crudas del archivo STL. */
export interface ModelPoint {
  x: number
  y: number
  z: number
}

export interface ViewerHotspot extends ModelPoint {
  key: string
  label: string
  description?: string
}
```

- [ ] **Step 4: Colocar el modelo**

Crear `frontend/src/features/three/model.ts`:

```ts
import * as THREE from 'three'
import type { ModelPoint } from './types'

/**
 * Crea la malla con la geometría tal como viene del STL y la gira a Y-arriba y la centra mediante su
 * transformación, sin tocar los vértices. Así los hotspots se guardan en coordenadas crudas y
 * toWorld/toModel convierten entre ambos sistemas.
 */
export function placeModel(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2 // STL suele ser Z-arriba; three usa Y-arriba
  mesh.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(mesh)
  const center = box.getCenter(new THREE.Vector3())
  mesh.position.sub(center)
  mesh.updateMatrixWorld(true)
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  return { mesh, radius: geometry.boundingSphere?.radius || 1, floorY: box.min.y - center.y }
}

export function toWorld(mesh: THREE.Object3D, p: ModelPoint): THREE.Vector3 {
  mesh.updateMatrixWorld()
  return mesh.localToWorld(new THREE.Vector3(p.x, p.y, p.z))
}

export function toModel(mesh: THREE.Object3D, world: THREE.Vector3): ModelPoint {
  mesh.updateMatrixWorld()
  const v = mesh.worldToLocal(world.clone())
  return { x: v.x, y: v.y, z: v.z }
}
```

- [ ] **Step 5: Proyección y oclusión**

Crear `frontend/src/features/three/projection.ts`:

```ts
import * as THREE from 'three'
import type { ModelPoint } from './types'

export interface CalloutPoint extends ModelPoint {
  key: string
  label: string
  index: number
}

export interface ProjectedCallout {
  key: string
  label: string
  index: number
  x: number
  y: number
  side: 'left' | 'right'
  hidden: boolean
  dimmed: boolean
}

/** La oclusión hace raycast contra toda la malla; durante el giro se recalcula como máximo con esta frecuencia. */
export const OCCLUSION_INTERVAL_MS = 200

export function projectToScreen(world: THREE.Vector3, camera: THREE.Camera, width: number, height: number) {
  const v = world.clone().project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, behind: v.z > 1 || v.z < -1 }
}

/** true si algo de `occluders` se interpone entre la cámara y el punto (que está sobre la superficie). */
export function isOccluded(
  world: THREE.Vector3,
  camera: THREE.Camera,
  occluders: THREE.Object3D[],
  raycaster = new THREE.Raycaster(),
): boolean {
  const origin = camera.getWorldPosition(new THREE.Vector3())
  const direction = world.clone().sub(origin)
  const distance = direction.length()
  if (distance === 0) return false
  raycaster.set(origin, direction.normalize())
  raycaster.near = 0
  raycaster.far = distance
  const hit = raycaster.intersectObjects(occluders, false)[0]
  return hit !== undefined && hit.distance < distance * 0.99
}

export class CalloutProjector {
  private points: CalloutPoint[] = []
  private signature = ''
  private occlusionDirty = true
  private lastOcclusionAt = -Infinity
  private readonly occluded = new Map<string, boolean>()
  private readonly raycaster = new THREE.Raycaster()
  private emptyPublished = false

  constructor(private readonly publish: (callouts: ProjectedCallout[]) => void) {}

  setPoints(points: CalloutPoint[]) {
    this.points = points
    this.signature = ''
    this.occlusionDirty = true
    this.lastOcclusionAt = -Infinity
    this.emptyPublished = false
  }

  /** Recalcula solo si cambió la cámara, el tamaño o los puntos, o si la oclusión quedó pendiente. */
  update(camera: THREE.Camera, model: THREE.Object3D, width: number, height: number, now: number): boolean {
    // Sin puntos no hay nada que seguir: publica la lista vacía una sola vez, no en cada frame del giro.
    if (this.points.length === 0) {
      if (this.emptyPublished) return false
      this.emptyPublished = true
      this.publish([])
      return true
    }
    camera.updateMatrixWorld()
    model.updateMatrixWorld()
    const signature = [
      width,
      height,
      ...camera.matrixWorld.elements.map((n) => n.toFixed(5)),
      ...camera.projectionMatrix.elements.slice(0, 6).map((n) => n.toFixed(5)),
    ].join(',')
    const moved = signature !== this.signature
    if (moved) {
      this.signature = signature
      this.occlusionDirty = true
    }
    const refreshOcclusion = this.occlusionDirty && now - this.lastOcclusionAt >= OCCLUSION_INTERVAL_MS
    if (!moved && !refreshOcclusion) return false

    const out = this.points.map((p): ProjectedCallout => {
      const world = model.localToWorld(new THREE.Vector3(p.x, p.y, p.z))
      const s = projectToScreen(world, camera, width, height)
      if (refreshOcclusion) this.occluded.set(p.key, !s.behind && isOccluded(world, camera, [model], this.raycaster))
      return {
        key: p.key,
        label: p.label,
        index: p.index,
        x: s.x,
        y: s.y,
        side: s.x < width / 2 ? 'left' : 'right',
        hidden: s.behind || s.x < 0 || s.x > width || s.y < 0 || s.y > height,
        dimmed: this.occluded.get(p.key) ?? false,
      }
    })
    if (refreshOcclusion) {
      this.lastOcclusionAt = now
      this.occlusionDirty = false
    }
    this.publish(out)
    return true
  }
}
```

- [ ] **Step 6: Hook**

Crear `frontend/src/features/three/useProjectedCallouts.ts`:

```ts
import { useMemo, useState } from 'react'
import { CalloutProjector, ProjectedCallout } from './projection'

/** Estado de React con los callouts proyectados; el bucle de render del visor llama a projector.update. */
export function useProjectedCallouts() {
  const [projected, setProjected] = useState<ProjectedCallout[]>([])
  const projector = useMemo(() => new CalloutProjector(setProjected), [])
  return { projected, projector }
}
```

- [ ] **Step 7: Correr pruebas**

Run: `npx vitest run src/features/three/three.test.ts` → PASS. Luego `npx tsc -b` → sin errores.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/three
git commit -m "feat(three): colocar STL sin alterar coordenadas y proyectar callouts con oclusión limitada"
```

---

### Task 4: StlViewer con callouts y selección sobre la malla; API cliente

**Files:**
- Modify: `frontend/src/components/ui/Callout.tsx`
- Modify: `frontend/src/components/ui/callout.test.tsx`
- Create: `frontend/src/features/prototypes/pick.ts`
- Create: `frontend/src/features/prototypes/pick.test.ts`
- Modify: `frontend/src/features/prototypes/StlViewer.tsx`
- Modify: `frontend/src/features/prototypes/api.ts`
- Modify: `frontend/src/features/prototypes/prototypes.test.tsx` (solo fixtures)

**Interfaces:**
- Consumes: Task 3 (`placeModel`, `toModel`, `useProjectedCallouts`, `ViewerHotspot`, `ModelPoint`).
- Produces:
  - `Callout` acepta `index?: number` (en < 640 px muestra solo el número) y `title?: string`.
  - `isClick(start: {x, y} | null, end: {x, y}, tolerance = PICK_TOLERANCE_PX): boolean`, `PICK_TOLERANCE_PX = 5`.
  - `StlViewerProps` añade `hotspots?: ViewerHotspot[]` y `onPick?: (point: ModelPoint) => void`.
  - `api.ts`: `Hotspot`, `HotspotCreateInput`, `HotspotUpdateInput`, `PublicHotspot`, `PublicPrototypeDetail.hotspots: PublicHotspot[]`, `MAX_HOTSPOTS = 12`, `prototypesApi.listHotspots(id)`, `createHotspot(id, input)`, `updateHotspot(id, hid, data)`, `removeHotspot(id, hid)`.

- [ ] **Step 1: Pruebas que fallan**

Añadir a `frontend/src/components/ui/callout.test.tsx`:

```tsx
it('con índice muestra el número para móvil y oculta línea y etiqueta en pantallas chicas', () => {
  render(<Callout x={0} y={0} label="Bomba" index={3} title="Riego por goteo" />)
  const number = screen.getByText('3')
  expect(number.className).toContain('sm:hidden')
  const label = screen.getByText('Bomba')
  expect(label.className).toContain('hidden')
  expect(label.className).toContain('sm:inline-block')
  expect(label).toHaveAttribute('title', 'Riego por goteo')
})
```

Crear `frontend/src/features/prototypes/pick.test.ts`:

```ts
import { expect, it } from 'vitest'
import { isClick, PICK_TOLERANCE_PX } from './pick'

it('un clic sin arrastre cuenta como selección', () => {
  expect(isClick({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(true)
})

it('arrastrar para girar no cuenta como selección', () => {
  expect(isClick({ x: 10, y: 10 }, { x: 10 + PICK_TOLERANCE_PX + 1, y: 10 })).toBe(false)
})

it('sin pointerdown previo no hay selección', () => {
  expect(isClick(null, { x: 0, y: 0 })).toBe(false)
})
```

Run (en `frontend/`): `npx vitest run src/components/ui/callout.test.tsx src/features/prototypes/pick.test.ts` → FAIL.

- [ ] **Step 2: Callout con número**

Reemplazar `frontend/src/components/ui/Callout.tsx` por:

```tsx
import { ReactNode } from 'react'
import { cx } from './cx'

interface Props {
  x: number
  y: number
  label: string
  side?: 'left' | 'right'
  dimmed?: boolean
  lineLength?: number
  /** Si se da, en pantallas chicas el callout se reduce a este número (la leyenda va fuera). */
  index?: number
  title?: string
  children?: ReactNode
}

/** Punto + línea + etiqueta. El punto queda exactamente en (x, y) del contenedor relativo. */
export function Callout({ x, y, label, side = 'right', dimmed, lineLength = 44, index, title, children }: Props) {
  const numbered = index !== undefined
  return (
    <div
      data-testid="callout"
      className={cx(
        'pointer-events-none absolute flex items-center transition-opacity',
        side === 'left' && 'flex-row-reverse',
        dimmed && 'opacity-35',
      )}
      style={{ left: `${x}px`, top: `${y}px`, transform: side === 'left' ? 'translate(calc(-100% + 5px), -50%)' : 'translate(-5px, -50%)' }}
    >
      {numbered && (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime text-[10px] font-bold text-ink sm:hidden">
          {index}
        </span>
      )}
      <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full border-2 border-ink bg-lime', numbered && 'hidden sm:block')} />
      <span className={cx('h-px shrink-0 bg-ink/70', numbered && 'hidden sm:block')} style={{ width: lineLength }} />
      <span
        title={title}
        className={cx(
          'pointer-events-auto max-w-[220px] rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-ink-fg',
          numbered && 'hidden sm:inline-block',
        )}
      >
        {label}
        {children}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: isClick**

Crear `frontend/src/features/prototypes/pick.ts`:

```ts
/** Distancia máxima entre pointerdown y pointerup para que cuente como clic y no como giro. */
export const PICK_TOLERANCE_PX = 5

export function isClick(
  start: { x: number; y: number } | null,
  end: { x: number; y: number },
  tolerance = PICK_TOLERANCE_PX,
): boolean {
  return start !== null && Math.hypot(end.x - start.x, end.y - start.y) <= tolerance
}
```

Run: `npx vitest run src/components/ui/callout.test.tsx src/features/prototypes/pick.test.ts` → PASS.

- [ ] **Step 4: API cliente**

En `frontend/src/features/prototypes/api.ts`:

Añadir tras `AssetUpdateInput`:

```ts
export const MAX_HOTSPOTS = 12

export interface Hotspot {
  id: string
  prototype_id: string
  asset_id: string
  label: string
  description: string
  x: number
  y: number
  z: number
  sort_order: number
  created_at: string
}

export interface HotspotCreateInput {
  asset_id: string
  label: string
  description?: string
  x: number
  y: number
  z: number
  sort_order?: number
}

export type HotspotUpdateInput = Partial<Pick<Hotspot, 'label' | 'description' | 'x' | 'y' | 'z' | 'sort_order'>>
```

En la sección pública, antes de `PublicPrototypeSummary`:

```ts
export interface PublicHotspot {
  label: string
  description: string
  x: number
  y: number
  z: number
  sort_order: number
}
```

En `PublicPrototypeDetail` añadir `hotspots: PublicHotspot[]`.

En `prototypesApi`, tras `removeAsset`:

```ts
  listHotspots: (id: string) => api.get<Hotspot[]>(`/prototypes/${id}/hotspots`).then((r) => r.data),
  createHotspot: (id: string, data: HotspotCreateInput) =>
    api.post<Hotspot>(`/prototypes/${id}/hotspots`, data).then((r) => r.data),
  updateHotspot: (id: string, hotspotId: string, data: HotspotUpdateInput) =>
    api.patch<Hotspot>(`/prototypes/${id}/hotspots/${hotspotId}`, data).then((r) => r.data),
  removeHotspot: (id: string, hotspotId: string) => api.delete(`/prototypes/${id}/hotspots/${hotspotId}`),
```

En `frontend/src/features/prototypes/prototypes.test.tsx`, añadir `hotspots: []` a los tres objetos `PublicPrototypeDetail` (el de "muestra visor, especificaciones y galería", el de "muestra el nombre como titular display…" y el de "sin specs no muestra la fila de chips").

- [ ] **Step 5: StlViewer**

En `frontend/src/features/prototypes/StlViewer.tsx`:

Importaciones nuevas (junto a las existentes):

```ts
import { Callout } from '@/components/ui'
import { placeModel, toModel } from '@/features/three/model'
import type { ModelPoint, ViewerHotspot } from '@/features/three/types'
import { useProjectedCallouts } from '@/features/three/useProjectedCallouts'
import { isClick } from './pick'
```

Props:

```ts
export interface StlViewerProps extends BinarySource {
  label?: string
  className?: string
  /** Puntos a mostrar como callouts, en coordenadas crudas del STL. */
  hotspots?: ViewerHotspot[]
  /** Si se da, un clic sobre la malla (sin arrastre) devuelve el punto en coordenadas crudas. */
  onPick?: (point: ModelPoint) => void
}
```

Firma: `export default function StlViewer({ url, authed, label = 'Modelo 3D', className = '', hotspots, onPick }: StlViewerProps)`.

Después de los `useState` existentes y del bloque de tema, añadir:

```ts
  const { projected, projector } = useProjectedCallouts()
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const pointsKey = JSON.stringify(hotspots ?? [])

  useEffect(() => {
    const list: ViewerHotspot[] = JSON.parse(pointsKey)
    projector.setPoints(list.map((h, i) => ({ key: h.key, label: h.label, index: i + 1, x: h.x, y: h.y, z: h.z })))
  }, [pointsKey, projector])

  useEffect(() => {
    const canvas = mountRef.current?.querySelector('canvas')
    if (canvas) canvas.style.cursor = onPick ? 'crosshair' : ''
  }, [onPick, phase])
```

Dentro del efecto principal:

1. Junto a `let material ... let grid ...` declarar `let mesh: THREE.Mesh | null = null`.
2. En `tick`, reemplazar la línea de `autoRotate` y añadir la proyección:

```ts
      controls.autoRotate = playingRef.current && !onPickRef.current && !interacting && performance.now() >= resumeAt
      controls.update()
      if (mesh) projector.update(camera, mesh, mount.clientWidth || 1, mount.clientHeight || 1, performance.now())
      renderer.render(scene, camera)
```

3. Antes de `const disposables`, añadir la selección:

```ts
    const pickRay = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null
    const onPointerDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
    }
    const onPointerUp = (e: PointerEvent) => {
      const start = downAt
      downAt = null
      if (!mesh || !onPickRef.current || !isClick(start, { x: e.clientX, y: e.clientY })) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      pickRay.setFromCamera(pointer, camera)
      const hit = pickRay.intersectObject(mesh, false)[0]
      if (hit) onPickRef.current(toModel(mesh, hit.point))
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
```

4. En el `.then` de la carga, reemplazar desde `geometry.rotateX(-Math.PI / 2)` hasta `disposables.push(geometry, material)` por:

```ts
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
        material = new THREE.MeshStandardMaterial({ color: palette.mesh, metalness: 0.35, roughness: 0.45 })
        const placed = placeModel(geometry, material)
        mesh = placed.mesh
        const radius = placed.radius
        const floorY = placed.floorY
        scene.add(mesh)
        disposables.push(geometry, material)
```

(Se eliminan `geometry.rotateX`, `geometry.center()`, `computeBoundingBox` y el `const material`/`const mesh` anteriores; el resto —cuadrícula, cámara, niebla— sigue usando `radius` y `floorY`.)

5. En el cleanup, antes de `controls.dispose()`:

```ts
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
```

En el JSX, después del `<div ref={mountRef} … />`, añadir la capa de callouts:

```tsx
      {phase === 'ready' && projected.length > 0 && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {projected.map((c) => {
            if (c.hidden) return null
            const source = hotspots?.find((h) => h.key === c.key)
            return (
              <Callout
                key={c.key}
                x={c.x}
                y={c.y}
                side={c.side}
                dimmed={c.dimmed}
                label={c.label}
                index={c.index}
                title={source?.description || undefined}
              />
            )
          })}
        </div>
      )}
```

Y en la barra inferior (`phase === 'ready'`), cambiar el texto de ayuda por:

```tsx
          <span className="font-sans text-[10px] text-muted">
            {onPick ? 'Haz clic sobre el modelo para colocar el punto' : 'Arrastra para girar · rueda para acercar'}
          </span>
```

- [ ] **Step 6: Verificar**

Run (en `frontend/`): `npx tsc -b && npx vitest run && npm run build`
Expected: todo PASS. Luego comprobar que three no entró al bundle principal:

```bash
grep -l "WebGLRenderer" dist/assets/index-*.js || echo "OK: three fuera del bundle principal"
```

Expected: `OK: three fuera del bundle principal`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(prototypes): StlViewer pinta callouts que siguen la cámara y permite elegir un punto sobre la malla"
```

---

### Task 5: Editor de puntos en el admin

**Files:**
- Create: `frontend/src/features/prototypes/HotspotEditor.tsx`
- Modify: `frontend/src/features/prototypes/PrototypeAdminDetailPage.tsx`
- Test: `frontend/src/features/prototypes/hotspots.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`prototypesApi.*Hotspot*`, `Hotspot`, `MAX_HOTSPOTS`, `StlViewer` con `hotspots`/`onPick`).
- Produces: `ModelPreview({ prototypeId, asset, canEdit })` — tarjeta con visor y editor; reemplaza la tarjeta "Vista previa 3D" de `AssetsPanel`.

- [ ] **Step 1: Pruebas que fallan**

Crear `frontend/src/features/prototypes/hotspots.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { Asset, Hotspot, prototypesApi } from './api'
import { ModelPreview } from './HotspotEditor'

vi.mock('./LazyStlViewer', () => ({
  StlViewer: ({ hotspots, onPick }: { hotspots?: { label: string }[]; onPick?: (p: { x: number; y: number; z: number }) => void }) => (
    <div data-testid="stl-viewer">
      <span data-testid="viewer-points">{(hotspots ?? []).map((h) => h.label).join('|')}</span>
      {onPick && (
        <button type="button" onClick={() => onPick({ x: 1, y: 2, z: 3 })}>
          clic en la malla
        </button>
      )}
    </div>
  ),
}))

const asset: Asset = {
  id: 'stl1',
  prototype_id: 'p1',
  kind: 'model_stl',
  filename: 'carcasa.stl',
  content_type: 'model/stl',
  size_bytes: 10,
  checksum_sha256: 'x',
  caption: '',
  is_public: true,
  sort_order: 0,
  created_at: '2026-10-20T00:00:00Z',
}

function hs(id: string, label: string, sort_order: number, asset_id = 'stl1'): Hotspot {
  return { id, prototype_id: 'p1', asset_id, label, description: '', x: 0, y: 0, z: 0, sort_order, created_at: '' }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

it('agrega un punto: clic en la malla, etiqueta y guardar', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValueOnce([]).mockResolvedValueOnce([hs('h1', 'LED', 0)])
  const create = vi.spyOn(prototypesApi, 'createHotspot').mockResolvedValue(hs('h1', 'LED', 0))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar punto' }))
  expect(screen.getByText('Haz clic sobre el modelo para colocar el punto.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'clic en la malla' }))
  fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'LED' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar punto' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith('p1', { asset_id: 'stl1', label: 'LED', description: '', x: 1, y: 2, z: 3 }),
  )
  const list = await screen.findByRole('list', { name: 'Puntos del modelo' })
  expect(within(list).getByText('LED')).toBeInTheDocument()
})

it('muestra solo los puntos de este modelo pero cuenta todos para el límite', async () => {
  const many = Array.from({ length: 12 }, (_, i) => hs(`h${i}`, `P${i}`, i, i < 2 ? 'stl1' : 'otro'))
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue(many)
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  expect(await screen.findByText('12 / 12 puntos')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Agregar punto' })).toBeDisabled()
  expect(screen.getByText('Máximo 12 puntos por prototipo.')).toBeInTheDocument()
  expect(screen.getByTestId('viewer-points')).toHaveTextContent('P0|P1')
})

it('reordena intercambiando sort_order con el vecino', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0), hs('b', 'Dos', 1)])
  const update = vi.spyOn(prototypesApi, 'updateHotspot').mockResolvedValue(hs('b', 'Dos', 0))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Subir Dos' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
  expect(update).toHaveBeenCalledWith('p1', 'b', { sort_order: 0 })
  expect(update).toHaveBeenCalledWith('p1', 'a', { sort_order: 1 })
})

it('borra tras confirmar', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0)])
  const remove = vi.spyOn(prototypesApi, 'removeHotspot').mockResolvedValue({} as never)
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Uno' }))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación de Uno' }))
  await waitFor(() => expect(remove).toHaveBeenCalledWith('p1', 'a'))
})

it('muestra el error del servidor y conserva el formulario', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([])
  vi.spyOn(prototypesApi, 'createHotspot').mockRejectedValue(new Error('x'))
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar punto' }))
  fireEvent.click(screen.getByRole('button', { name: 'clic en la malla' }))
  fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: 'LED' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar punto' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar el punto')
  expect(screen.getByLabelText('Etiqueta')).toHaveValue('LED')
})

it('el viewer solo lee', async () => {
  vi.spyOn(prototypesApi, 'listHotspots').mockResolvedValue([hs('a', 'Uno', 0)])
  render(<ModelPreview prototypeId="p1" asset={asset} canEdit={false} />)
  const list = await screen.findByRole('list', { name: 'Puntos del modelo' })
  expect(within(list).getByText('Uno')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Agregar punto' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Eliminar Uno' })).toBeNull()
})
```

Run (en `frontend/`): `npx vitest run src/features/prototypes/hotspots.test.tsx` → FAIL (no existe el módulo).

- [ ] **Step 2: Componente**

Crear `frontend/src/features/prototypes/HotspotEditor.tsx`:

```tsx
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/api/client'
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui'
import type { ModelPoint } from '@/features/three/types'
import { Asset, Hotspot, internalFilePath, MAX_HOTSPOTS, prototypesApi } from './api'
import { StlViewer } from './LazyStlViewer'

type Mode = { kind: 'idle' } | { kind: 'picking' } | { kind: 'new'; point: ModelPoint } | { kind: 'edit'; id: string }

interface FormValues {
  label: string
  description: string
}

/** Vista previa 3D del STL con el editor de puntos (hotspots) del prototipo. */
export function ModelPreview({ prototypeId, asset, canEdit }: { prototypeId: string; asset: Asset; canEdit: boolean }) {
  const [hotspots, setHotspots] = useState<Hotspot[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setHotspots(await prototypesApi.listHotspots(prototypeId))
    } catch (err) {
      setLoadError(errorMessage(err, 'No se pudieron cargar los puntos'))
    }
  }, [prototypeId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setMode({ kind: 'idle' })
  }, [asset.id])

  const all = hotspots ?? []
  const own = all.filter((h) => h.asset_id === asset.id)
  const atLimit = all.length >= MAX_HOTSPOTS

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setMode({ kind: 'idle' })
      setConfirming(null)
      await load()
    } catch (err) {
      setActionError(errorMessage(err, fallback))
    } finally {
      setBusy(false)
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const a = own[index]
    const b = own[index + dir]
    if (!a || !b) return
    const aSort = a.sort_order === b.sort_order ? b.sort_order + dir : b.sort_order
    void run(async () => {
      await prototypesApi.updateHotspot(prototypeId, a.id, { sort_order: aSort })
      if (b.sort_order !== a.sort_order) await prototypesApi.updateHotspot(prototypeId, b.id, { sort_order: a.sort_order })
    }, 'No se pudo reordenar')
  }

  const viewerHotspots = [
    ...own.map((h) => ({ key: h.id, label: h.label, description: h.description, x: h.x, y: h.y, z: h.z })),
    ...(mode.kind === 'new' ? [{ key: 'nuevo', label: 'Nuevo punto', ...mode.point }] : []),
  ]

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">Vista previa 3D</h2>
        {hotspots && (
          <Badge tone={atLimit ? 'warning' : 'neutral'}>
            {all.length} / {MAX_HOTSPOTS} puntos
          </Badge>
        )}
      </div>
      <StlViewer
        key={asset.id}
        url={internalFilePath(prototypeId, asset.id)}
        authed
        label={`Modelo 3D ${asset.filename}`}
        hotspots={viewerHotspots}
        onPick={mode.kind === 'picking' ? (point) => setMode({ kind: 'new', point }) : undefined}
        className="h-72 w-full"
      />
      <p className="truncate text-xs text-muted">{asset.caption || asset.filename}</p>

      {canEdit && hotspots && mode.kind !== 'new' && (
        <div className="flex flex-wrap items-center gap-2">
          {mode.kind === 'picking' ? (
            <>
              <p role="status" className="text-sm text-fg">
                Haz clic sobre el modelo para colocar el punto.
              </p>
              <Button variant="ghost" onClick={() => setMode({ kind: 'idle' })}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" disabled={atLimit || busy} onClick={() => setMode({ kind: 'picking' })}>
                Agregar punto
              </Button>
              {atLimit && <p className="text-xs text-muted">Máximo {MAX_HOTSPOTS} puntos por prototipo.</p>}
            </>
          )}
        </div>
      )}

      {mode.kind === 'new' && (
        <HotspotForm
          initial={{ label: '', description: '' }}
          submitLabel="Guardar punto"
          busy={busy}
          onCancel={() => setMode({ kind: 'idle' })}
          onSubmit={(v) =>
            run(
              () => prototypesApi.createHotspot(prototypeId, { asset_id: asset.id, ...v, ...mode.point }),
              'No se pudo guardar el punto',
            )
          }
        />
      )}

      {actionError && (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      )}

      {loadError ? (
        <div role="alert" className="flex items-center gap-3 text-sm text-danger">
          {loadError}
          <Button variant="ghost" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : hotspots === null ? (
        <p className="text-xs text-muted">Cargando puntos…</p>
      ) : own.length === 0 ? (
        <p className="text-sm text-muted">Sin puntos en este modelo.</p>
      ) : (
        <ol aria-label="Puntos del modelo" className="divide-y divide-border/60">
          {own.map((h, i) =>
            mode.kind === 'edit' && mode.id === h.id ? (
              <li key={h.id} className="py-3">
                <HotspotForm
                  initial={{ label: h.label, description: h.description }}
                  submitLabel="Guardar cambios"
                  busy={busy}
                  onCancel={() => setMode({ kind: 'idle' })}
                  onSubmit={(v) => run(() => prototypesApi.updateHotspot(prototypeId, h.id, v), 'No se pudo actualizar el punto')}
                />
              </li>
            ) : (
              <li key={h.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-ink-fg">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{h.label}</p>
                  {h.description && <p className="text-xs text-muted">{h.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" className="!px-2 !py-1" aria-label={`Subir ${h.label}`} disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1"
                      aria-label={`Bajar ${h.label}`}
                      disabled={i === own.length - 1 || busy}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </Button>
                    <Button variant="ghost" className="!px-3 !py-1 text-xs" disabled={busy} onClick={() => setMode({ kind: 'edit', id: h.id })}>
                      Editar
                    </Button>
                    {confirming === h.id ? (
                      <Button
                        variant="danger"
                        className="!px-3 !py-1 text-xs"
                        aria-label={`Confirmar eliminación de ${h.label}`}
                        loading={busy}
                        onClick={() => run(() => prototypesApi.removeHotspot(prototypeId, h.id), 'No se pudo eliminar el punto')}
                      >
                        Confirmar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="!px-3 !py-1 text-xs text-danger"
                        aria-label={`Eliminar ${h.label}`}
                        disabled={busy}
                        onClick={() => setConfirming(h.id)}
                      >
                        Eliminar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </Card>
  )
}

function HotspotForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: FormValues
  submitLabel: string
  busy: boolean
  onSubmit: (values: FormValues) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial.label)
  const [description, setDescription] = useState(initial.description)
  const trimmed = label.trim()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (trimmed) onSubmit({ label: trimmed, description: description.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border/60 p-3">
      <Field label="Etiqueta" hint="Máximo 60 caracteres">
        {(id, describedBy) => (
          <Input id={id} aria-describedby={describedBy} value={label} maxLength={60} required autoFocus onChange={(e) => setLabel(e.target.value)} />
        )}
      </Field>
      <Field label="Descripción (opcional)">
        {(id) => <Textarea id={id} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={busy} disabled={!trimmed}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Usarlo en el admin**

En `frontend/src/features/prototypes/PrototypeAdminDetailPage.tsx`:

- Añadir `import { ModelPreview } from './HotspotEditor'`.
- En `AssetsPanel`, reemplazar el bloque completo `{preview && ( <Card className="space-y-3 p-4"> … </Card> )}` por:

```tsx
      {preview && <ModelPreview prototypeId={data.id} asset={preview} canEdit={canEdit} />}
```

- Si tras el cambio `StlViewer` o `internalFilePath` quedan sin uso en este archivo, quitarlos de las importaciones (tsc con `noUnusedLocals` lo señalará).

- [ ] **Step 4: Verificar**

Run (en `frontend/`): `npx vitest run src/features/prototypes && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/prototypes
git commit -m "feat(prototypes): editor de puntos sobre el STL en el admin con límite, orden y borrado confirmado"
```

---

### Task 6: Callouts y leyenda en la página pública

**Files:**
- Modify: `frontend/src/features/prototypes/PrototypePublicPage.tsx`
- Modify: `frontend/src/features/prototypes/prototypes.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`PublicPrototypeDetail.hotspots`, `StlViewer` con `hotspots`).
- Produces: nada para otras tareas.

- [ ] **Step 1: Pruebas que fallan**

En `frontend/src/features/prototypes/prototypes.test.tsx`, cambiar el mock del visor para exponer los puntos:

```tsx
vi.mock('./LazyStlViewer', () => ({
  StlViewer: ({ label, hotspots }: { label: string; hotspots?: { label: string }[] }) => (
    <div data-testid="stl-viewer">
      {label}
      <span data-testid="viewer-points">{(hotspots ?? []).map((h) => h.label).join('|')}</span>
    </div>
  ),
}))
```

Y añadir al final:

```tsx
describe('PrototypePublicPage hotspots', () => {
  const base: PublicPrototypeDetail = {
    slug: 'ecos',
    name: 'Germinador ECOS',
    codename: null,
    purpose: '',
    summary: '',
    status: 'testing',
    published_at: null,
    hero: null,
    description: '',
    specs: [],
    assets: [
      { id: 'm1', kind: 'model_stl', filename: 'a.stl', content_type: 'model/stl', size_bytes: 1, caption: 'Principal', url: '/a' },
      { id: 'm2', kind: 'model_stl', filename: 'b.stl', content_type: 'model/stl', size_bytes: 1, caption: 'Tapa', url: '/b' },
    ],
    hotspots: [
      { label: 'LED espectro completo', description: 'Luz para germinar', x: 0, y: 0, z: 1, sort_order: 0 },
      { label: 'Sensor de humedad', description: '', x: 1, y: 0, z: 0, sort_order: 1 },
    ],
  }

  function renderEcos(detail: PublicPrototypeDetail) {
    vi.spyOn(prototypesApi, 'publicDetail').mockResolvedValue(detail)
    render(
      <MemoryRouter initialEntries={['/prototipos/ecos']}>
        <Routes>
          <Route path="/prototipos/:slug" element={<PrototypePublicPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('pasa los puntos al visor del modelo principal y muestra la leyenda numerada', async () => {
    renderEcos(base)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByTestId('viewer-points')).toHaveTextContent('LED espectro completo|Sensor de humedad')
    const legend = screen.getByRole('list', { name: 'Puntos del modelo' })
    const items = within(legend).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('1')
    expect(items[0]).toHaveTextContent('LED espectro completo')
    expect(items[0]).toHaveTextContent('Luz para germinar')
  })

  it('al cambiar a otro modelo quita puntos y leyenda', async () => {
    renderEcos(base)
    fireEvent.click(await screen.findByRole('button', { name: 'Tapa' }))
    expect(screen.getByTestId('viewer-points').textContent).toBe('')
    expect(screen.queryByRole('list', { name: 'Puntos del modelo' })).toBeNull()
  })

  it('sin puntos no hay leyenda', async () => {
    renderEcos({ ...base, hotspots: [] })
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('list', { name: 'Puntos del modelo' })).toBeNull()
  })
})
```

Añadir `within` a la importación de `@testing-library/react` al inicio del archivo.

Run: `npx vitest run src/features/prototypes/prototypes.test.tsx` → FAIL.

- [ ] **Step 2: Implementación**

En `frontend/src/features/prototypes/PrototypePublicPage.tsx`, dentro de `Detail`, después de `const model = …`:

```tsx
  // Los puntos públicos pertenecen al STL principal (el primero); otros modelos se ven sin callouts.
  const showHotspots = model !== undefined && model.id === models[0]?.id && data.hotspots.length > 0
  const viewerHotspots = showHotspots
    ? data.hotspots.map((h, i) => ({ key: `h${i}`, label: h.label, description: h.description, x: h.x, y: h.y, z: h.z }))
    : undefined
```

Pasar `hotspots={viewerHotspots}` al `<StlViewer … />` existente.

Inmediatamente después del `</div>` que cierra `<div className="glass overflow-hidden p-2">`, añadir la leyenda (visible en móvil, solo para lectores de pantalla en ≥ 640 px, donde las etiquetas ya están sobre el modelo):

```tsx
              {showHotspots && (
                <ol aria-label="Puntos del modelo" className="mt-4 space-y-2 sm:sr-only">
                  {data.hotspots.map((h, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime text-[10px] font-bold text-ink">
                        {i + 1}
                      </span>
                      <span>
                        <span className="font-semibold">{h.label}</span>
                        {h.description && <span className="text-muted"> — {h.description}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
```

- [ ] **Step 3: Verificar**

Run (en `frontend/`): `npx vitest run && npx tsc -b && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/prototypes
git commit -m "feat(prototypes): callouts del STL principal en la página pública con leyenda numerada en móvil"
```

---

### Task 7: README, verificación de cierre de fase

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Checklist**

En la sección "real / simulado / pendiente" de `README.md`, mover "Callouts sobre el modelo 3D (V2)" (o la línea equivalente que lo marque pendiente) a **Real**, con el texto: "Puntos etiquetados sobre modelos STL: editor en el admin (máx. 12 por prototipo) y callouts que siguen la rotación en la página pública; en móvil se muestran numerados con leyenda." Si no existe la línea, añadirla en **Real**.

- [ ] **Step 2: Suites completas**

```bash
~/.venvs/harvestt/bin/python -m pytest -q -p no:warnings
cd frontend && npx tsc -b && npx vitest run && npm run build
```

Expected: todo PASS; three en su chunk aparte.

- [ ] **Step 3: Smoke del contenedor con Postgres**

Levantar Postgres 17 y la imagen (`docker build -t harvestt-cortex .`), arrancar con `DATABASE_URL` hacia ese Postgres, entrar como admin del seed, crear un prototipo público, subir un STL público, colocar dos puntos desde el admin y abrir `/prototipos/<slug>`.

Expected: el contenedor aplica `0004` al arrancar; los callouts aparecen sobre el modelo, siguen la rotación, se atenúan al quedar detrás; a 375 px se ven números y la leyenda debajo.

- [ ] **Step 4: Revisión visual**

Capturas en claro 1280, oscuro 1280 y claro 375 de `/prototipos/<slug>` y del admin del prototipo (con el contenedor de Playwright `mcr.microsoft.com/playwright:v1.49.0-jammy`, `--network host`). Revisar: sin scroll horizontal, callouts legibles en ambos temas, leyenda en móvil.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: hotspots de prototipos pasan a real en el checklist (V2)"
```

Merge a `main` y despliegue: **solo con autorización explícita del usuario en esta fase**.
