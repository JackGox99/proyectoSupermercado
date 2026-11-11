import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * Componentes de interfaz compartidos, construidos con Bootstrap 5.3.
 * Los tonos semánticos se usan con estos nombres en todas las pantallas:
 *   success · error · warning · info · neutral · brand (color de la tienda)
 */

const TONE = {
  success: 'success',
  error: 'danger',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  neutral: 'secondary',
  brand: 'primary',
  accent: 'warning',
  primary: 'primary',
}

/** Ícono de Bootstrap Icons: <Icon name="cart3" />. */
export function Icon({ name, className = '' }) {
  return <i className={`bi bi-${name} ${className}`} aria-hidden="true" />
}

/** Carga datos de la API. `path` null = no cargar. */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!path)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false)
      return
    }
    const id = ++seq.current
    setLoading(true)
    setError('')
    try {
      const res = await api(path)
      if (id === seq.current) setData(res)
    } catch (e) {
      if (id === seq.current) setError(e.message)
    } finally {
      if (id === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, setData, error, loading, reload }
}

export function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <div className="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="h3 fw-bold mb-1 d-flex align-items-center gap-2">
          {icon && <Icon name={icon} className="text-primary" />}
          {title}
        </h1>
        {subtitle && <p className="text-body-secondary mb-0">{subtitle}</p>}
      </div>
      {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          {title && <h2 className="card-title-sm">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, tone = 'brand', hint, icon = 'graph-up' }) {
  const t = TONE[tone] || 'primary'
  return (
    <div className="card stat-card h-100">
      <div className="card-body d-flex align-items-start gap-3">
        <div className={`stat-icon tone-${t}`}><Icon name={icon} /></div>
        <div className="min-w-0">
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {hint && <div className="small text-body-secondary">{hint}</div>}
        </div>
      </div>
    </div>
  )
}

export function Badge({ tone = 'neutral', children, icon }) {
  const t = TONE[tone] || 'secondary'
  const cls = t === 'primary'
    ? 'badge-soft-store'
    : `bg-${t}-subtle text-${t}-emphasis border border-${t}-subtle`
  return (
    <span className={`badge rounded-pill ${cls}`}>
      {icon && <Icon name={icon} className="me-1" />}
      {children}
    </span>
  )
}

const BTN = {
  primary: 'btn-primary',
  ghost: 'btn-outline-secondary',
  outline: 'btn-outline-primary',
  danger: 'btn-outline-danger',
  success: 'btn-success',
  light: 'btn-light',
}

export function Button({ variant = 'primary', size, icon, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`btn ${BTN[variant] || BTN.primary} ${size ? `btn-${size}` : ''} ${icon ? 'btn-icon' : ''} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

const NOTICE_ICON = { success: 'check-circle-fill', error: 'exclamation-octagon-fill', warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }

export function Notice({ tone = 'info', children, onClose }) {
  if (!children) return null
  const t = TONE[tone] || 'info'
  return (
    <div className={`alert alert-${t} d-flex align-items-start gap-2 ${onClose ? 'alert-dismissible' : ''}`} role={t === 'danger' ? 'alert' : 'status'}>
      <Icon name={NOTICE_ICON[tone] || 'info-circle-fill'} className="mt-1" />
      <div className="flex-grow-1 min-w-0">{children}</div>
      {onClose && <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" />}
    </div>
  )
}

export function Empty({ children, icon = 'inbox' }) {
  return (
    <div className="text-center text-body-secondary py-5">
      <Icon name={icon} className="fs-2 d-block mb-2 opacity-50" />
      <div className="small">{children}</div>
    </div>
  )
}

export function Loading({ label = 'Cargando…' }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 text-body-secondary py-5">
      <span className="spinner-border spinner-border-sm text-primary" role="status" aria-hidden="true" />
      <span className="small">{label}</span>
    </div>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`d-block ${className}`}>
      <span className="form-label d-block">{label}</span>
      {children}
      {error ? (
        <span className="d-block small text-danger mt-1">{error}</span>
      ) : hint ? (
        <span className="form-text d-block">{hint}</span>
      ) : null}
    </label>
  )
}

/** Modal de Bootstrap controlado por React (sin el JavaScript de Bootstrap). */
export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('modal-open')
    }
  }, [onClose])

  return (
    <>
      <div className="modal d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
        <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${wide ? 'modal-lg' : ''}`}>
          <div className="modal-content shadow-lg">
            <div className="modal-header">
              <div>
                <h2 className="modal-title h5 fw-semibold mb-0">{title}</h2>
                {subtitle && <div className="small text-body-secondary">{subtitle}</div>}
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Cerrar" />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <ul className="nav nav-underline mb-4 flex-nowrap overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <li className="nav-item" key={t.value}>
          <button
            type="button"
            role="tab"
            aria-selected={t.value === value}
            className={`nav-link text-nowrap ${t.value === value ? 'active text-primary' : 'text-body-secondary'}`}
            onClick={() => onChange(t.value)}
          >
            {t.icon && <Icon name={t.icon} className="me-1" />}
            {t.label}
            {t.count != null && <span className="badge rounded-pill bg-body-secondary text-body-secondary ms-2">{t.count}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Tabla con desplazamiento horizontal propio (no desplaza la página). */
export function Table({ children, small = false }) {
  return (
    <div className="table-responsive app-table">
      <table className={`table table-hover align-middle ${small ? 'table-sm' : ''}`}>{children}</table>
    </div>
  )
}

/** Indicador de color de una tienda. */
export function StoreDot({ color, size = 10 }) {
  return (
    <span
      aria-hidden="true"
      className="d-inline-block rounded-circle flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color || 'var(--store-color)' }}
    />
  )
}
