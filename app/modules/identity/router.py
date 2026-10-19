from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.core.security import create_access_token
from app.modules.identity import service
from app.modules.identity.models import User
from app.modules.identity.schemas import LoginRequest, MeOut, MembershipOut, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _read_credentials(request: Request) -> LoginRequest:
    # Acepta JSON (frontend) o form-urlencoded (OAuth2 / Swagger)
    if request.headers.get("content-type", "").startswith("application/json"):
        data = await request.json()
    else:
        form = await request.form()
        data = {"email": form.get("username") or form.get("email"), "password": form.get("password")}
    try:
        return LoginRequest.model_validate(data)
    except Exception:
        raise AppError(422, "invalid_input", "Correo o contraseña con formato inválido")


@router.post("/login", response_model=TokenOut)
async def login(request: Request, db: Session = Depends(get_db)):
    creds = await _read_credentials(request)
    user = service.authenticate(db, creds.email, creds.password)
    if user is None:
        raise AppError(401, "invalid_credentials", "Correo o contraseña incorrectos")
    return TokenOut(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
        memberships=[MembershipOut.model_validate(m) for m in service.active_memberships(user)],
    )


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(
        user=UserOut.model_validate(user),
        memberships=[MembershipOut.model_validate(m) for m in service.active_memberships(user)],
    )
