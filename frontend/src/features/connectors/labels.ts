export const CONNECTOR_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  requires_credentials: 'Requiere credenciales',
  in_construction: 'En construcción',
  requires_alliance: 'Requiere alianza',
}

export const SYNC_STATUS_LABELS: Record<string, string> = {
  running: 'En curso',
  ok: 'Correcta',
  partial: 'Parcial',
  error: 'Con error',
}

/** Estado biológico de la accesión (MCPD SAMPSTAT); igual a app/modules/connectors/sampstat.py. */
export const SAMPSTAT_LABELS: Record<number, string> = {
  100: 'Silvestre',
  110: 'Natural',
  120: 'Seminatural/silvestre',
  130: 'Seminatural/sembrado',
  200: 'Maleza',
  300: 'Variedad tradicional o criolla',
  400: 'Material de mejoramiento o investigación',
  410: 'Línea de mejorador',
  411: 'Población sintética',
  412: 'Híbrido',
  413: 'Población base',
  414: 'Línea endogámica',
  415: 'Población segregante',
  416: 'Selección clonal',
  420: 'Material genético',
  421: 'Mutante',
  422: 'Material citogenético',
  423: 'Otro material genético',
  500: 'Cultivar mejorado',
  600: 'OGM',
  999: 'Otro',
}

export const sampstatLabel = (code: number | null | undefined): string =>
  code == null ? 'Sin dato' : (SAMPSTAT_LABELS[code] ?? `Código MCPD ${code}`)

/** Fecha corta dd/mm/aaaa (zona local). */
export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Conteo con separador de miles de es-MX. */
export const formatCount = (n: number): string => n.toLocaleString('es-MX')

let regionNames: Intl.DisplayNames | null | undefined
/** Nombre del país en español a partir de un código ISO alfa-2; otros códigos se muestran tal cual. */
export function countryName(code: string | null | undefined): string {
  if (!code) return 'Sin dato'
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['es'], { type: 'region' })
    } catch {
      regionNames = null
    }
  }
  if (code.length !== 2 || !regionNames) return code
  try {
    return regionNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}
