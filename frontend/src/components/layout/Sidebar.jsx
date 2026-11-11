import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { visibleNav } from '../../lib/nav'

export default function Sidebar({ isOpen, onClose }) {
  const { rol, store } = useAuth()
  const items = visibleNav(rol, store)

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={onClose} aria-hidden="true" />
      )}

      <aside
        aria-label="Navegación principal"
        className={[
          'fixed z-20 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{
          top: 'var(--header-height)',
          left: 0,
          width: 'var(--sidebar-width)',
          height: 'calc(100dvh - var(--header-height))',
          backgroundColor: 'var(--color-bg-surface)',
          borderRight: '1px solid var(--color-border)',
          overflowY: 'auto',
        }}
      >
        <div className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted">
          {store ? `Tienda ${store.nombre}` : 'Vista general'}
        </div>

        <nav className="flex-1 px-2 pb-4 flex flex-col gap-0.5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="text-base leading-none w-5 text-center" aria-hidden="true">{item.icon}</span>
              {item.label({ rol, store })}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 text-xs border-t text-muted" style={{ borderColor: 'var(--color-border)' }}>
          Supermercado · v1.0
        </div>
      </aside>
    </>
  )
}
