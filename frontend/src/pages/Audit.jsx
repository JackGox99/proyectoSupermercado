import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { dateTime, ROLE_LABELS, todayISO } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageHeader, Table, useApi } from '../components/ui'

const RESULT = {
  exito: { label: 'Éxito', tone: 'success' },
  denegado: { label: 'Denegado', tone: 'error' },
  fallido: { label: 'Fallido', tone: 'warning' },
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
        title="Bitácora de auditoría"
        subtitle={`Operaciones críticas e intentos de acceso no autorizados${store ? ` · tienda ${store.nombre}` : ' · todas las tiendas'}.`}
      />
      <Notice tone="error">{error}</Notice>
      <Card className="mb-4">
        <form
          className="grid grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_1fr_1fr_auto] gap-3 items-end"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(filters)
          }}
        >
          <Field label="Desde"><input className="input-field" type="date" value={filters.from} onChange={set('from')} /></Field>
          <Field label="Hasta"><input className="input-field" type="date" value={filters.to} onChange={set('to')} /></Field>
          <Field label="Acción">
            <select className="input-field" value={filters.accion} onChange={set('accion')}>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Usuario"><input className="input-field" value={filters.usuario} onChange={set('usuario')} placeholder="usuario…" /></Field>
          <Field label="Resultado">
            <select className="input-field" value={filters.resultado} onChange={set('resultado')}>
              <option value="">Todos</option>
              {Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Button type="submit">Filtrar</Button>
        </form>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card><Empty>No hay registros para estos filtros.</Empty></Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Resultado</th><th>Detalle</th><th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateTime(r.fecha)}</td>
                <td className="font-medium">{r.username || '—'}</td>
                <td className="text-muted whitespace-nowrap">{ROLE_LABELS[r.rol] || '—'}</td>
                <td className="tabular whitespace-nowrap">{r.accion}{r.entidad_id ? ` #${r.entidad_id}` : ''}</td>
                <td><Badge tone={RESULT[r.resultado]?.tone}>{RESULT[r.resultado]?.label}</Badge></td>
                <td className="text-muted">{r.detalle || `${r.metodo} ${r.ruta}`}</td>
                <td className="text-muted tabular">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
