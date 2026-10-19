import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="text-xl font-semibold">Página no encontrada</h1>
      <Link to="/" className="text-sm text-accent hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
