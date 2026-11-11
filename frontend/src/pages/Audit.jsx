import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { dateTime, ROLE_LABELS, todayISO } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageHeader, Table, useApi } from '../components/ui'

const RESULT = {
  exito: { label: 'Éxito', tone: 'success', icon: 'check2' },
  denegado: { label: 'Denegado', tone: 'error', icon: 'shield-x' },
  fallido: { label: 'Fallido', tone: 'warning', icon: 'exclamation-triangle' },
}

const ACTIONS = {
  '': 'Todas las acciones',
  sesion: 'Inicios de sesión',
  venta: 'Ventas',
  inventario: 'Inventario',
  producto: 'Productos',
  usuario: 'Usuarios',
  turno: 'Turnos',
  tienda: 'Tiendas',
  categoria: 'Categorías',
  reporte: 'Reportes',
  'acceso.denegado': 'Accesos denegados',
}

/**
 * Bitácora de auditoría (RF-13): quién hizo qué, cuándo y con qué resultado.
 * Incluye los intentos rechazados por permisos (RN-04 / RN-06).
 */
export default function Audit() {
  const { store } = useAuth()
  const [filters, setFilters] = useState({ from: todayISO(-7), to: todayISO(), accion: '', usuario: '', resultado: '' })
  const [applied, setApplied] = useState(filters)
  const qs = new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString()
  const { data, error, loading } = useApi(`/audit?${qs}`, [store?.id])
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const rows = data || []

  return (
    <div>
      <PageHeader
        icon="shield-check"
        title="Bitácora de auditoría"
        subtitle={`Operaciones críticas e intentos de acceso no autorizados${store ? ` · tienda ${store.nombre}` : ' · todas las tiendas'}.`}
      />
      <Notice tone="error">{error}</Notice>
      <Card className="mb-4">
        <form
          className="row g-3 align-items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(filters)
          }}
        >
          <div className="col-6 col-lg-2"><Field label="Desde"><input className="form-control" type="date" value={filters.from} onChange={set('from')} /></Field></div>
          <div className="col-6 col-lg-2"><Field label="Hasta"><input className="form-control" type="date" value={filters.to} onChange={set('to')} /></Field></div>
          <div className="col-md-4 col-lg-3">
            <Field label="Acción">
              <select className="form-select" value={filters.accion} onChange={set('accion')}>
                {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-md-4 col-lg-2"><Field label="Usuario"><input className="form-control" value={filters.usuario} onChange={set('usuario')} placeholder="usuario…" /></Field></div>
          <div className="col-md-4 col-lg-2">
            <Field label="Resultado">
              <select className="form-select" value={filters.resultado} onChange={set('resultado')}>
                <option value="">Todos</option>
                {Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="col-lg-1"><Button type="submit" icon="funnel" className="w-100">Filtrar</Button></div>
        </form>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card><Empty icon="shield-check">No hay registros para estos filtros.</Empty></Card>
      ) : (
        <Table small>
          <thead>
            <tr>
              <th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Resultado</th><th>Detalle</th><th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-nowrap">{dateTime(r.fecha)}</td>
                <td className="fw-medium">{r.username || '—'}</td>
                <td className="text-body-secondary text-nowrap">{ROLE_LABELS[r.rol] || '—'}</td>
                <td className="text-nowrap"><code className="small">{r.accion}</code>{r.entidad_id ? <span className="text-body-secondary"> #{r.entidad_id}</span> : ''}</td>
                <td><Badge tone={RESULT[r.resultado]?.tone} icon={RESULT[r.resultado]?.icon}>{RESULT[r.resultado]?.label}</Badge></td>
                <td className="text-body-secondary">{r.detalle || `${r.metodo} ${r.ruta}`}</td>
                <td className="text-body-secondary tabular">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
