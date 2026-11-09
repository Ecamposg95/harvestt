import ast
from pathlib import Path

from app.modules.ontology.models import OntologyTerm
from app.modules.ontology.text import normalize_label


def test_normalize_label():
    assert normalize_label("  Fotoperíodo ") == normalize_label("fotoperiodo") == "fotoperiodo"
    assert normalize_label("A   B\tC") == "a b c"


def test_term_persists_with_defaults(db):
    term = OntologyTerm(domain="trait", label="Fotoperíodo", label_key=normalize_label("Fotoperíodo"), definition="x")
    db.add(term)
    db.commit()
    db.refresh(term)
    assert term.status == "proposed"
    assert term.hvt_id is None
    assert term.aliases == []


def test_ontology_module_has_no_product_imports():
    root = Path(__file__).resolve().parents[1] / "app" / "modules" / "ontology"
    allowed = ("app.core", "app.modules.identity", "app.modules.ontology")
    files = list(root.rglob("*.py"))
    assert files
    for path in files:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                if name == "app" or name.startswith("app."):
                    assert name.startswith(allowed), f"{path.name} importa {name}"
