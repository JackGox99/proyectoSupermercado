import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * Componentes de interfaz compartidos. Toda la presentación usa las variables
 * CSS de index.css, así el color de la tienda activa se aplica en todas partes.
 */

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

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, tone = 'brand', hint }) {
  const color = {
    brand: 'var(--color-brand-primary)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    error: 'var(--color-error)',
    accent: 'var(--color-accent)',
    neutral: 'var(--color-text-primary)',
  }[tone]
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Button({ variant = 'primary', className = '', ...props }) {
  return <button type="button" className={`btn-${variant} disabled:opacity-50 disabled:cursor-not-allowed ${className}`} {...props} />
}

export function Notice({ tone = 'info', children, onClose }) {
  if (!children) return null
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-lg leading-none opacity-70 hover:opacity-100" aria-label="Cerrar">×</button>
      )}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>
}

export function Loading({ label = 'Cargando…' }) {
  return <div className="py-10 text-center text-sm text-muted">{label}</div>
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium mb-1 text-muted">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs mt-1" style={{ color: 'var(--color-error)' }}>{error}</span>
      ) : hint ? (
        <span className="block text-xs mt-1 text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

export function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92dvh] flex flex-col rounded-xl shadow-2xl`}
        style={{ backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-muted hover:opacity-80" aria-label="Cerrar">×</button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t flex flex-wrap justify-end gap-2" style={{ borderColor: 'var(--color-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-5 flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--color-border)' }} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className="px-4 py-2 text-sm font-semibold -mb-px whitespace-nowrap transition-colors"
            style={{
              color: active ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
              borderBottom: `2px solid ${active ? 'var(--color-brand-primary)' : 'transparent'}`,
            }}
          >
            {t.label}
            {t.count != null && <span className="ml-2 text-xs opacity-80">({t.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Tabla con desplazamiento horizontal propio (no desplaza la página). */
export function Table({ children }) {
  return (
    <div className="table-wrap">
      <table className="data-table">{children}</table>
    </div>
  )
}

/** Cuadrado de color de una tienda. */
export function StoreDot({ color, size = 12 }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-sm flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color || 'var(--color-brand-primary)' }}
    />
  )
}
