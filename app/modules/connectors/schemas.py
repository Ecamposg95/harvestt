from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CopyOut(BaseModel):
    status: str
    external_id: str | None = None
    payload: dict
    license: str | None = None
    attribution: str | None = None
    source_url: str | None = None
    fetched_at: datetime | None = None
    last_attempt_at: datetime
    last_error: str | None = None
    stale: bool
    reason: str | None = None


class BankSourceOut(BaseModel):
    key: str
    label: str
    contribution: str
    status: str
    license_summary: str
    model_config = ConfigDict(populate_by_name=True)

    copy_: CopyOut | None = Field(default=None, alias="copy")


class IdentityOut(BaseModel):
    key: str
    value: str | None = None
    url: str | None = None
    check: str
    detail: str | None = None


class BanksOut(BaseModel):
    species_id: str
    sources: list[BankSourceOut]
    identity: list[IdentityOut]


class LastSyncOut(BaseModel):
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    species_total: int
    species_ok: int
    error: str | None = None


class CopiesCount(BaseModel):
    ok: int
    not_found: int
    stale: int


class ConnectorOut(BaseModel):
    key: str
    label: str
    contribution: str
    license: str
    url: str
    status: str
    can_sync: bool
    last_sync: LastSyncOut | None = None
    copies: CopiesCount


class ConnectorSyncOut(BaseModel):
    id: str
    source: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    species_total: int
    species_ok: int
    error: str | None = None

    model_config = {"from_attributes": True}
