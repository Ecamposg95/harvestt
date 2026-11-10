from datetime import datetime, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.core import audit
from app.core.config import settings
from app.core.errors import not_found
from app.core.mixins import utcnow
from app.modules.identity.models import User
from app.modules.catalog.models import Species
from app.modules.ontology.models import OntologyTerm
from app.modules.ontology.review import current_version
from app.modules.prototypes.service import public_prototypes
from app.modules.simulation.clock import as_utc
from app.modules.telemetry.models import DEVICE_SIMULATED, SOURCE_SIMULATED, Device, TelemetryReading
from app.modules.vision.models import InboundRequest, Recognition
from app.modules.vision.schemas import RecognitionIn, RequestIn, RequestReview, VisionFigure, VisionLayer, VisionOut, VisionSite


def list_recognitions(db: Session, org_id: str) -> list[Recognition]:
    stmt = (
        select(Recognition)
        .where(Recognition.organization_id == org_id, Recognition.deleted_at.is_(None))
        .order_by(Recognition.sort_order, Recognition.awarded_on)
    )
    return list(db.scalars(stmt))


def create_recognition(db: Session, user: User, org_id: str, data: RecognitionIn) -> Recognition:
    rec = Recognition(organization_id=org_id, **data.model_dump())
    db.add(rec)
    db.flush()
    audit.record(db, None, "recognition", rec.id, "create", {**data.model_dump(mode="json"), "actor_id": user.id})
    db.commit()
    db.refresh(rec)
    return rec


def delete_recognition(db: Session, user: User, rec_id: str) -> None:
    rec = db.get(Recognition, rec_id)
    if rec is None or rec.deleted_at is not None:
        raise not_found("reconocimiento")
    rec.deleted_at = utcnow()
    audit.record(db, None, "recognition", rec.id, "delete", {"actor_id": user.id})
    db.commit()


def round_coord(value: float | None) -> float | None:
    """Redondea a 1 decimal (~ciudad) para no guardar ubicaciones precisas."""
    return None if value is None else round(value, 1)


def create_request(db: Session, data: RequestIn) -> InboundRequest | None:
    if data.website.strip():
        return None  # trampa anti-bots: se descarta sin guardar
    fields = data.model_dump(exclude={"website"})
    fields["lat"] = round_coord(data.lat)
    fields["lon"] = round_coord(data.lon)
    req = InboundRequest(**fields)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def list_requests(db: Session, status: str | None) -> list[InboundRequest]:
    stmt = select(InboundRequest).where(InboundRequest.deleted_at.is_(None))
    if status:
        stmt = stmt.where(InboundRequest.status == status)
    return list(db.scalars(stmt.order_by(InboundRequest.created_at.desc()).limit(200)))


def review_request(db: Session, user: User, req_id: str, review: RequestReview) -> InboundRequest:
    req = db.get(InboundRequest, req_id)
    if req is None or req.deleted_at is not None:
        raise not_found("solicitud")
    req.status = review.status
    req.review_note = review.note
    req.reviewed_by = user.id
    req.reviewed_at = utcnow()
    audit.record(db, None, "inbound_request", req.id, "review",
                 {"status": review.status, "note": review.note, "actor_id": user.id})
    db.commit()
    db.refresh(req)
    return req


OPERATING_WINDOW = timedelta(days=7)


def _operating_nodes(db: Session, org_id: str, now: datetime) -> int:
    """Proyectos con un dispositivo físico vivo que envió una lectura real en la ventana.

    Se aproxima la instalación por proyecto hasta que exista la entidad Node (M5).
    La ventana se acota en SQL para no recorrer todo el historial en una ruta anónima.
    """
    stmt = (
        select(func.count(distinct(TelemetryReading.project_id)))
        .join(Device, Device.id == TelemetryReading.device_id)
        .where(
            Device.organization_id == org_id,
            Device.kind != DEVICE_SIMULATED,
            Device.deleted_at.is_(None),
            TelemetryReading.source != SOURCE_SIMULATED,
            TelemetryReading.observed_at >= as_utc(now) - OPERATING_WINDOW,
        )
    )
    return db.scalar(stmt) or 0


def _knowledge_reason(db: Session) -> str:
    version = current_version(db)
    if version < 1:
        return "Ontología, bancos de plantas y mapa GIS: hito M2–M4."
    terms = db.scalar(select(func.count()).select_from(OntologyTerm).where(
        OntologyTerm.status == "published", OntologyTerm.deleted_at.is_(None),
    )) or 0
    return f"Ontología publicada (versión {version}, {terms} términos). Bancos de plantas y mapa GIS: hitos M3–M4."


def vision_summary(db: Session, org_id: str | None, now: datetime) -> VisionOut:
    prototypes = recognitions = operating = None
    if org_id is not None:
        prototypes = len(public_prototypes(db, org_id))
        recognitions = db.scalar(
            select(func.count()).select_from(Recognition).where(
                Recognition.organization_id == org_id, Recognition.deleted_at.is_(None)
            )
        )
        operating = _operating_nodes(db, org_id, now)

    def num(v: int | None) -> float | None:
        return None if v is None else float(v)

    # 0 reconocimientos registrados significa «sin datos cargados», no «cero medallas».
    recognitions = recognitions or None

    figures = [
        VisionFigure(key="prototypes", label="Prototipos", value=num(prototypes), status="available",
                     origin="measured", formula="Prototipos publicados en la vitrina."),
        VisionFigure(key="operating_nodes", label="Nodos operando", value=num(operating), status="available",
                     origin="measured",
                     formula="Instalaciones con un dispositivo no simulado que envió una lectura real en los últimos "
                             "7 días. Lo simulado no cuenta."),
        VisionFigure(key="signed_readings", label="Lecturas firmadas", value=None, status="soon",
                     origin="missing", formula="Disponible cuando opere la red de confianza (M5)."),
        VisionFigure(key="recognitions", label="Reconocimientos internacionales", value=num(recognitions),
                     status="available", origin="sourced", formula="Reconocimientos registrados con evidencia."),
    ]

    has_species = db.scalar(select(Species.id).where(Species.deleted_at.is_(None)).limit(1)) is not None
    has_history = bool(prototypes) or bool(recognitions)
    layers = [
        VisionLayer(key="history", status="done" if has_history else "vision",
                    reason="Prototipos 2017–2018 y reconocimientos registrados."),
        VisionLayer(key="cortex", status="operating" if has_species else "in_construction",
                    reason="Plataforma en producción con catálogo."),
        VisionLayer(key="knowledge", status="in_construction", reason=_knowledge_reason(db)),
        VisionLayer(key="trust", status="vision", reason="Red de confianza: hito M5."),
        VisionLayer(key="commons", status="vision", reason="harvestt.org: hito M6."),
    ]

    sites = [VisionSite(kind="historic", label=settings.public_origin_label,
                        lat=settings.public_origin_lat, lon=settings.public_origin_lon)]
    stmt = (
        select(InboundRequest)
        .where(
            InboundRequest.kind == "node",
            InboundRequest.status == "approved",
            InboundRequest.deleted_at.is_(None),
            InboundRequest.lat.is_not(None),
            InboundRequest.lon.is_not(None),
        )
        .order_by(InboundRequest.created_at)
    )
    for req in db.scalars(stmt):
        sites.append(VisionSite(kind="future", label=req.city or "Nodo solicitado", lat=req.lat, lon=req.lon))

    return VisionOut(as_of=now, figures=figures, layers=layers, sites=sites)
