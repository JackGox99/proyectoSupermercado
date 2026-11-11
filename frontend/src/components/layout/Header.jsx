import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../lib/format'
import { Icon, StoreDot } from '../ui'

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

/**
 * Encabezado: tienda activa (con su color), cambio de tienda para el
 * administrador general, modo claro/oscuro y menú de usuario.
 */
export default function Header({ onMenuToggle }) {
  const { user, store, isGeneralAdmin, logout, selectStore, theme, toggleTheme } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  function changeStore() {
    selectStore(null)
    navigate('/tiendas')
  }

  return (
    <header className="app-header">
      <button type="button" className="btn btn-light btn-sm d-lg-none" onClick={onMenuToggle} aria-label="Abrir menú">
        <Icon name="list" className="fs-5" />
      </button>

      <div className="d-flex align-items-center gap-2 min-w-0">
        {store ? (
          <span className="store-chip text-truncate">
            <StoreDot color={store.color} />
            <span className="text-truncate">Tienda {store.nombre}</span>
          </span>
        ) : (
          <span className="store-chip">
            <Icon name="globe2" />
            <span className="d-none d-sm-inline">Administración general</span>
          </span>
        )}
        {isGeneralAdmin && store && (
          <button type="button" className="btn btn-sm btn-outline-secondary btn-icon" onClick={changeStore}>
            <Icon name="arrow-left-right" />
            <span className="d-none d-md-inline">Cambiar tienda</span>
          </button>
        )}
      </div>

      <div className="ms-auto d-flex align-items-center gap-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Usar modo claro' : 'Usar modo oscuro'}
          title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon-stars'} />
        </button>

        <div className="position-relative" ref={menuRef}>
          <button
            type="button"
            className="btn btn-link text-decoration-none d-flex align-items-center gap-2 p-1 text-body"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
          >
            <span className="avatar">{initials(user?.nombre)}</span>
            <span className="d-none d-md-flex flex-column align-items-start lh-sm text-start">
              <span className="fw-semibold small">{user?.nombre}</span>
              <span className="text-body-secondary" style={{ fontSize: '0.75rem' }}>{ROLE_LABELS[user?.rol]}</span>
            </span>
            <Icon name="chevron-down" className="small text-body-secondary d-none d-md-inline" />
          </button>
          {menuOpen && (
            <div className="dropdown-menu dropdown-menu-end show shadow position-absolute end-0 mt-1" style={{ minWidth: 220 }}>
              <div className="px-3 py-2 small">
                <div className="fw-semibold">{user?.nombre}</div>
                <div className="text-body-secondary">@{user?.username}</div>
              </div>
              <div className="dropdown-divider" />
              <button type="button" className="dropdown-item d-flex align-items-center gap-2" onClick={() => { setMenuOpen(false); navigate('/perfil') }}>
                <Icon name="person-circle" /> Mi perfil
              </button>
              <button
                type="button"
                className="dropdown-item d-flex align-items-center gap-2 text-danger"
                onClick={() => { logout(); navigate('/login', { replace: true }) }}
              >
                <Icon name="box-arrow-right" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
