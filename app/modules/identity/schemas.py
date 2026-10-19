from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organization: OrganizationOut
    role: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    is_superadmin: bool


class MeOut(BaseModel):
    user: UserOut
    memberships: list[MembershipOut]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    memberships: list[MembershipOut]
