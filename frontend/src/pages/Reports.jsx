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
        icon="bar-chart-line"
        title="Reportes"
        subtitle={store ? `Tienda ${store.nombre}` : 'Consolidado de todas las tiendas'}
        actions={
          <>
            <Button variant="ghost" icon="filetype-csv" onClick={() => exportAs(tab, 'csv')}>CSV</Button>
            <Button variant="success" icon="file-earmark-excel" onClick={() => exportAs(tab, 'xlsx')}>Exportar Excel</Button>
          </>
        }
      />
      <Notice tone="error" onClose={() => setError('')}>{error}</Notice>
      <div className="d-flex flex-column flex-lg-row align-items-lg-end justify-content-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'sales', label: 'Ventas', icon: 'receipt' },
            { value: 'inventory', label: 'Inventario', icon: 'boxes' },
            { value: 'staff', label: 'Personal', icon: 'people' },
          ]}
        />
        {tab !== 'inventory' && (
          <div className="d-flex gap-2 mb-4">
            <Field label="Desde"><input className="form-control form-control-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Hasta"><input className="form-control form-control-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        )}
      </div>
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
  const maxQty = Math.max(1, ...top.map((t) => t.total_quantity))
  return (
    <>
      <div className="row g-3 mb-4 row-cols-2 row-cols-lg-5">
        <div className="col"><Stat icon="cash-coin" label="Ingresos" value={money(kpis.total_revenue)} tone="success" /></div>
        <div className="col"><Stat icon="receipt" label="Ventas" value={number(kpis.transaction_count)} /></div>
        <div className="col"><Stat icon="basket" label="Ticket promedio" value={money(ticket)} tone="neutral" /></div>
        <div className="col"><Stat icon="graph-up-arrow" label="Ganancia bruta" value={money(profit)} tone="info" /></div>
        <div className="col"><Stat icon="arrow-counterclockwise" label="Ventas anuladas" value={number(kpis.voided_count)} tone="error" /></div>
      </div>
      <div className="row g-4">
        <div className="col-xl-4">
          <Card title="Más vendidos" className="h-100">
            {top.length === 0 ? <Empty>Sin ventas en el período.</Empty> : (
              <div className="vstack gap-3">
                {top.map((t, i) => (
                  <div key={t.producto_id}>
                    <div className="d-flex justify-content-between small mb-1">
                      <span className="text-truncate"><span className="text-body-secondary me-1">{i + 1}.</span>{t.nombre}</span>
                      <span className="fw-semibold tabular">{number(t.total_quantity)}</span>
                    </div>
                    <div className="progress" style={{ height: 6 }} role="progressbar" aria-valuenow={t.total_quantity} aria-valuemin={0} aria-valuemax={maxQty}>
                      <div className="progress-bar bg-store" style={{ width: `${(t.total_quantity / maxQty) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="col-xl-8">
          <Card title={`Detalle (${rows.length} líneas)`} className="h-100">
            {rows.length === 0 ? <Empty>Sin ventas en el período.</Empty> : (
              <Table small>
                <thead>
                  <tr>
                    <th>Fecha</th><th>Venta</th><th>Producto</th><th className="num">Cant.</th>
                    <th className="num">Precio</th><th className="num">Ganancia</th><th>Tienda</th><th>Cajero</th><th>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r, i) => (
                    <tr key={i}>
                      <td className="text-nowrap">{dateTime(r.fecha)}</td>
                      <td>#{r.order_id}</td>
                      <td>{r.producto}</td>
                      <td className="num">{r.cantidad_vendida}</td>
                      <td className="num">{money(r.precio_venta)}</td>
                      <td className="num">{money(r.ganancia)}</td>
                      <td>{r.sede}</td>
                      <td>{r.cajero}</td>
                      <td className="text-nowrap">{PAYMENT_LABELS[r.metodo_pago]}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
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
      <div className="row g-3 mb-4 row-cols-2 row-cols-lg-5">
        <div className="col"><Stat icon="tags" label="Productos" value={number(data.total_productos)} tone="neutral" hint={`${number(data.total_unidades)} unidades`} /></div>
        <div className="col"><Stat icon="wallet2" label="Valor a costo" value={money(data.valor_costo)} tone="info" /></div>
        <div className="col"><Stat icon="cash-stack" label="Valor a precio de venta" value={money(data.valor_venta)} tone="success" /></div>
        <div className="col"><Stat icon="arrow-down-circle" label="En stock mínimo" value={number(data.stock_bajo)} tone="warning" /></div>
        <div className="col"><Stat icon="hourglass-split" label="Vencidos / por vencer" value={`${data.vencidos} / ${data.por_vencer}`} tone="error" /></div>
      </div>
      <Card>
        {data.rows.length === 0 ? <Empty>Sin productos.</Empty> : (
          <Table small>
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
                    <td className="tabular text-body-secondary">{r.codigo_barras}</td>
                    <td className="fw-medium">{r.producto}</td>
                    <td className="text-body-secondary">{r.categoria}</td>
                    <td className="num">{r.stock_actual} {UNIT_SHORT[r.unidad_medida]}</td>
                    <td className="num text-body-secondary">{r.stock_minimo}</td>
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
      <div className="row g-3 mb-4 row-cols-2 row-cols-lg-4">
        <div className="col"><Stat icon="people" label="Personal" value={number(data.total_personal)} tone="neutral" /></div>
        <div className="col"><Stat icon="person-check" label="Activos" value={number(data.activos)} tone="success" /></div>
        <div className="col"><Stat icon="calendar-check" label="Turnos cerrados" value={number(data.rows.reduce((a, r) => a + r.turnos_cerrados, 0))} /></div>
        <div className="col"><Stat icon="cash-coin" label="Ventas del personal" value={money(sales)} tone="info" /></div>
      </div>
      <Card>
        <Table small>
          <thead>
            <tr>
              <th>Nombre</th><th>Cargo</th><th>Tienda</th><th>Estado</th><th>Ingreso</th>
              <th className="num">Turnos</th><th className="num">Cerrados</th><th className="num">Ventas</th><th className="num">Total vendido</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.usuario_id}>
                <td className="fw-medium">{r.nombre} <span className="text-body-secondary small">@{r.username}</span></td>
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
