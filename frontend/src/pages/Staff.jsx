import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { date, isoDate, ROLE_LABELS, ROLE_TONES } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Icon, Loading, Modal, Notice, PageHeader, StoreDot, Table, useApi } from '../components/ui'

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

/**
 * Personal (RF-02 / RF-10 / CU-06): usuarios con sus datos básicos, cargo,
 * estado y fecha de ingreso.
 *  - Administrador general: gestiona a todo el personal y designa a los
 *    administradores de tienda.
 *  - Administrador de tienda: gestiona cajeros y auxiliares de su tienda.
 */
export default function Staff() {
  const { store, isGeneralAdmin, user } = useAuth()
  const [sortBy, setSortBy] = useState('')
  const users = useApi(`/users${sortBy ? `?sort_by=${sortBy}` : ''}`, [store?.id])
  const venues = useApi(isGeneralAdmin ? '/venues' : null)
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)

  const list = users.data || []
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return list.filter((u) => {
      if (onlyActive && !u.activo) return false
      if (!t) return true
      return [u.nombre, u.username, u.documento].some((v) => v?.toLowerCase().includes(t))
    })
  }, [list, q, onlyActive])

  const canManage = (u) => isGeneralAdmin || u.rol === 'cajero' || u.rol === 'auxiliar_bodega'

  async function setActive(u, activo) {
    if (!activo && !window.confirm(`¿Inactivar a ${u.nombre}? No podrá iniciar sesión (RN-12).`)) return
    setError('')
    try {
      if (activo) await api(`/users/${u.id}`, { method: 'PUT', body: { activo: true } })
      else await api(`/users/${u.id}/deactivate`, { method: 'PATCH' })
      setNotice(`${u.nombre} ${activo ? 'reactivado' : 'inactivado'}.`)
      users.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <PageHeader
        icon="people"
        title="Personal"
        subtitle={store ? `Empleados de la tienda ${store.nombre}.` : 'Todo el personal de la plataforma.'}
        actions={<Button icon="person-plus" onClick={() => setEditing({})}>Nuevo empleado</Button>}
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setError('')}>{error || users.error}</Notice>

      <Card>
        <div className="row g-2 align-items-center mb-3">
          <div className="col-md-5">
            <div className="input-group">
              <span className="input-group-text bg-transparent"><Icon name="search" /></span>
              <input className="form-control" placeholder="Buscar por nombre, usuario o documento…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="col-md-4">
            <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Ordenar">
              <option value="">Orden de registro</option>
              <option value="username">Usuario A-Z (QuickSort)</option>
              <option value="nombre">Nombre A-Z (MergeSort)</option>
            </select>
          </div>
          <div className="col-md-3">
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" role="switch" id="onlyActive" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              <label className="form-check-label small" htmlFor="onlyActive">Solo activos</label>
            </div>
          </div>
        </div>

        {users.loading && !users.data ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty icon="people">No hay empleados que coincidan.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Documento</th>
                <th>Cargo</th>
                {!store && <th>Tienda</th>}
                <th>Teléfono</th>
                <th>Ingreso</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.6 }}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="avatar" style={{ width: 32, height: 32, fontSize: '0.75rem' }}>{initials(u.nombre)}</span>
                      <div className="min-w-0">
                        <div className="fw-medium text-truncate">{u.nombre}</div>
                        <div className="small text-body-secondary">@{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tabular">{u.documento || '—'}</td>
                  <td><Badge tone={ROLE_TONES[u.rol]}>{ROLE_LABELS[u.rol]}</Badge></td>
                  {!store && (
                    <td>{u.sede ? <span className="d-flex align-items-center gap-2"><StoreDot color={u.sede.color} />{u.sede.nombre}</span> : <span className="text-body-secondary">Todas</span>}</td>
                  )}
                  <td className="text-body-secondary">{u.telefono || '—'}</td>
                  <td className="text-nowrap">{date(u.fecha_ingreso)}</td>
                  <td><Badge tone={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                  <td className="text-end text-nowrap">
                    {canManage(u) && u.id !== user?.user_id && (
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(u)} title="Editar"><Icon name="pencil" /></button>
                        {u.activo ? (
                          <button type="button" className="btn btn-outline-danger" onClick={() => setActive(u, false)} title="Inactivar"><Icon name="person-slash" /></button>
                        ) : (
                          <button type="button" className="btn btn-outline-success" onClick={() => setActive(u, true)} title="Reactivar"><Icon name="person-check" /></button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && (
        <StaffModal
          person={editing}
          venues={venues.data || []}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            setNotice(msg)
            users.reload()
          }}
        />
      )}
    </div>
  )
}

function StaffModal({ person, venues, onClose, onSaved }) {
  const { isGeneralAdmin, store } = useAuth()
  const isNew = !person.id
  const roleOptions = isGeneralAdmin ? ['admin_tienda', 'cajero', 'auxiliar_bodega', 'admin'] : ['cajero', 'auxiliar_bodega']
  const [form, setForm] = useState({
    full_name: person.nombre || '',
    username: person.username || '',
    password: '',
    role: person.rol || 'cajero',
    sede_id: String(person.sede_id ?? store?.id ?? ''),
    documento: person.documento || '',
    telefono: person.telefono || '',
    email: person.email || '',
    fecha_ingreso: isoDate(person.fecha_ingreso) || '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const needsStore = form.role !== 'admin'

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const sede = needsStore && form.sede_id ? Number(form.sede_id) : null
    try {
      if (isNew) {
        await api('/users', { method: 'POST', body: { ...form, sede_id: sede } })
        onSaved(`${form.full_name} registrado como ${ROLE_LABELS[form.role].toLowerCase()}.`)
      } else {
        const body = {
          nombre: form.full_name,
          role: form.role,
          sede_id: sede,
          documento: form.documento,
          telefono: form.telefono,
          email: form.email,
          fecha_ingreso: form.fecha_ingreso,
        }
        if (form.password) body.password = form.password
        await api(`/users/${person.id}`, { method: 'PUT', body })
        onSaved(`${form.full_name} actualizado.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={isNew ? 'Nuevo empleado' : `Editar ${person.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="staff-form" icon="check-lg" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={save} className="row g-3">
        {error && <div className="col-12"><Notice tone="error">{error}</Notice></div>}
        <div className="col-md-6">
          <Field label="Nombre completo">
            <input className="form-control" value={form.full_name} onChange={set('full_name')} required minLength={2} autoFocus />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Usuario (inicio de sesión)">
            <div className="input-group">
              <span className="input-group-text">@</span>
              <input className="form-control" value={form.username} onChange={set('username')} required minLength={3} disabled={!isNew} />
            </div>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label={isNew ? 'Contraseña' : 'Nueva contraseña (opcional)'} hint="Mínimo 8 caracteres. Se guarda cifrada (RNF-01).">
            <input className="form-control" type="password" value={form.password} onChange={set('password')} required={isNew} minLength={8} autoComplete="new-password" />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Cargo (rol)">
            <select className="form-select" value={form.role} onChange={set('role')}>
              {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
        </div>
        {isGeneralAdmin && needsStore && (
          <div className="col-md-6">
            <Field label="Tienda asignada">
              <select className="form-select" value={form.sede_id} onChange={set('sede_id')} required>
                <option value="">Selecciona…</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </Field>
          </div>
        )}
        <div className="col-md-6">
          <Field label="Documento de identidad">
            <input className="form-control" value={form.documento} onChange={set('documento')} maxLength={20} />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Teléfono">
            <input className="form-control" value={form.telefono} onChange={set('telefono')} maxLength={30} />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Correo">
            <input className="form-control" type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Fecha de ingreso">
            <input className="form-control" type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
