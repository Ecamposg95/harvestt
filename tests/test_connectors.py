import pytest
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.modules.catalog.models import Species
from app.modules.connectors import registry
from app.modules.connectors.models import ConnectorSnapshot
from app.modules.connectors.registry import SOURCES, get_source, source_status
from app.modules.identity.models import Organization
from app.modules.projects.models import CropCycle, Project


def test_registry_order_and_statuses(monkeypatch):
    assert [s.key for s in SOURCES] == ["gbif", "wfo", "wikidata", "genesys", "grin", "cimmyt", "inifap"]
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token=""))
    assert source_status("genesys") == "requires_credentials"
    monkeypatch.setattr(registry, "settings", Settings(genesys_api_token="x"))
    assert source_status("genesys") == "active"
    assert source_status("gbif") == "active"
    assert source_status("grin") == "in_construction"
    assert source_status("cimmyt") == "requires_alliance"
    assert get_source("wfo").label == "World Flora Online"
    with pytest.raises(KeyError):
        get_source("nope")


def _species(db):
    sp = Species(scientific_name="Lactuca sativa")
    db.add(sp)
    db.commit()
    return sp


def test_snapshot_unique_per_source_species(db):
    sp = _species(db)
    from app.core.mixins import utcnow

    for _ in range(2):
        db.add(ConnectorSnapshot(source="gbif", species_id=sp.id, status="ok", payload={}, last_attempt_at=utcnow()))
    with pytest.raises(IntegrityError):
        db.commit()


def test_cycle_accession_ref_defaults_null(db):
    sp = _species(db)
    org = Organization(name="Org", slug="org")
    db.add(org)
    db.commit()
    project = Project(organization_id=org.id, name="P", system="soil")
    db.add(project)
    db.commit()
    cycle = CropCycle(organization_id=org.id, project_id=project.id, species_id=sp.id)
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    assert cycle.accession_ref is None
