"""Normalización de etiquetas para comparar grafías (sin acentos, minúsculas, espacios colapsados)."""
import unicodedata


def normalize_label(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(stripped.casefold().split())
