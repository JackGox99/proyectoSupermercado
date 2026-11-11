import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { date, isoDate, ROLE_LABELS, ROLE_TONES } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice, PageHeader, StoreDot, Table, useApi } from '../components/ui'

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
        title="Personal"
        subtitle={store ? `Empleados de la tienda ${store.nombre}.` : 'Todo el personal de la plataforma.'}
        actions={<Button onClick={() => setEditing({})}>+ Nuevo empleado</Button>}
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setError('')}>{error || users.error}</Notice>

      <Card>
        <div className="flex flex-col md:flex-row gap-2 mb-3 md:items-center">
          <input className="input-field md:max-w-sm" placeholder="Buscar por nombre, usuario o documento…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input-field md:max-w-[300px]" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Ordenar">
            <option value="">Orden de registro</option>
            <option value="username">Usuario A-Z (QuickSort)</option>
            <option value="nombre">Nombre A-Z (MergeSort)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Solo activos
          </label>
        </div>

        {users.loading && !users.data ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>No hay empleados que coincidan.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
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
                  <td className="font-medium">{u.nombre}</td>
                  <td className="text-muted">{u.username}</td>
                  <td className="tabular">{u.documento || '—'}</td>
                  <td><Badge tone={ROLE_TONES[u.rol]}>{ROLE_LABELS[u.rol]}</Badge></td>
                  {!store && (
                    <td>{u.sede ? <span className="flex items-center gap-2"><StoreDot color={u.sede.color} />{u.sede.nombre}</span> : <span className="text-muted">Todas</span>}</td>
                  )}
                  <td className="text-muted">{u.telefono || '—'}</td>
                  <td className="whitespace-nowrap">{date(u.fecha_ingreso)}</td>
                  <td><Badge tone={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                  <td className="text-right whitespace-nowrap">
                    {canManage(u) && u.id !== user?.user_id && (
                      <>
                        <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setEditing(u)}>Editar</Button>{' '}
                        {u.activo ? (
                          <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => setActive(u, false)}>Inactivar</Button>
                        ) : (
                          <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setActive(u, true)}>Reactivar</Button>
                        )}
                      </>
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
          <Button type="submit" form="staff-form" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
        <Field label="Nombre completo">
          <input className="input-field" value={form.full_name} onChange={set('full_name')} required minLength={2} autoFocus />
        </Field>
        <Field label="Usuario (inicio de sesión)">
          <input className="input-field" value={form.username} onChange={set('username')} required minLength={3} disabled={!isNew} />
        </Field>
        <Field label={isNew ? 'Contraseña' : 'Nueva contraseña (opcional)'} hint="Mínimo 8 caracteres. Se guarda cifrada (RNF-01).">
          <input className="input-field" type="password" value={form.password} onChange={set('password')} required={isNew} minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Cargo (rol)">
          <select className="input-field" value={form.role} onChange={set('role')}>
            {roleOptions.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field>
        {isGeneralAdmin && needsStore && (
          <Field label="Tienda asignada">
            <select className="input-field" value={form.sede_id} onChange={set('sede_id')} required>
              <option value="">Selecciona…</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </Field>
        )}
        <Field label="Documento de identidad">
          <input className="input-field" value={form.documento} onChange={set('documento')} maxLength={20} />
        </Field>
        <Field label="Teléfono">
          <input className="input-field" value={form.telefono} onChange={set('telefono')} maxLength={30} />
        </Field>
        <Field label="Correo">
          <input className="input-field" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Fecha de ingreso">
          <input className="input-field" type="date" value={form.fecha_ingreso} onChange={set('fecha_ingreso')} />
        </Field>
      </form>
    </Modal>
  )
}
