from datetime import datetime, timezone

from app.core.mixins import utcnow


def get_now() -> datetime:
    return utcnow()


def as_utc(value: datetime | None) -> datetime | None:
    """SQLite devuelve fechas sin zona; Postgres, con zona. Todo se compara en UTC consciente."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
