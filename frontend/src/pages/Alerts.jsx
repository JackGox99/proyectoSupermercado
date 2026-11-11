import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { date } from '../lib/format'
import { Badge, Empty, Loading, Notice, PageHeader, Table, Tabs, useApi } from '../components/ui'

const TYPES = {
  vencido: { label: 'Vencido — retirar', tone: 'error', order: 0 },
  agotado: { label: 'Agotado', tone: 'error', order: 1 },
  stock_minimo: { label: 'Stock mínimo', tone: 'warning', order: 2 },
  por_vencer: { label: 'Próximo a vencer', tone: 'info', order: 3 },
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
export function AlertList({ alerts, compact = false }) {
  if (!alerts.length) return <Empty>Sin alertas: el inventario está al día. ✅</Empty>
  const sorted = [...alerts].sort((a, b) => TYPES[a.tipo].order - TYPES[b.tipo].order || a.producto.localeCompare(b.producto))
  return (
    <Table>
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
            <td><Badge tone={TYPES[a.tipo].tone}>{TYPES[a.tipo].label}</Badge></td>
            <td className="font-medium">{a.producto}</td>
            {!compact && <td className="tabular text-muted">{a.codigo_barras}</td>}
            <td className="text-muted">{detail(a)}</td>
            <td className="num">{a.stock_actual}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
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
        title="Alertas de inventario"
        subtitle={`Stock mínimo y productos vencidos o que vencen en los próximos ${data?.expiry_window_days ?? 7} días.`}
      />
      <Notice tone="error">{error}</Notice>
      {rol === 'auxiliar_bodega' && alerts.length > 0 && (
        <Notice tone="info">
          Repón existencias desde <Link to="/inventario?accion=entrada">Entrada de mercancía</Link> y retira los vencidos con un{' '}
          <Link to="/inventario?accion=ajuste">ajuste por vencimiento</Link>.
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
      {loading && !data ? <Loading /> : <AlertList alerts={shown} />}
    </div>
  )
}
