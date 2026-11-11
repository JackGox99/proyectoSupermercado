import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/layout/Layout'
import { homeFor } from './lib/nav'
import Login from './pages/Login'
import StoreSelector from './pages/StoreSelector'
import Dashboard from './pages/Dashboard'
import Sales from './pages/Sales'
import Inventory from './pages/Inventory'
import Products from './pages/Products'
import Alerts from './pages/Alerts'
import Shifts from './pages/Shifts'
import Staff from './pages/Staff'
import Categories from './pages/Categories'
import Reports from './pages/Reports'
import Audit from './pages/Audit'
import Profile from './pages/Profile'

const ADMINS = ['admin', 'admin_tienda']

function Home() {
  const { isAuthenticated, rol, store } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Navigate to={homeFor(rol, store)} replace />
}

/**
 * Rutas:
 *  - /tiendas: selector de tiendas del administrador general (pantalla inicial).
 *  - Pantallas de tienda (requireStore): operan sobre la tienda activa.
 *  - Pantallas generales: categorías (solo vista general), personal, reportes y
 *    bitácora (en la vista general muestran el consolidado de todas las tiendas).
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Home />} />
            <Route path="tiendas" element={<ProtectedRoute roles={['admin']}><StoreSelector /></ProtectedRoute>} />
            <Route path="panel" element={<Dashboard />} />
            <Route path="ventas" element={<ProtectedRoute roles={[...ADMINS, 'cajero']} requireStore><Sales /></ProtectedRoute>} />
            <Route path="inventario" element={<ProtectedRoute requireStore><Inventory /></ProtectedRoute>} />
            <Route path="productos" element={<ProtectedRoute roles={ADMINS} requireStore><Products /></ProtectedRoute>} />
            <Route path="alertas" element={<ProtectedRoute requireStore><Alerts /></ProtectedRoute>} />
            <Route path="turnos" element={<ProtectedRoute requireStore><Shifts /></ProtectedRoute>} />
            <Route path="personal" element={<ProtectedRoute roles={ADMINS}><Staff /></ProtectedRoute>} />
            <Route path="categorias" element={<ProtectedRoute roles={['admin']} globalOnly><Categories /></ProtectedRoute>} />
            <Route path="reportes" element={<ProtectedRoute roles={ADMINS}><Reports /></ProtectedRoute>} />
            <Route path="bitacora" element={<ProtectedRoute roles={ADMINS}><Audit /></ProtectedRoute>} />
            <Route path="perfil" element={<Profile />} />
          </Route>

          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
