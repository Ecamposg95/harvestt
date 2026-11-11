import outline from './mexico-outline.json'

/** [minLon, minLat, maxLon, maxLat] del mapa de México. */
export const BBOX = outline.bbox as [number, number, number, number]

/** Factor de la equirectangular: cos(23°), la latitud media aproximada de México. */
const KX = Math.cos((23 * Math.PI) / 180)

const [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT] = BBOX

/** Píxeles por grado de latitud para un ancho dado. */
const scale = (width: number) => width / ((MAX_LON - MIN_LON) * KX)

/** Alto del mapa derivado del ancho. */
export const mapHeight = (width: number) => (MAX_LAT - MIN_LAT) * scale(width)

/** Proyección equirectangular sobre el bbox: (minLon, maxLat) → (0, 0). */
export function project(lon: number, lat: number, width: number): { x: number; y: number } {
  const k = scale(width)
  return { x: (lon - MIN_LON) * KX * k, y: (MAX_LAT - lat) * k }
}

export const inBBox = (lon: number, lat: number) =>
  lon >= MIN_LON && lon <= MAX_LON && lat >= MIN_LAT && lat <= MAX_LAT
