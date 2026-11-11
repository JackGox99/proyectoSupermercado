import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { date, dateTime, isAdminRole, isoDate, money, ROLE_LABELS, SHIFT_STATES, todayISO } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice, PageHeader, Table, useApi } from '../components/ui'

/**
 * Turnos del personal (RF-11 / CU-07 / RN-09).
 *  - Administradores: asignan y consultan los turnos de la tienda.
 *  - Cajero / auxiliar de bodega: inician y cierran su propio turno.
 */
export default function Shifts() {
  const { rol } = useAuth()
  return isAdminRole(rol) ? <ManageShifts /> : <MyShifts />
}

function ShiftSummary({ s }) {
  if (s.estado !== 'cerrado') return <span className="text-muted">—</span>
  return (
    <span className="whitespace-nowrap">
      {s.num_ventas} venta(s) · <strong>{money(s.total_ventas)}</strong>
    </span>
  )
}

function ManageShifts() {
  const { store } = useAuth()
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO(6))
  const shifts = useApi(`/shifts?from=${from}&to=${to}`, [store?.id])
  const users = useApi('/users', [store?.id])
  const staff = (users.data || []).filter((u) => u.activo && (u.rol === 'cajero' || u.rol === 'auxiliar_bodega'))

  const [form, setForm] = useState({ usuario_id: '', fecha: todayISO(1), hora_inicio: '06:00', hora_fin: '14:00' })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function assign(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const s = await api('/shifts', { method: 'POST', body: { ...form, usuario_id: Number(form.usuario_id) } })
      setNotice(`Turno asignado a ${s.usuario?.nombre}: ${date(s.fecha)} ${s.hora_inicio}–${s.hora_fin}.`)
      shifts.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function act(s, action) {
    setError('')
    try {
      if (action === 'delete') {
        if (!window.confirm(`¿Eliminar el turno de ${s.usuario?.nombre} del ${date(s.fecha)}?`)) return
        await api(`/shifts/${s.id}`, { method: 'DELETE' })
        setNotice('Turno eliminado.')
      } else {
        const r = await api(`/shifts/${s.id}/close`, { method: 'POST' })
        setNotice(`Turno de ${s.usuario?.nombre} cerrado: ${r.num_ventas} venta(s), ${money(r.total_ventas)}.`)
      }
      shifts.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const rows = shifts.data || []
  return (
    <div>
      <PageHeader title="Turnos del personal" subtitle={`Asigna turnos dentro del horario de operación (06:00–22:00). Tienda ${store?.nombre}.`} />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setError('')}>{error || shifts.error}</Notice>

      <Card title="Asignar turno" className="mb-6">
        <form onSubmit={assign} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <Field label="Empleado">
            <select className="input-field" value={form.usuario_id} onChange={set('usuario_id')} required>
              <option value="">Selecciona…</option>
              {staff.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {ROLE_LABELS[u.rol]}</option>)}
            </select>
          </Field>
          <Field label="Fecha">
            <input className="input-field" type="date" min={todayISO()} value={form.fecha} onChange={set('fecha')} required />
          </Field>
          <Field label="Inicio">
            <input className="input-field" type="time" min="06:00" max="22:00" value={form.hora_inicio} onChange={set('hora_inicio')} required />
          </Field>
          <Field label="Fin">
            <input className="input-field" type="time" min="06:00" max="22:00" value={form.hora_fin} onChange={set('hora_fin')} required />
          </Field>
          <Button type="submit" disabled={busy || !form.usuario_id}>Asignar</Button>
        </form>
      </Card>

      <Card
        title="Turnos programados"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <input className="input-field !py-1" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Desde" />
            <span className="text-muted">a</span>
            <input className="input-field !py-1" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Hasta" />
          </div>
        }
      >
        {shifts.loading && !shifts.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No hay turnos en este rango.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Empleado</th>
                <th>Cargo</th>
                <th>Horario</th>
                <th>Estado</th>
                <th>Cierre</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">{date(s.fecha)}{isoDate(s.fecha) === todayISO() && <span className="text-muted"> (hoy)</span>}</td>
                  <td className="font-medium">{s.usuario?.nombre}</td>
                  <td className="text-muted">{ROLE_LABELS[s.usuario?.rol]}</td>
                  <td className="tabular">{s.hora_inicio}–{s.hora_fin}</td>
                  <td><Badge tone={SHIFT_STATES[s.estado].tone}>{SHIFT_STATES[s.estado].label}</Badge></td>
                  <td><ShiftSummary s={s} /></td>
                  <td className="text-right whitespace-nowrap">
                    {s.estado === 'programado' && <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => act(s, 'delete')}>Eliminar</Button>}
                    {s.estado === 'abierto' && <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => act(s, 'close')}>Cerrar turno</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}

function MyShifts() {
  const { rol } = useAuth()
  const shifts = useApi(`/shifts?from=${todayISO(-14)}&to=${todayISO(14)}`)
  const [error, setError] = useState('')
  const [closed, setClosed] = useState(null)
  const today = todayISO()

  async function open(s) {
    setError('')
    try {
      await api(`/shifts/${s.id}/open`, { method: 'POST' })
      shifts.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  async function close(s) {
    if (!window.confirm('¿Cerrar tu turno? Se calculará el resumen de caja.')) return
    setError('')
    try {
      setClosed(await api(`/shifts/${s.id}/close`, { method: 'POST' }))
      shifts.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  const rows = shifts.data || []
  return (
    <div>
      <PageHeader title="Mis turnos" subtitle="Inicia tu turno al llegar y ciérralo al terminar la jornada." />
      <Notice tone="error" onClose={() => setError('')}>{error || shifts.error}</Notice>
      {shifts.loading && !shifts.data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card><Empty>No tienes turnos asignados en estas fechas.</Empty></Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Horario</th>
              <th>Estado</th>
              <th>Inicio / cierre</th>
              {rol === 'cajero' && <th>Cierre de caja</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="whitespace-nowrap">{date(s.fecha)}{isoDate(s.fecha) === today && <strong> (hoy)</strong>}</td>
                <td className="tabular">{s.hora_inicio}–{s.hora_fin}</td>
                <td><Badge tone={SHIFT_STATES[s.estado].tone}>{SHIFT_STATES[s.estado].label}</Badge></td>
                <td className="text-muted text-xs">{s.abierto_at ? dateTime(s.abierto_at) : '—'}{s.cerrado_at ? ` → ${dateTime(s.cerrado_at)}` : ''}</td>
                {rol === 'cajero' && <td><ShiftSummary s={s} /></td>}
                <td className="text-right">
                  {s.estado === 'programado' && isoDate(s.fecha) === today && <Button className="!py-1 !px-3 text-xs" onClick={() => open(s)}>Iniciar turno</Button>}
                  {s.estado === 'abierto' && <Button variant="ghost" className="!py-1 !px-3 text-xs" onClick={() => close(s)}>Cerrar turno</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {closed && (
        <Modal title="Turno cerrado" subtitle={`${date(closed.fecha)} · ${closed.hora_inicio}–${closed.hora_fin}`} onClose={() => setClosed(null)} footer={<Button onClick={() => setClosed(null)}>Listo</Button>}>
          {rol === 'cajero' ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Ventas registradas</dt><dd className="text-right font-semibold">{closed.num_ventas}</dd>
              <dt className="text-muted">Efectivo</dt><dd className="text-right">{money(closed.total_efectivo)}</dd>
              <dt className="text-muted">Tarjeta débito</dt><dd className="text-right">{money(closed.total_debito)}</dd>
              <dt className="text-muted">Tarjeta crédito</dt><dd className="text-right">{money(closed.total_credito)}</dd>
              <dt className="font-semibold pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>Total del turno</dt>
              <dd className="text-right text-lg font-bold pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>{money(closed.total_ventas)}</dd>
            </dl>
          ) : (
            <p className="text-sm">Tu turno quedó cerrado correctamente.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
