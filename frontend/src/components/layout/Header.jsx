import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../lib/format'
import { StoreDot } from '../ui'

/**
 * Encabezado fijo: marca, tienda activa y usuario.
 *
 * La tienda activa se muestra siempre con su color para que el usuario sepa
 * en qué tienda está operando. El administrador general puede volver al
 * selector de tiendas desde aquí.
 */
export default function Header({ onMenuToggle }) {
  const { user, store, isGeneralAdmin, logout, selectStore } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  function changeStore() {
    selectStore(null)
    navigate('/tiendas')
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4"
      style={{
        height: 'var(--header-height)',
        backgroundColor: 'var(--color-bg-surface)',
        borderBottom: '1px solid var(--color-border)',
        boxShadow: 'inset 0 -3px 0 var(--color-brand-primary)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuToggle}
          aria-label="Abrir menú de navegación"
          className="md:hidden flex flex-col justify-center items-center w-9 h-9 rounded-md hover:bg-[var(--color-bg-elevated)]"
        >
          <span className="block w-5 h-0.5 bg-[var(--color-text-primary)] mb-1" />
          <span className="block w-5 h-0.5 bg-[var(--color-text-primary)] mb-1" />
          <span className="block w-5 h-0.5 bg-[var(--color-text-primary)]" />
        </button>

        <span className="hidden sm:flex items-center gap-2 font-bold tracking-wide">
          <span aria-hidden="true">🛒</span>
          <span>Supermercado</span>
        </span>

        <span className="hidden sm:block h-6 w-px" style={{ backgroundColor: 'var(--color-border)' }} />

        <div className="flex items-center gap-2 min-w-0">
          {store ? (
            <>
              <StoreDot color={store.color} size={14} />
              <span className="font-semibold truncate" style={{ color: 'var(--color-brand-primary)' }}>
                Tienda {store.nombre}
              </span>
            </>
          ) : (
            <span className="font-semibold truncate text-muted">Administración general</span>
          )}
          {isGeneralAdmin && store && (
            <button onClick={changeStore} className="btn-ghost !px-2 !py-1 text-xs ml-1">
              Cambiar tienda
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span className="text-sm font-medium">{user?.nombre}</span>
          <span className="text-xs text-muted">{ROLE_LABELS[user?.rol] ?? user?.rol}</span>
        </div>
        <button onClick={handleLogout} className="btn-ghost text-sm !px-3">
          Salir
        </button>
      </div>
    </header>
  )
}
