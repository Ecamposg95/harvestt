import time
from collections import defaultdict, deque

from fastapi import Request

from app.core.errors import AppError


class RateLimiter:
    """Limitador en memoria de ventana deslizante, por clave (IP). Solo para rutas anónimas puntuales."""

    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        if len(self._hits) > 10_000:  # acota la memoria ante muchas IP distintas
            for k in [k for k, v in self._hits.items() if not v or now - v[-1] >= self.window]:
                del self._hits[k]
        return True

    def reset(self) -> None:
        self._hits.clear()


request_limiter = RateLimiter(limit=5, window_seconds=600)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"


def limit_public_requests(request: Request) -> None:
    if not request_limiter.check(client_ip(request)):
        raise AppError(429, "rate_limited", "Demasiadas solicitudes; intenta de nuevo en unos minutos")
