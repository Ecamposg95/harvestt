"""Cliente HTTP de solo lectura hacia las fuentes: pausa mínima, tiempo límite y errores sin secretos."""
import json
import time
import urllib.error
import urllib.request
from typing import Any, Callable

USER_AGENT = "HarvestT-connectors/1.0 (+https://harvestt-production.up.railway.app)"
TIMEOUT = 30

Fetcher = Callable[[str, "dict | None"], Any]


class FetchError(Exception):
    """La fuente falló (red, HTTP no 2xx, JSON inválido). El mensaje no lleva cabeceras ni tokens."""


def make_fetcher(min_interval: float, headers: dict[str, str] | None = None) -> Fetcher:
    last_call = [0.0]
    extra = dict(headers or {})

    def fetch(url: str, body: dict | None = None) -> Any:
        wait = min_interval - (time.monotonic() - last_call[0])
        if wait > 0:
            time.sleep(wait)
        req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json", **extra}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=req_headers)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as exc:
            raise FetchError(f"La fuente respondió HTTP {exc.code}") from None
        except TimeoutError:
            raise FetchError("La fuente no respondió a tiempo") from None
        except (urllib.error.URLError, OSError):
            raise FetchError("No se pudo conectar con la fuente") from None
        finally:
            last_call[0] = time.monotonic()
        try:
            return json.loads(raw)
        except ValueError:
            raise FetchError("La fuente devolvió una respuesta que no es JSON válido") from None

    return fetch
