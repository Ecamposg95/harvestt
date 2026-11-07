from datetime import date

from sqlalchemy import func, select

from app.modules.identity.models import Organization
from app.modules.vision.models import InboundRequest, Recognition


def test_models_persist_with_defaults(db, tenants):
    org_id = db.scalar(select(Organization.id).where(Organization.slug == "alfa"))
    db.add(Recognition(organization_id=org_id, award="Medalla de Oro", event="ICAN", venue="Toronto, Canadá",
                       awarded_on=date(2018, 9, 1), evidence="Archivo del equipo"))
    db.add(InboundRequest(kind="node", name="Ana", email="ana@example.org", message="Quiero un nodo"))
    db.commit()
    req = db.scalar(select(InboundRequest))
    assert req.status == "pending" and req.lat is None
    assert db.scalar(select(func.count()).select_from(Recognition)) == 1
