import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../lib/nav'

/**
 * Inicio de sesión (CU-10).
 * Tras autenticarse:
 *   - Administrador general → selector de tiendas.
 *   - Cajero → punto de venta de su tienda.
 *   - Resto → panel de su tienda.
 */
export default function Login() {
  const { login, isAuthenticated, rol, store } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to={homeFor(rol, store)} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username: username.trim(), password }, noStore: true })
      login(data)
      navigate(homeFor(data.rol, data.rol === 'admin' ? null : data.sede), { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      <div className="w-full max-w-sm card !p-8">
        <div className="flex justify-center mb-5">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl" style={{ backgroundColor: 'var(--color-brand-primary)' }}>
            🛒
          </div>
        </div>
        <h1 className="text-center text-xl font-bold mb-1">Supermercado</h1>
        <p className="text-center text-sm mb-7 text-muted">Inventario, ventas y personal</p>

        {error && <div className="notice notice-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Usuario</span>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field"
              placeholder="p. ej. cajero.galerias"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1.5">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
            />
          </label>
          <button type="submit" disabled={loading || !username || !password} className="btn-primary w-full mt-2 !py-2.5 disabled:opacity-60">
            {loading ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
      <p className="mt-6 text-xs text-muted">UNIMINUTO · Arquitectura de Software · 2026</p>
    </div>
  )
}
