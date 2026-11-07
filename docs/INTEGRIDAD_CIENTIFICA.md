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

## 4. Representaciones tridimensionales

Las escenas 3D son representaciones, nunca autoridad científica. Las plantas procedurales llevan el aviso «Representación ilustrativa; no predice crecimiento». Los modelos de los prototipos históricos se reconstruyeron a partir de fotografías y láminas del equipo y no son planos de fabricación.

## 5. Ruta hacia la validación

| Nivel | Requisito | Estado |
|---|---|---|
| P0 — Demostración | Taxonomía de origen aplicada en toda la plataforma | Cumplido |
| P1 — Evidencia | Afirmaciones del catálogo con fuente revisada; cobertura de evidencia > 0 % | Pendiente |
| P2 — Calibración | Modelos de crecimiento y clima calibrados con mediciones reales y validación agronómica | Pendiente |

## 6. Verificación

El cumplimiento de estas reglas está cubierto por pruebas automatizadas (por ejemplo, `tests/test_impact.py` verifica `null` sin insumos y la exclusión de registros borrados; `frontend/src/components/ui/origin.test.tsx` verifica las etiquetas de origen).
