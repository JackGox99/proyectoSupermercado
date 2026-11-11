import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

/**
 * Marco de la aplicación: sidebar fijo (colapsable en pantallas pequeñas),
 * encabezado y contenido.
 */
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && <div className="app-backdrop d-lg-none" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />
      <main className="app-main">
        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </>
  )
}
