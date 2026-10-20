from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

import app.models_registry  # noqa: F401
from app.core.config import settings
from app.core.db import get_db
from app.core.errors import install_error_handling
from app.modules.catalog.router import router as catalog_router
from app.modules.home.router import router as home_router
from app.modules.identity.router import router as identity_router
from app.modules.projects.router import router as projects_router
from app.modules.prototypes.router import router as prototypes_router
from app.modules.studio.router import router as studio_router

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_app() -> FastAPI:
    settings.validate()
    app = FastAPI(title="HarvestT Cortex", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    install_error_handling(app)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    api = APIRouter(prefix="/api/v1")

    @api.get("/health/live", tags=["health"])
    def live():
        return {"status": "ok"}

    @api.get("/health/ready", tags=["health"])
    def ready(db: Session = Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse({"status": "unavailable", "database": "down"}, status_code=503)
        return {"status": "ok", "database": "up"}

    for router in (identity_router, catalog_router, projects_router, prototypes_router, home_router, studio_router):
        api.include_router(router)
    app.include_router(api)

    _mount_spa(app)
    return app


def _mount_spa(app: FastAPI) -> None:
    if not FRONTEND_DIST.exists():
        return
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    index = FRONTEND_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"error": {"code": "not_found", "message": "Ruta no encontrada"}}, status_code=404)
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
