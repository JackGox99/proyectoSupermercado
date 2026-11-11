import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { groupedNav } from '../../lib/nav'
import { Icon, StoreDot } from '../ui'

/** Menú lateral oscuro, agrupado por secciones y filtrado por rol. */
export default function Sidebar({ isOpen, onClose }) {
  const { rol, store } = useAuth()
  const groups = groupedNav(rol, store)

  return (
    <aside className={`app-sidebar ${isOpen ? 'show' : ''}`} aria-label="Navegación principal">
      <div className="brand">
        <span className="brand-mark"><Icon name="cart3" /></span>
        <span>Supermercado</span>
        <button type="button" className="btn-close btn-close-white ms-auto d-lg-none" onClick={onClose} aria-label="Cerrar menú" />
      </div>

      <div className="store-box">
        <div className="small text-uppercase fw-semibold" style={{ color: '#64748b', fontSize: '0.66rem', letterSpacing: '0.08em' }}>
          {store ? 'Tienda activa' : 'Modo'}
        </div>
        <div className="d-flex align-items-center gap-2 text-white fw-semibold mt-1 text-truncate">
          {store ? <StoreDot color={store.color} /> : <Icon name="globe2" />}
          <span className="text-truncate">{store ? store.nombre : 'Vista general'}</span>
        </div>
      </div>

      <nav className="flex-grow-1 overflow-y-auto pb-3">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="section-label">{g.name}</div>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon name={item.icon} />
                <span>{item.label({ rol, store })}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 small" style={{ color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        UNIMINUTO · v1.1
      </div>
    </aside>
  )
}
