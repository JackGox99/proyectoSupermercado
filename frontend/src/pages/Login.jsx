import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../lib/nav'
import { Icon } from '../components/ui'

const FEATURES = [
  { icon: 'shop-window', title: 'Varias tiendas', text: 'Cada tienda con su inventario, personal y color.' },
  { icon: 'upc-scan', title: 'Punto de venta', text: 'Lector de código de barras y descuento automático de stock.' },
  { icon: 'bell', title: 'Alertas', text: 'Stock mínimo y productos próximos a vencer.' },
  { icon: 'bar-chart-line', title: 'Reportes', text: 'Ventas, inventario y personal en CSV o XLSX.' },
]

/**
 * Inicio de sesión (CU-10).
 * Tras autenticarse: administrador general → selector de tiendas; cajero →
 * punto de venta; resto → panel de su tienda.
 */
export default function Login() {
  const { login, isAuthenticated, rol, store, theme, toggleTheme } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
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
    <div className="container-fluid min-vh-100">
      <div className="row min-vh-100">
        <div className="col-lg-6 col-xl-7 login-hero d-none d-lg-flex flex-column justify-content-between p-5">
          <div className="d-flex align-items-center gap-2 fs-5 fw-bold">
            <Icon name="cart3" /> Supermercado
          </div>
          <div style={{ maxWidth: 560 }}>
            <h1 className="display-5 fw-bold mb-3">Inventario, ventas y personal en un solo lugar.</h1>
            <p className="lead opacity-75 mb-5">
              Sistema de información para supermercados de pequeña y mediana escala.
            </p>
            <div className="row g-4">
              {FEATURES.map((f) => (
                <div className="col-sm-6 feature d-flex gap-3" key={f.title}>
                  <Icon name={f.icon} />
                  <div>
                    <div className="fw-semibold">{f.title}</div>
                    <div className="small opacity-75">{f.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="small opacity-75">UNIMINUTO · Arquitectura de Software · 2026</div>
        </div>

        <div className="col-lg-6 col-xl-5 d-flex flex-column justify-content-center align-items-center p-4 position-relative">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary position-absolute top-0 end-0 m-3"
            onClick={toggleTheme}
            aria-label="Cambiar modo de color"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon-stars'} />
          </button>

          <div className="w-100" style={{ maxWidth: 400 }}>
            <div className="d-lg-none d-flex align-items-center gap-2 fs-4 fw-bold mb-4 text-primary">
              <Icon name="cart3" /> Supermercado
            </div>
            <h2 className="h3 fw-bold mb-1">Bienvenido</h2>
            <p className="text-body-secondary mb-4">Ingresa con tu usuario para continuar.</p>

            {error && (
              <div className="alert alert-danger d-flex gap-2 align-items-start" role="alert">
                <Icon name="exclamation-octagon-fill" className="mt-1" /> <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-floating mb-3">
                <input
                  id="username"
                  type="text"
                  className="form-control"
                  autoComplete="username"
                  autoFocus
                  placeholder="usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <label htmlFor="username">Usuario</label>
              </div>
              <div className="input-group mb-4">
                <div className="form-floating">
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    className="form-control"
                    autoComplete="current-password"
                    placeholder="contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label htmlFor="password">Contraseña</label>
                </div>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <Icon name={showPwd ? 'eye-slash' : 'eye'} />
                </button>
              </div>
              <button type="submit" className="btn btn-primary btn-lg w-100" disabled={loading || !username || !password}>
                {loading ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : <Icon name="box-arrow-in-right" className="me-2" />}
                {loading ? 'Ingresando…' : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
