# Importa todos los modelos para que Base.metadata los conozca (Alembic y tests).
from app.modules.audit import models as audit_models  # noqa: F401
from app.modules.catalog import models as catalog_models  # noqa: F401
from app.modules.graph import models as graph_models  # noqa: F401
from app.modules.identity import models as identity_models  # noqa: F401
from app.modules.projects import models as projects_models  # noqa: F401
from app.modules.prototypes import models as prototypes_models  # noqa: F401
