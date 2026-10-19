import axios, { AxiosError } from 'axios'
import { useAuth } from '@/store/auth'

export const api = axios.create({ baseURL: '/api/v1' })

api.interceptors.request.use((config) => {
  const { token, organizationId } = useAuth.getState()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (organizationId) config.headers['X-Organization-ID'] = organizationId
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401 && useAuth.getState().token) {
      useAuth.getState().logout()
    }
    return Promise.reject(error)
  },
)

export interface ApiErrorBody {
  error?: { code: string; message: string; request_id?: string; details?: Record<string, unknown> }
}

/** Mensaje legible para mostrar al usuario a partir de cualquier error de la API. */
export function errorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined
    if (body?.error?.message) return body.error.message
    if (!err.response) return 'Sin conexión con el servidor'
  }
  return fallback
}

export function errorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined
}
