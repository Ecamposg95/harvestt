import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'
import { PlantDetailPage } from '@/features/catalog/PlantDetailPage'
import { PlantsPage } from '@/features/catalog/PlantsPage'
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { PrototypeAdminDetailPage } from '@/features/prototypes/PrototypeAdminDetailPage'
import { PrototypePublicPage } from '@/features/prototypes/PrototypePublicPage'
import { PrototypesAdminPage } from '@/features/prototypes/PrototypesAdminPage'
import { ShowcasePage } from '@/features/prototypes/ShowcasePage'
import { AppLayout } from '@/layouts/AppLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { AppHome } from '@/pages/AppHome'
import { LoginPage } from '@/pages/LoginPage'
import { NotFound } from '@/pages/NotFound'
import { useAuth } from '@/store/auth'

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
        <Route index element={<AppHome />} />
        <Route path="plants" element={<PlantsPage />} />
        <Route path="plants/:id" element={<PlantDetailPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="prototypes" element={<PrototypesAdminPage />} />
        <Route path="prototypes/:id" element={<PrototypeAdminDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
