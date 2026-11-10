from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints

from app.modules.ontology.models import DOMAINS, MATCH_TYPES, SCHEMES

DomainLiteral = Literal[DOMAINS]  # type: ignore[valid-type]
MatchLiteral = Literal[MATCH_TYPES]  # type: ignore[valid-type]
SchemeLiteral = Literal[SCHEMES]  # type: ignore[valid-type]

Alias = Annotated[str, Field(min_length=1, max_length=60)]


class EquivalenceIn(BaseModel):
    scheme: SchemeLiteral
    external_id: str = Field(min_length=1, max_length=120)
    url: HttpUrl
    external_label: str | None = Field(default=None, max_length=200)
    match: MatchLiteral


class EquivalenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scheme: str
    external_id: str
    url: str
    external_label: str | None
    match: str


class TermProposal(BaseModel):
    domain: DomainLiteral
    parent_id: str | None = None
    label: str = Field(min_length=2, max_length=120)
    definition: str = Field(min_length=10, max_length=2000)
    aliases: list[Alias] = Field(default_factory=list, max_length=10)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    equivalences: list[EquivalenceIn] = Field(default_factory=list, max_length=10)


class TermEdit(BaseModel):
    parent_id: str | None = None
    label: str | None = Field(default=None, min_length=2, max_length=120)
    definition: str | None = Field(default=None, min_length=10, max_length=2000)
    aliases: list[Alias] | None = Field(default=None, max_length=10)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    equivalences: list[EquivalenceIn] | None = Field(default=None, max_length=10)


class TermSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    hvt_id: str | None
    domain: str
    parent_id: str | None
    label: str
    status: str
    unit: str | None


class TermDetail(TermSummary):
    definition: str
    aliases: list[str]
    equivalences: list[EquivalenceOut]
    parent: TermSummary | None
    children: list[TermSummary]
    replaced_by: TermSummary | None
    proposed_by_name: str
    review_note: str | None
    reviewed_at: datetime | None
    published_in_version: int | None
    obsoleted_in_version: int | None


class SuggestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scheme: str
    external_id: str
    label: str
    url: str


Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class ReviewIn(BaseModel):
    action: Literal["approve", "request_changes", "reject"]
    note: Note


class ObsoleteIn(BaseModel):
    replaced_by_id: str
    note: Note


class EquivalencesIn(BaseModel):
    equivalences: list[EquivalenceIn] = Field(max_length=10)
    note: Note


class ReleaseOut(BaseModel):
    version: int
    note: str
    created_at: datetime
    term_count: int
