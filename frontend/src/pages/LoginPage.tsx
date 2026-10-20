import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '@/api/client'
import { Logo } from '@/components/Logo'
import { Button, Card, Field, Input } from '@/components/ui'
import { Membership, User, useAuth } from '@/store/auth'

export function LoginPage() {
  const { token, setSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/app'

  if (token) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ access_token: string; user: User; memberships: Membership[] }>('/auth/login', {
        email,
        password,
      })
      setSession(res.data.access_token, res.data.user, res.data.memberships)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo iniciar sesión'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-8">
          <Logo compact dotClassName="mb-4 block h-8 w-8" />
          <h1 className="display text-3xl">HarvestT Cortex</h1>
          <p className="mt-1 text-sm text-muted">Inicia sesión para continuar</p>
        </div>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Correo">
            {(id) => (
              <Input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Field label="Contraseña">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
    </div>
  )
}
