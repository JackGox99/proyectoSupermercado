import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { date } from '../lib/format'
import { Badge, Card, Empty, Loading, Notice, PageHeader, Tabs, useApi } from '../components/ui'

const TYPES = {
  vencido: { label: 'Vencido — retirar', tone: 'error', icon: 'x-octagon', order: 0 },
  agotado: { label: 'Agotado', tone: 'error', icon: 'slash-circle', order: 1 },
  stock_minimo: { label: 'Stock mínimo', tone: 'warning', icon: 'arrow-down-circle', order: 2 },
  por_vencer: { label: 'Próximo a vencer', tone: 'info', icon: 'hourglass-split', order: 3 },
}

function detail(a) {
  switch (a.tipo) {
    case 'vencido':
      return `Venció el ${date(a.fecha_vencimiento)}. No puede venderse (RN-03).`
    case 'por_vencer':
      return a.dias_restantes === 0 ? 'Vence hoy.' : `Vence el ${date(a.fecha_vencimiento)} (en ${a.dias_restantes} día(s)).`
    case 'agotado':
      return `Sin existencias (mínimo ${a.stock_minimo}).`
    default:
      return `Quedan ${a.stock_actual}; el mínimo es ${a.stock_minimo}.`
  }
}

/** Lista de alertas reutilizable (también en el panel). */
export function AlertList({ alerts, compact = false, flush = false }) {
  if (!alerts.length) return <Empty icon="check2-circle">Sin alertas: el inventario está al día.</Empty>
  const sorted = [...alerts].sort((a, b) => TYPES[a.tipo].order - TYPES[b.tipo].order || a.producto.localeCompare(b.producto))
  const table = (
    <table className="table table-hover align-middle mb-0">
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Producto</th>
          {!compact && <th>Código</th>}
          <th>Detalle</th>
          <th className="num">Stock</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((a, i) => (
          <tr key={`${a.tipo}-${a.producto_id}-${i}`}>
            <td><Badge tone={TYPES[a.tipo].tone} icon={TYPES[a.tipo].icon}>{TYPES[a.tipo].label}</Badge></td>
            <td className="fw-medium">{a.producto}</td>
            {!compact && <td className="tabular text-body-secondary">{a.codigo_barras}</td>}
            <td className="text-body-secondary small">{detail(a)}</td>
            <td className="num">{a.stock_actual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return <div className={`table-responsive app-table ${flush ? 'border-0 rounded-0 bg-transparent' : ''}`}>{table}</div>
}

/**
 * Alertas de inventario (RN-11 / RF-09): stock mínimo, agotados, vencidos
 * (marcados para retiro) y próximos a vencer.
 */
export default function Alerts() {
  const { store, rol } = useAuth()
  const { data, error, loading } = useApi('/alerts', [store?.id])
  const [tab, setTab] = useState('all')
  const alerts = data?.alerts || []
  const count = (t) => alerts.filter((a) => a.tipo === t).length
  const shown = tab === 'all' ? alerts : alerts.filter((a) => a.tipo === tab)

  return (
    <div>
      <PageHeader
        icon="bell"
        title="Alertas de inventario"
        subtitle={`Stock mínimo y productos vencidos o que vencen en los próximos ${data?.expiry_window_days ?? 7} días.`}
      />
      <Notice tone="error">{error}</Notice>
      {rol === 'auxiliar_bodega' && alerts.length > 0 && (
        <Notice tone="info">
          Repón existencias desde <Link to="/inventario?accion=entrada" className="alert-link">Entrada de mercancía</Link> y
          retira los vencidos con un <Link to="/inventario?accion=ajuste" className="alert-link">ajuste por vencimiento</Link>.
        </Notice>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'Todas', count: alerts.length },
          { value: 'vencido', label: 'Vencidos', count: count('vencido') },
          { value: 'por_vencer', label: 'Por vencer', count: count('por_vencer') },
          { value: 'agotado', label: 'Agotados', count: count('agotado') },
          { value: 'stock_minimo', label: 'Stock mínimo', count: count('stock_minimo') },
        ]}
      />
      {loading && !data ? <Loading /> : <Card className="overflow-hidden" bodyClassName="p-0"><AlertList alerts={shown} flush /></Card>}
    </div>
  )
}
