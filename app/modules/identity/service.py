from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.modules.identity.models import MEMBERSHIP_ACTIVE, Membership, Organization, User


def normalize_email(email: str) -> str:
    return email.strip().lower()


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(func.lower(User.email) == normalize_email(email)))
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def active_memberships(user: User) -> list[Membership]:
    return [m for m in user.memberships if m.status == MEMBERSHIP_ACTIVE and m.deleted_at is None]


def ensure_organization(db: Session, name: str, slug: str) -> Organization:
    org = db.scalar(select(Organization).where(Organization.slug == slug))
    if org is None:
        org = Organization(name=name, slug=slug)
        db.add(org)
        db.flush()
    return org


def ensure_user(
    db: Session, email: str, password: str, full_name: str = "", is_superadmin: bool = False
) -> User:
    email = normalize_email(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(password),
            is_superadmin=is_superadmin,
        )
        db.add(user)
        db.flush()
    return user


def ensure_membership(db: Session, user: User, org: Organization, role: str) -> Membership:
    m = db.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.organization_id == org.id)
    )
    if m is None:
        m = Membership(user_id=user.id, organization_id=org.id, role=role)
        db.add(m)
        db.flush()
    return m
