import { Link } from 'react-router-dom'
import { Card, PageHeader } from '@/components/ui'
import { useAuth } from '@/store/auth'

const SPACES = [
  { to: '/app/plants', title: 'Explorador vegetal', text: 'Especies, variedades y evidencia con procedencia.' },
  { to: '/app/projects', title: 'Proyectos de cultivo', text: 'Objetivos, ciclos y bitácora persistente.' },
  { to: '/app/prototypes', title: 'Prototipos', text: 'Hardware en construcción: modelos 3D e imágenes.' },
]

export function AppHome() {
  const user = useAuth((s) => s.user)
  return (
    <>
      <PageHeader title={`Hola${user?.full_name ? `, ${user.full_name}` : ''}`} description="Espacios disponibles en esta versión." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SPACES.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="h-full p-5 transition-colors hover:border-accent/50">
              <h2 className="font-medium">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
