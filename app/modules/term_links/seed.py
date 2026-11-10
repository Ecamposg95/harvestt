"""Relink idempotente: enlaza a términos los datos sembrados. Va al final de SEEDS."""
import logging

from sqlalchemy.orm import Session

from app.modules.term_links.service import relink

log = logging.getLogger(__name__)


def seed(db: Session) -> None:
    counts = relink(db)
    log.info("términos enlazados: %s", counts)
