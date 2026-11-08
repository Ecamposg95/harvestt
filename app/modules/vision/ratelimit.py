import threading
import time
from collections import OrderedDict, deque

from fastapi import Request

from app.core.errors import AppError


class RateLimiter:
    """Limitador en memoria de ventana deslizante por clave (IP). Solo para rutas anónimas puntuales.

    Seguro entre hilos (FastAPI ejecuta dependencias síncronas en un pool) y con memoria acotada:
    al superar `max_keys` se descarta la clave usada hace más tiempo (LRU). Vive en el proceso:
    se reinicia en cada despliegue y no se comparte entre réplicas.
    """

    def __init__(self, limit: int, window_seconds: float, max_keys: int = 10_000):
        self.limit = limit
        self.window = window_seconds
        self.max_keys = max_keys
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.pop(key, None) or deque()
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            allowed = len(hits) < self.limit
            if allowed:
                hits.append(now)
            self._hits[key] = hits  # al final: la más reciente
            while len(self._hits) > self.max_keys:
                self._hits.popitem(last=False)
            return allowed

    def __len__(self) -> int:
        return len(self._hits)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


request_limiter = RateLimiter(limit=5, window_seconds=600)


def client_ip(request: Request) -> str:
    """IP del cliente que no puede elegir el propio cliente.

    1. `X-Real-IP`: el proxy de Railway lo sobrescribe en cada petición con la IP remota.
    2. Si falta, la entrada más a la derecha de `X-Forwarded-For`: la añade el último proxy; las de
       la izquierda las puede inventar el cliente.
    3. Si no hay encabezados, la IP de la conexión.
    No se usa `request.client.host` cuando hay encabezados: con `--forwarded-allow-ips '*'` uvicorn
    la toma de la entrada más a la izquierda, que es falsificable.
    """
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    if hops:
        return hops[-1]
    return request.client.host if request.client else "unknown"


def limit_public_requests(request: Request) -> None:
    if not request_limiter.check(client_ip(request)):
        raise AppError(429, "rate_limited", "Demasiadas solicitudes; intenta de nuevo en unos minutos")
