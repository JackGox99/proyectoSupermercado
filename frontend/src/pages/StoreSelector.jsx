import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { money, number } from '../lib/format'
import { STORE_PALETTE } from '../lib/theme'
import { Badge, Button, Field, Icon, Loading, Modal, Notice, PageHeader, Stat, useApi } from '../components/ui'

/**
 * Selector de tiendas — pantalla inicial del administrador general.
 *
 * Muestra cada tienda con su color y sus indicadores del día, el consolidado
 * de todas las tiendas, y permite crear, configurar e inactivar tiendas
 * (RF-01 / CU-09 / RN-06). Al elegir "Administrar" la aplicación entra en el
 * contexto de esa tienda: todas las pantallas pasan a mostrar sus datos.
 */
export default function StoreSelector() {
  const { selectStore } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi('/venues/overview')
  const [editing, setEditing] = useState(null)
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
    if (s.activa && !window.confirm(`¿Inactivar la tienda ${s.nombre}? Su personal no podrá iniciar sesión hasta reactivarla.`)) return
    setActionError('')
    try {
      await api(`/venues/${s.id}/status`, { method: 'PATCH', body: { activa: !s.activa }, noStore: true })
      setNotice(`Tienda ${s.nombre} ${s.activa ? 'inactivada' : 'activada'}.`)
      reload()
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="¿Qué tienda quieres administrar?"
        subtitle="Elige una tienda para operar sobre ella, o revisa el consolidado de todas."
        actions={
          <>
            <Button variant="ghost" icon="graph-up" onClick={() => navigate('/panel')}>Ver consolidado</Button>
            <Button icon="plus-lg" onClick={() => setEditing({})}>Nueva tienda</Button>
          </>
        }
      />

      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setActionError('')}>{actionError || error}</Notice>

      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <div className="row g-3 mb-4 row-cols-2 row-cols-md-3 row-cols-xl-5">
            <div className="col"><Stat icon="shop" label="Tiendas activas" value={`${active.length} / ${stores.length}`} tone="neutral" /></div>
            <div className="col"><Stat icon="receipt" label="Ventas de hoy" value={number(sum('ventas_hoy'))} /></div>
            <div className="col"><Stat icon="cash-coin" label="Total vendido hoy" value={money(sum('total_hoy'))} tone="success" /></div>
            <div className="col"><Stat icon="bell" label="Alertas" value={number(sum('stock_bajo') + sum('vencidos') + sum('por_vencer'))} tone="warning" hint="Stock mínimo y vencimientos" /></div>
            <div className="col"><Stat icon="boxes" label="Inventario a costo" value={money(sum('valor_inventario'))} tone="info" /></div>
          </div>

          <div className="row g-4 row-cols-1 row-cols-md-2 row-cols-xxl-3">
            {stores.map((s) => (
              <div className="col" key={s.id}>
                <StoreCard s={s} onEnter={() => enter(s)} onEdit={() => setEditing(s)} onToggle={() => toggle(s)} />
              </div>
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
    <article className="card store-card h-100" style={{ opacity: s.activa ? 1 : 0.6 }}>
      <div className="store-band" style={{ backgroundColor: s.color }} />
      <div className="card-body d-flex flex-column gap-3">
        <div className="d-flex align-items-start gap-3">
          <div className="store-avatar" style={{ backgroundColor: s.color }}><Icon name="shop" /></div>
          <div className="min-w-0 flex-grow-1">
            <h2 className="h5 fw-bold mb-0 text-truncate">{s.nombre}</h2>
            <div className="small text-body-secondary text-truncate"><Icon name="geo-alt" className="me-1" />{s.direccion}</div>
            {s.telefono && <div className="small text-body-secondary"><Icon name="telephone" className="me-1" />{s.telefono}</div>}
          </div>
          <Badge tone={s.activa ? 'success' : 'neutral'}>{s.activa ? 'Activa' : 'Inactiva'}</Badge>
        </div>

        <div className="row g-2 text-center">
          <div className="col-4"><Mini label="Ventas hoy" value={number(s.ventas_hoy)} sub={money(s.total_hoy)} /></div>
          <div className="col-4"><Mini label="Productos" value={number(s.productos)} sub={money(s.valor_inventario)} /></div>
          <div className="col-4"><Mini label="Personal" value={number(s.personal)} sub={`${s.turnos_abiertos} en turno`} /></div>
        </div>

        <div className="d-flex flex-wrap gap-1">
          {alerts === 0 ? (
            <Badge tone="success" icon="check2">Sin alertas</Badge>
          ) : (
            <>
              {s.stock_bajo > 0 && <Badge tone="warning" icon="arrow-down-circle">{s.stock_bajo} en stock mínimo</Badge>}
              {s.vencidos > 0 && <Badge tone="error" icon="x-octagon">{s.vencidos} vencido(s)</Badge>}
              {s.por_vencer > 0 && <Badge tone="info" icon="hourglass-split">{s.por_vencer} por vencer</Badge>}
            </>
          )}
          {s.pedidos_abiertos > 0 && <Badge tone="neutral">{s.pedidos_abiertos} venta(s) abiertas</Badge>}
        </div>

        <div className="mt-auto d-flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEnter}
            disabled={!s.activa}
            className="btn text-white flex-grow-1 btn-icon justify-content-center"
            style={{ backgroundColor: s.color, borderColor: s.color }}
          >
            Administrar tienda <Icon name="arrow-right" />
          </button>
          <Button variant="ghost" icon="gear" onClick={onEdit} aria-label="Configurar">
            <span className="d-none d-sm-inline">Configurar</span>
          </Button>
          <Button variant={s.activa ? 'danger' : 'ghost'} icon={s.activa ? 'pause-circle' : 'play-circle'} onClick={onToggle}>
            {s.activa ? 'Inactivar' : 'Activar'}
          </Button>
        </div>
      </div>
    </article>
  )
}

function Mini({ label, value, sub }) {
  return (
    <div className="mini-stat h-100">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      <div className="sub text-truncate">{sub}</div>
    </div>
  )
}

function StoreModal({ store, onClose, onSaved }) {
  const isNew = !store.id
  const [form, setForm] = useState({
    nombre: store.nombre || '',
    direccion: store.direccion || '',
    telefono: store.telefono || '',
    color: store.color || STORE_PALETTE[3],
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
          <Button type="submit" form="store-form" disabled={saving} icon="check-lg">{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="store-form" onSubmit={save} className="vstack gap-3">
        <Notice tone="error">{error}</Notice>
        <Field label="Nombre">
          <input className="form-control" value={form.nombre} onChange={set('nombre')} required maxLength={100} autoFocus />
        </Field>
        <Field label="Dirección">
          <input className="form-control" value={form.direccion} onChange={set('direccion')} required maxLength={255} />
        </Field>
        <Field label="Teléfono">
          <input className="form-control" value={form.telefono} onChange={set('telefono')} maxLength={30} />
        </Field>
        <Field label="Color de la tienda" hint="Se usa como color principal de la interfaz al operar esta tienda.">
          <div className="d-flex flex-wrap align-items-center gap-2">
            {STORE_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                aria-label={`Color ${c}`}
                className="rounded-3 border-0"
                style={{
                  width: 34,
                  height: 34,
                  backgroundColor: c,
                  outline: form.color.toUpperCase() === c ? '3px solid var(--bs-body-color)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
            <input type="color" value={form.color} onChange={set('color')} className="form-control form-control-color" aria-label="Otro color" />
          </div>
        </Field>
      </form>
    </Modal>
  )
}
