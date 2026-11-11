import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { money, number } from '../lib/format'
import { Badge, Button, Field, Loading, Modal, Notice, PageHeader, Stat, useApi } from '../components/ui'

const PALETTE = ['#4ADE80', '#60A5FA', '#F472B6', '#FBBF24', '#A78BFA', '#2DD4BF', '#FB923C', '#F87171']

/**
 * Selector de tiendas — pantalla inicial del administrador general.
 *
 * Muestra cada tienda con su color y sus indicadores del día, el consolidado
 * de todas las tiendas, y permite crear, configurar e inactivar tiendas
 * (RF-01 / CU-09 / RN-06). Al elegir "Administrar" la aplicación entra en
 * el contexto de esa tienda: todas las pantallas pasan a mostrar sus datos.
 */
export default function StoreSelector() {
  const { selectStore } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi('/venues/overview')
  const [editing, setEditing] = useState(null) // null | {} (nueva) | tienda
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  const stores = data || []
  const active = stores.filter((s) => s.activa)
  const sum = (key) => active.reduce((acc, s) => acc + (Number(s[key]) || 0), 0)

  function enter(s) {
    selectStore({ id: s.id, nombre: s.nombre, color: s.color, direccion: s.direccion })
    navigate('/panel')
  }

  async function toggle(s) {
    const verb = s.activa ? 'inactivar' : 'activar'
    if (s.activa && !window.confirm(`¿Inactivar la tienda ${s.nombre}? Su personal no podrá iniciar sesión hasta reactivarla.`)) return
    setActionError('')
    try {
      await api(`/venues/${s.id}/status`, { method: 'PATCH', body: { activa: !s.activa }, noStore: true })
      setNotice(`Tienda ${s.nombre} ${s.activa ? 'inactivada' : 'activada'}.`)
      reload()
    } catch (e) {
      setActionError(`No se pudo ${verb}: ${e.message}`)
    }
  }

  return (
    <div>
      <PageHeader
        title="¿Qué tienda quieres administrar?"
        subtitle="Elige una tienda para operar sobre ella, o revisa el consolidado de todas."
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/panel')}>Ver consolidado</Button>
            <Button onClick={() => setEditing({})}>+ Nueva tienda</Button>
          </>
        }
      />

      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setActionError('')}>{actionError || error}</Notice>

      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
            <Stat label="Tiendas activas" value={`${active.length} / ${stores.length}`} tone="neutral" />
            <Stat label="Ventas de hoy" value={number(sum('ventas_hoy'))} tone="brand" />
            <Stat label="Total vendido hoy" value={money(sum('total_hoy'))} tone="success" />
            <Stat label="Alertas" value={number(sum('stock_bajo') + sum('vencidos') + sum('por_vencer'))} tone="warning" hint="Stock mínimo y vencimientos" />
            <Stat label="Inventario a costo" value={money(sum('valor_inventario'))} tone="accent" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {stores.map((s) => (
              <StoreCard key={s.id} s={s} onEnter={() => enter(s)} onEdit={() => setEditing(s)} onToggle={() => toggle(s)} />
            ))}
          </div>
        </>
      )}

      {editing && (
        <StoreModal
          store={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            setNotice(msg)
            reload()
          }}
        />
      )}
    </div>
  )
}

function StoreCard({ s, onEnter, onEdit, onToggle }) {
  const alerts = s.stock_bajo + s.vencidos + s.por_vencer
  return (
    <article
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: 'var(--color-bg-surface)',
        border: `1px solid ${s.activa ? s.color + '66' : 'var(--color-border)'}`,
        opacity: s.activa ? 1 : 0.6,
      }}
    >
      <div style={{ height: 6, backgroundColor: s.color }} />
      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate" style={{ color: s.color }}>{s.nombre}</h2>
            <p className="text-xs text-muted truncate">{s.direccion}</p>
            {s.telefono && <p className="text-xs text-muted">Tel. {s.telefono}</p>}
          </div>
          <Badge tone={s.activa ? 'success' : 'neutral'}>{s.activa ? 'Activa' : 'Inactiva'}</Badge>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Mini label="Ventas hoy" value={number(s.ventas_hoy)} sub={money(s.total_hoy)} />
          <Mini label="Productos" value={number(s.productos)} sub={money(s.valor_inventario)} />
          <Mini label="Personal" value={number(s.personal)} sub={`${s.turnos_abiertos} en turno`} />
        </dl>

        <div className="flex flex-wrap gap-1.5">
          {alerts === 0 ? (
            <Badge tone="success">Sin alertas</Badge>
          ) : (
            <>
              {s.stock_bajo > 0 && <Badge tone="warning">{s.stock_bajo} en stock mínimo</Badge>}
              {s.vencidos > 0 && <Badge tone="error">{s.vencidos} vencido(s)</Badge>}
              {s.por_vencer > 0 && <Badge tone="info">{s.por_vencer} por vencer</Badge>}
            </>
          )}
          {s.pedidos_abiertos > 0 && <Badge tone="neutral">{s.pedidos_abiertos} venta(s) abiertas</Badge>}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onEnter}
            disabled={!s.activa}
            className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: s.color }}
          >
            Administrar tienda →
          </button>
          <Button variant="ghost" onClick={onEdit}>Configurar</Button>
          <Button variant={s.activa ? 'danger' : 'ghost'} onClick={onToggle}>
            {s.activa ? 'Inactivar' : 'Activar'}
          </Button>
        </div>
      </div>
    </article>
  )
}

function Mini({ label, value, sub }) {
  return (
    <div className="rounded-lg px-2 py-2" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
      <dt className="text-[10px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-lg font-bold tabular">{value}</dd>
      <dd className="text-[11px] text-muted truncate">{sub}</dd>
    </div>
  )
}

function StoreModal({ store, onClose, onSaved }) {
  const isNew = !store.id
  const [form, setForm] = useState({
    nombre: store.nombre || '',
    direccion: store.direccion || '',
    telefono: store.telefono || '',
    color: store.color || PALETTE[3],
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(isNew ? '/venues' : `/venues/${store.id}`, { method: isNew ? 'POST' : 'PUT', body: form, noStore: true })
      onSaved(isNew ? `Tienda ${form.nombre} creada.` : `Tienda ${form.nombre} actualizada.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'Nueva tienda' : `Configurar ${store.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="store-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="store-form" onSubmit={save} className="flex flex-col gap-4">
        <Notice tone="error">{error}</Notice>
        <Field label="Nombre">
          <input className="input-field" value={form.nombre} onChange={set('nombre')} required maxLength={100} autoFocus />
        </Field>
        <Field label="Dirección">
          <input className="input-field" value={form.direccion} onChange={set('direccion')} required maxLength={255} />
        </Field>
        <Field label="Teléfono">
          <input className="input-field" value={form.telefono} onChange={set('telefono')} maxLength={30} />
        </Field>
        <Field label="Color de la tienda" hint="Se usa como color principal de la interfaz al operar esta tienda.">
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                aria-label={`Color ${c}`}
                className="w-8 h-8 rounded-md"
                style={{ backgroundColor: c, outline: form.color.toUpperCase() === c ? '2px solid var(--color-text-primary)' : 'none', outlineOffset: 2 }}
              />
            ))}
            <input type="color" value={form.color} onChange={set('color')} className="w-10 h-8 rounded cursor-pointer bg-transparent" aria-label="Otro color" />
          </div>
        </Field>
      </form>
    </Modal>
  )
}
