import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, ReactNode, Suspense } from 'react'
import { PlantDetailPage } from '@/features/catalog/PlantDetailPage'
import { PlantsPage } from '@/features/catalog/PlantsPage'
import { ProjectImpactPage } from '@/features/impact/ProjectImpactPage'
import { OperationsPage } from '@/features/operations/OperationsPage'
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { PrototypeAdminDetailPage } from '@/features/prototypes/PrototypeAdminDetailPage'
import { PrototypePublicPage } from '@/features/prototypes/PrototypePublicPage'
import { PrototypesAdminPage } from '@/features/prototypes/PrototypesAdminPage'
import { RequestsInboxPage } from '@/features/vision/RequestsInboxPage'
import { VisionPage } from '@/features/vision/VisionPage'
import OntologyPage from '@/features/ontology/OntologyPage'
import SourcesPage from '@/features/connectors/SourcesPage'
import { ShowcasePage } from '@/features/prototypes/ShowcasePage'
import { StudioPage } from '@/features/studio/StudioPage'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { HomePage } from '@/features/home/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { NotFound } from '@/pages/NotFound'
import { useAuth } from '@/store/auth'
import { Loading } from '@/components/ui'

// d3-force vive solo en este chunk perezoso.
const GraphPage = lazy(() => import('@/features/graph/GraphPage'))

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token)
  const location = useLocation()
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<ShowcasePage />} />
        <Route path="vision" element={<VisionPage />} />
        <Route path="prototipos/:slug" element={<PrototypePublicPage />} />
      </Route>
      <Route path="login" element={<LoginPage />} />
      <Route
        path="app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="plants" element={<PlantsPage />} />
        <Route path="plants/:id" element={<PlantDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="projects/:id/operations" element={<OperationsPage />} />
        <Route path="projects/:id/studio" element={<StudioPage />} />
        <Route path="projects/:id/impact" element={<ProjectImpactPage />} />
        <Route path="solicitudes" element={<RequestsInboxPage />} />
        <Route path="prototypes" element={<PrototypesAdminPage />} />
        <Route path="prototypes/:id" element={<PrototypeAdminDetailPage />} />
        <Route path="ontologia" element={<OntologyPage />} />
        <Route path="fuentes" element={<SourcesPage />} />
        <Route
          path="graph"
          element={
            <Suspense fallback={<Loading label="Cargando grafo…" />}>
              <GraphPage />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
