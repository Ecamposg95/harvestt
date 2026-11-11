# Integridad científica y procedencia de datos

**Versión del documento:** 1.0 · **Fecha:** 2026-11-07

## 1. Declaración

HarvestT Cortex es un instrumento de trabajo para investigación agronómica. Su valor depende de que cada persona que lo use pueda distinguir, en cualquier pantalla, entre lo que se midió, lo que se citó, lo que se calculó, lo que se simuló y lo que se ignora. Por ello la plataforma adopta una regla no negociable:

> Toda cifra presentada como conocimiento agronómico debe tener fuente y contexto; todo dato sintético debe estar marcado. Un dato ausente se representa como desconocido, nunca como cero.

## 2. Taxonomía de origen

Cada valor expuesto por la API y la interfaz pertenece exactamente a una categoría. La interfaz la muestra con el componente `OriginBadge`.

| Código | Etiqueta | Definición | Ejemplo en la plataforma |
|---|---|---|---|
| `measured` | **Medido** | Registrado por una medición o acción real | Observaciones de la bitácora; número de ciclos de un proyecto |
| `sourced` | **Fuente** | Tomado de una fuente citada, con licencia y fecha de acceso | Afirmación de rasgo con referencia bibliográfica |
| `derived` | **Derivado** | Calculado a partir de otros datos con una fórmula visible | Días desde el inicio del ciclo; cobertura de evidencia del catálogo |
| `simulated` | **Simulado** | Generado por el motor didáctico; no es una medición | Lecturas, corridas e incidentes del invernadero virtual |
| `illustrative` | **Ilustrativo** | Representación de ejemplo que no describe un caso real | Plantas 3D procedurales; reconstrucciones STL de prototipos |
| `missing` | **Desconocido** | No existe evidencia todavía | Rasgos del catálogo sin fuente cargada |

## 3. Reglas operativas

1. **Ausencia ≠ cero.** Un sensor sin señal muestra «Sin señal»; un KPI sin insumos devuelve `null` y se muestra «Sin datos suficientes».
2. **Sin valores universales.** No se almacena un «óptimo» por especie; los rasgos son afirmaciones contextualizadas por etapa, sistema, localidad y fuente.
3. **Sin puntajes de confianza arbitrarios.** Se muestra el nivel de evidencia y sus razones; cualquier puntaje futuro requiere metodología documentada.
4. **Fórmula visible.** Todo indicador derivado expone su fórmula y sus insumos en la interfaz.
5. **Simulación declarada.** Las pantallas con datos simulados llevan la banda «Simulación didáctica, sin calibración agronómica» y la etiqueta SIMULADO. Los umbrales de alerta de demostración (30 °C, 45 %) son de ejemplo, no agronómicos.
6. **Reproducibilidad.** Cada corrida registra semilla, versión de modelo (`didactic-v1`) y parámetros; reejecutarla produce la misma serie.
7. **Licencia y atribución.** Los medios de especie solo se publican con licencia y crédito visibles.
8. **Fuera de alcance deliberado.** Rendimiento, ahorro de agua, CO₂ y beneficios económicos **no** se estiman mientras no exista una metodología documentada y validada.
9. **Corregir el dato, no la cifra.** Si un indicador resulta desfavorable (por ejemplo, 0 % de cobertura de evidencia), se corrige cargando evidencia, nunca ajustando la presentación.
10. **Borrado lógico coherente.** Los registros borrados no participan en ningún indicador.
11. **Lo simulado no cuenta como nodo.** Ni los dispositivos `simulated` ni las lecturas con `source = simulated` suman a «nodos operando». La definición vigente (proyectos con un dispositivo no simulado con lectura real en los últimos 7 días) es provisional hasta la entidad Node (M5).
12. **Pasado y futuro, sin confundir.** El sitio de CDMX se muestra como «prototipo histórico», nunca como operando: en el globo usa un marcador propio (rombo neutro, sin pulso), distinto del glifo de «operando», y la lista de sitios acompaña siempre al globo. Los nodos futuros del globo provienen solo de solicitudes de nodo aprobadas.
13. **Ubicación aproximada.** Las coordenadas de una solicitud se redondean a 1 decimal (≈ una ciudad) antes de guardarse; no se almacena la ubicación exacta.
14. **Capas sin dato, «pronto».** «Lecturas firmadas» se muestra «pronto» mientras la capa no exista; nunca 0.
15. **Reconocimientos con evidencia.** No se puede registrar un reconocimiento sin evidencia. Con 0 reconocimientos registrados la cifra muestra «Sin datos suficientes», nunca 0.
16. **Nunca se inventan correspondencias.** Un valor libre de los datos existentes (variable, etapa, sistema de cultivo, nombre científico) solo se enlaza a un término si coincide exactamente, tras normalizar, con la etiqueta o un alias de un único término publicado de su dominio. Sin coincidencia, con coincidencia ambigua o con valores como `unknown` u `other`, el enlace queda vacío (sin término) y no se muestra ninguna correspondencia; los enlaces se ven como conteo de uso en la ficha del término y como aristas «clasificado como» en el grafo. El texto original nunca se modifica.
17. **Nunca se inventan identificadores externos.** Cada equivalencia de la semilla con un vocabulario externo (NCBI Taxon, PO, BBCH, AGROVOC, PECO, ENVO, SOSA, SSN, GeoSPARQL) se verifica contra su fuente oficial con `python -m scripts.ontology.verify_external`. Una equivalencia que no se puede verificar se omite; nunca se aproxima. BBCH no tiene un servicio consultable: el verificador solo comprueba que el DOI de la monografía (Meier 2018) resuelve, y cada código con su etiqueta se verificó a mano contra la página citada. UCUM no es una equivalencia de la semilla: sus conceptos solo se cargan para sugerencias y la unidad de cada rasgo se guarda como código UCUM en `unit`.
18. **Un término publicado no se borra.** No cambia de etiqueta, definición ni padre. Si deja de ser válido pasa a «Obsoleto» con `replaced_by` apuntando a otro término publicado, y sigue resolviéndose por su ID. Toda decisión de revisión lleva una razón visible en la ficha.
19. **El ID es permanente; la base de las IRI no lo es.** El identificador `HVT:` + 6 dígitos se asigna al publicar y nunca se reutiliza. Las IRI de la exportación se construyen con `ONTOLOGY_BASE_IRI` (hoy, el dominio de Railway) y cambiarán cuando exista harvestt.org; quien cite un término debe citar su ID `HVT:`.
20. **Crédito del proponente.** Un término publicado muestra «Propuesto por *nombre*», también en la exportación pública; el formulario lo avisa antes de enviar. Los términos de la semilla dicen «Equipo HarvestT». El correo del proponente nunca se publica: sin nombre registrado, el crédito es «Colaborador».
21. **Licencia abierta.** La ontología se publica bajo CC-BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>), declarada en la exportación OWL/Turtle y JSON, que solo incluye términos publicados y obsoletos.

### Importación desde bancos públicos

22. **Solo lectura, sin sobrescritura.** Los conectores solo consultan las fuentes; una sincronización nunca modifica `species`, `cultivars`, `trait_assertions` ni `species_media` (una prueba compara las filas antes y después). La ficha muestra lo capturado por el equipo y lo importado lado a lado; lo importado lleva origen **Fuente** (`sourced`).
23. **Coincidencia exacta.** Un conector guarda datos solo si la identidad casa sin ambigüedad: GBIF por `usageKey` del catálogo, WFO con `type = exact` y `status = accepted`, Wikidata con exactamente un ítem con ese ID de GBIF. Cualquier otro caso queda «Sin coincidencia» con el motivo visible, sin datos y sin «mejor coincidencia». Si los identificadores cruzados difieren entre fuentes, la ficha lo marca «No coinciden» y no elige uno.
24. **Licencia por fuente.** GBIF: solo registros CC0 1.0 y CC BY 4.0; los CC BY-NC se excluyen y se informa cuántos. WFO y Wikidata: CC0 1.0. Commons: solo CC0, dominio público, CC BY y CC BY-SA, con autor (texto plano) y licencia visibles; las imágenes se enlazan, no se descargan. Genesys permite usar los datos pero **prohíbe redistribuirlos**: no se guardan accesiones, solo conteos; la lista se consulta en vivo y enlaza a Genesys, con cita de la fuente. Toda copia lleva licencia, atribución y URL de origen.
25. **Copia con fecha.** Cada copia muestra la fecha de consulta. Si una sincronización falla, se conserva la copia anterior y la ficha dice «Fuente no disponible · última copia del <fecha>»; nunca se mezcla una copia parcial. Sin copia: «Sin datos de esta fuente todavía».
26. **Lo importado no es evidencia revisada.** Que un banco publique un dato no lo convierte en afirmación del catálogo ni mueve la cobertura de evidencia (§3.9): para eso el equipo debe cargar la afirmación con su fuente revisada. Tampoco se calcula con estos datos ningún «óptimo» ni puntaje (§3.2 y §3.3). El mapa de distribución es hito M4.

## 4. Representaciones tridimensionales

Las escenas 3D son representaciones, nunca autoridad científica. Las plantas procedurales llevan el aviso «Representación ilustrativa; no predice crecimiento». Los modelos de los prototipos históricos se reconstruyeron a partir de fotografías y láminas del equipo y no son planos de fabricación.

## 5. Ruta hacia la validación

| Nivel | Requisito | Estado |
|---|---|---|
| P0 — Demostración | Taxonomía de origen aplicada en toda la plataforma | Cumplido |
| P1 — Evidencia | Afirmaciones del catálogo con fuente revisada; cobertura de evidencia > 0 % | Pendiente |
| P2 — Calibración | Modelos de crecimiento y clima calibrados con mediciones reales y validación agronómica | Pendiente |

## 6. Verificación

El cumplimiento de estas reglas está cubierto por pruebas automatizadas (por ejemplo, `tests/test_impact.py` verifica `null` sin insumos y la exclusión de registros borrados; `frontend/src/components/ui/origin.test.tsx` verifica las etiquetas de origen; `tests/test_vision.py` fija cada exclusión de «nodos operando», el redondeo de coordenadas y la evidencia obligatoria; `tests/test_ontology.py` fija que un término publicado no se borra ni se edita, que la exportación incluye solo publicados y obsoletos y declara la licencia, y que las propuestas ajenas no son visibles; `tests/test_term_links.py` fija que los valores sin correspondencia quedan vacíos con el texto original intacto).
