import { useState } from 'react'
import { download } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  date, dateTime, expiryState, money, number, PAYMENT_LABELS, ROLE_LABELS, stockState, todayISO, UNIT_SHORT,
} from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Notice, PageHeader, Stat, Table, Tabs, useApi } from '../components/ui'

/**
 * Reportes consolidados de ventas, inventario y personal por período,
 * exportables en CSV o XLSX (RF-12 / CU-08).
 * Con tienda activa: reportes de esa tienda. Vista general: todas las tiendas.
 */
export default function Reports() {
  const { store } = useAuth()
  const [tab, setTab] = useState('sales')
  const [from, setFrom] = useState(todayISO(-30))
  const [to, setTo] = useState(todayISO())
  const [error, setError] = useState('')
  const range = `from=${from}&to=${to}`

  async function exportAs(kind, format) {
    setError('')
    try {
      const qs = kind === 'inventory' ? `format=${format}` : `${range}&format=${format}`
      await download(`/reports/${kind}/export?${qs}`, `reporte_${kind}.${format}`)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle={store ? `Tienda ${store.nombre}` : 'Consolidado de todas las tiendas'}
        actions={
          <>
            <Button variant="ghost" onClick={() => exportAs(tab, 'csv')}>Exportar CSV</Button>
            <Button onClick={() => exportAs(tab, 'xlsx')}>Exportar XLSX</Button>
          </>
        }
      />
      <Notice tone="error" onClose={() => setError('')}>{error}</Notice>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'sales', label: 'Ventas' },
          { value: 'inventory', label: 'Inventario' },
          { value: 'staff', label: 'Personal' },
        ]}
      />
      {tab !== 'inventory' && (
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <Field label="Desde"><input className="input-field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta"><input className="input-field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      )}
      {tab === 'sales' && <SalesReport range={range} storeKey={store?.id} />}
      {tab === 'inventory' && <InventoryReport storeKey={store?.id} />}
      {tab === 'staff' && <StaffReport range={range} storeKey={store?.id} />}
    </div>
  )
}

function SalesReport({ range, storeKey }) {
  const { data, error, loading } = useApi(`/reports/sales?${range}`, [storeKey])
  if (loading && !data) return <Loading />
  if (error) return <Notice tone="error">{error}</Notice>
  const { kpis, top_products: top, rows } = data
  const profit = rows.reduce((a, r) => a + r.ganancia, 0)
  const ticket = kpis.transaction_count ? kpis.total_revenue / kpis.transaction_count : 0
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Ingresos" value={money(kpis.total_revenue)} tone="success" />
        <Stat label="Ventas" value={number(kpis.transaction_count)} />
        <Stat label="Ticket promedio" value={money(ticket)} tone="neutral" />
        <Stat label="Ganancia bruta" value={money(profit)} tone="accent" />
        <Stat label="Ventas anuladas" value={number(kpis.voided_count)} tone="error" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <Card title="Más vendidos">
          {top.length === 0 ? <Empty>Sin ventas en el período.</Empty> : (
            <ol className="flex flex-col gap-2 text-sm">
              {top.map((t, i) => (
                <li key={t.producto_id} className="flex justify-between gap-2">
                  <span className="truncate"><span className="text-muted">{i + 1}.</span> {t.nombre}</span>
                  <span className="font-semibold tabular">{number(t.total_quantity)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={`Detalle (${rows.length} líneas)`}>
          {rows.length === 0 ? <Empty>Sin ventas en el período.</Empty> : (
            <Table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Venta</th><th>Producto</th><th className="num">Cant.</th>
                  <th className="num">Precio</th><th className="num">Ganancia</th><th>Tienda</th><th>Cajero</th><th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap">{dateTime(r.fecha)}</td>
                    <td>#{r.order_id}</td>
                    <td>{r.producto}</td>
                    <td className="num">{r.cantidad_vendida}</td>
                    <td className="num">{money(r.precio_venta)}</td>
                    <td className="num">{money(r.ganancia)}</td>
                    <td>{r.sede}</td>
                    <td>{r.cajero}</td>
                    <td>{PAYMENT_LABELS[r.metodo_pago]}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}

function InventoryReport({ storeKey }) {
  const { data, error, loading } = useApi('/reports/inventory', [storeKey])
  if (loading && !data) return <Loading />
  if (error) return <Notice tone="error">{error}</Notice>
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Productos" value={number(data.total_productos)} tone="neutral" hint={`${number(data.total_unidades)} unidades`} />
        <Stat label="Valor a costo" value={money(data.valor_costo)} tone="accent" />
        <Stat label="Valor a precio de venta" value={money(data.valor_venta)} tone="success" />
        <Stat label="En stock mínimo" value={number(data.stock_bajo)} tone="warning" />
        <Stat label="Vencidos / por vencer" value={`${data.vencidos} / ${data.por_vencer}`} tone="error" />
      </div>
      <Card>
        {data.rows.length === 0 ? <Empty>Sin productos.</Empty> : (
          <Table>
            <thead>
              <tr>
                <th>Tienda</th><th>Código</th><th>Producto</th><th>Categoría</th><th className="num">Stock</th>
                <th className="num">Mín.</th><th className="num">Valor costo</th><th>Estado</th><th>Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                const st = stockState(r.stock_actual, r.stock_minimo)
                const ex = expiryState(r.fecha_vencimiento, data.expiry_alert_days)
                return (
                  <tr key={i}>
                    <td>{r.sede}</td>
                    <td className="tabular text-muted">{r.codigo_barras}</td>
                    <td className="font-medium">{r.producto}</td>
                    <td className="text-muted">{r.categoria}</td>
                    <td className="num">{r.stock_actual} {UNIT_SHORT[r.unidad_medida]}</td>
                    <td className="num text-muted">{r.stock_minimo}</td>
                    <td className="num">{money(r.valor_costo)}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td><Badge tone={ex.tone}>{r.fecha_vencimiento ? `${date(r.fecha_vencimiento)} · ${ex.label}` : ex.label}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}

function StaffReport({ range, storeKey }) {
  const { data, error, loading } = useApi(`/reports/staff?${range}`, [storeKey])
  if (loading && !data) return <Loading />
  if (error) return <Notice tone="error">{error}</Notice>
  const sales = data.rows.reduce((a, r) => a + r.total_ventas, 0)
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Personal" value={number(data.total_personal)} tone="neutral" />
        <Stat label="Activos" value={number(data.activos)} tone="success" />
        <Stat label="Turnos cerrados" value={number(data.rows.reduce((a, r) => a + r.turnos_cerrados, 0))} />
        <Stat label="Ventas del personal" value={money(sales)} tone="accent" />
      </div>
      <Card>
        <Table>
          <thead>
            <tr>
              <th>Nombre</th><th>Cargo</th><th>Tienda</th><th>Estado</th><th>Ingreso</th>
              <th className="num">Turnos asignados</th><th className="num">Cerrados</th><th className="num">Ventas</th><th className="num">Total vendido</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.usuario_id}>
                <td className="font-medium">{r.nombre} <span className="text-muted text-xs">({r.username})</span></td>
                <td>{ROLE_LABELS[r.rol]}</td>
                <td>{r.sede}</td>
                <td><Badge tone={r.activo ? 'success' : 'neutral'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                <td>{date(r.fecha_ingreso)}</td>
                <td className="num">{r.turnos_asignados}</td>
                <td className="num">{r.turnos_cerrados}</td>
                <td className="num">{r.ventas}</td>
                <td className="num">{money(r.total_ventas)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
