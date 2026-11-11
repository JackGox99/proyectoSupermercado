import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { homeFor } from '../lib/nav'

/**
 * ProtectedRoute — exige sesión y, opcionalmente, rol y tienda activa.
 *
 *   roles:        roles permitidos (omitido = cualquiera autenticado)
 *   requireStore: la pantalla opera sobre una tienda; el admin general sin
 *                 tienda seleccionada es enviado al selector de tiendas.
 *   globalOnly:   solo en la vista general del admin general.
 */
export default function ProtectedRoute({ children, roles, requireStore = false, globalOnly = false }) {
  const { isAuthenticated, rol, store } = useAuth()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && !roles.includes(rol)) return <Navigate to={homeFor(rol, store)} replace />
  if (requireStore && !store) return <Navigate to="/tiendas" replace />
  if (globalOnly && store) return <Navigate to="/panel" replace />
  return children
}
