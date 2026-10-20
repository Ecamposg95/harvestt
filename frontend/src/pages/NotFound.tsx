import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'

export function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="display text-4xl">404</p>
        <h1 className="text-xl font-semibold">Página no encontrada</h1>
        <Link to="/" className="mt-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-fg">
          Volver al inicio
        </Link>
      </Card>
    </div>
  )
}
