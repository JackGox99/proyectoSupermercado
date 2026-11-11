import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  date, dateTime, expiryState, money, number, ORDER_STATES, orderTotal, PAYMENT_LABELS, todayISO, UNIT_SHORT,
} from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice, PageHeader, Table, Tabs, useApi } from '../components/ui'

/**
 * Ventas (CU-01).
 *  - Cajero: punto de venta.
 *  - Administradores: historial de ventas, comprobantes y anulación (RN-10).
 */
export default function Sales() {
  const { rol } = useAuth()
  return rol === 'cajero' ? <PointOfSale /> : <SalesHistory />
}

// ════════════════════════════════════════════════════════════════════════════
// Punto de venta (cajero)
// ════════════════════════════════════════════════════════════════════════════

function PointOfSale() {
  const shift = useApi('/shifts/current')
  const current = shift.data?.shift

  if (shift.loading && !shift.data) return <Loading />
  return (
    <div>
      <PageHeader
        title="Punto de venta"
        subtitle={current ? `Turno en curso ${current.hora_inicio}–${current.hora_fin}` : 'Registra ventas durante tu turno.'}
      />
      <Notice tone="error">{shift.error}</Notice>
      {current ? <Register /> : <StartShift onStarted={shift.reload} />}
    </div>
  )
}

/** CU-01 precondición: el cajero debe tener un turno abierto (RN-09). */
function StartShift({ onStarted }) {
  const today = todayISO()
  const { data, loading, error } = useApi(`/shifts?from=${today}&to=${today}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const scheduled = (data || []).find((s) => s.estado === 'programado')
  const closed = (data || []).find((s) => s.estado === 'cerrado')

  async function start() {
    setBusy(true)
    setErr('')
    try {
      await api(`/shifts/${scheduled.id}/open`, { method: 'POST' })
      onStarted()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <Loading />
  return (
    <Card>
      <Notice tone="error">{error || err}</Notice>
      {scheduled ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Tienes un turno programado hoy</h2>
            <p className="text-sm text-muted">
              {date(scheduled.fecha)} · {scheduled.hora_inicio}–{scheduled.hora_fin}. Inícialo para registrar ventas: cada venta
              queda asociada a ti y a este turno (RN-09).
            </p>
          </div>
          <Button onClick={start} disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar turno'}</Button>
        </div>
      ) : closed ? (
        <Empty>Tu turno de hoy ya fue cerrado. Consulta el resumen en <Link to="/turnos">Mis turnos</Link>.</Empty>
      ) : (
        <Empty>No tienes un turno asignado para hoy. Solicítalo al administrador de tu tienda.</Empty>
      )}
    </Card>
  )
}

function Register() {
  const { store } = useAuth()
  const openSales = useApi('/orders?estado=abierto')
  const inventory = useApi('/inventory', [store?.id])
  const [activeId, setActiveId] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [charging, setCharging] = useState(null)
  const [receiptId, setReceiptId] = useState(null)

  const sales = openSales.data || []
  useEffect(() => {
    if (sales.length && !sales.some((s) => s.id === activeId)) setActiveId(sales[0].id)
    if (!sales.length) setActiveId(null)
  }, [sales, activeId])

  async function newSale() {
    setError('')
    try {
      const order = await api('/orders', { method: 'POST' })
      await openSales.reload()
      setActiveId(order.id)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
      <div className="min-w-0">
        <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
        <Notice tone="error" onClose={() => setError('')}>{error}</Notice>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {sales.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={s.id === activeId ? 'btn-primary' : 'btn-ghost'}
            >
              Venta #{s.id} · {(s.items || []).length} ítem(s)
            </button>
          ))}
          <Button variant={sales.length ? 'ghost' : 'primary'} onClick={newSale}>+ Nueva venta</Button>
        </div>

        {openSales.loading && !openSales.data ? (
          <Loading />
        ) : activeId ? (
          <SaleEditor
            key={activeId}
            orderId={activeId}
            inventory={inventory.data || []}
            onCharge={(order) => setCharging(order)}
            onCancelled={() => {
              setNotice('Venta cancelada. El inventario no se afectó.')
              openSales.reload()
            }}
            onChanged={openSales.reload}
          />
        ) : (
          <Card>
            <Empty>No hay ventas abiertas. Pulsa “Nueva venta” y escanea el primer producto.</Empty>
          </Card>
        )}
      </div>

      <RecentSales onReceipt={setReceiptId} refreshKey={notice} />

      {charging && (
        <ChargeModal
          order={charging}
          onClose={() => setCharging(null)}
          onPaid={(msg) => {
            setNotice(msg)
            openSales.reload()
            inventory.reload()
          }}
          onReceipt={(id) => {
            setCharging(null)
            setReceiptId(id)
          }}
        />
      )}
      {receiptId && <ReceiptModal orderId={receiptId} onClose={() => setReceiptId(null)} />}
    </div>
  )
}

function SaleEditor({ orderId, inventory, onCharge, onCancelled, onChanged }) {
  const { data: order, reload, error: loadError } = useApi(`/orders/${orderId}`)
  const [code, setCode] = useState('')
  const [qty, setQty] = useState(1)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const codeRef = useRef(null)

  useEffect(() => codeRef.current?.focus(), [orderId])

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return inventory
      .filter((i) => i.producto?.nombre?.toLowerCase().includes(q) || i.producto?.codigo_barras?.includes(q))
      .slice(0, 8)
  }, [search, inventory])

  async function add(body) {
    setBusy(true)
    setError('')
    try {
      await api(`/orders/${orderId}/items`, { method: 'POST', body: { ...body, cantidad: Number(qty) || 1 } })
      setCode('')
      setSearch('')
      setQty(1)
      await reload()
      onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      codeRef.current?.focus()
    }
  }

  async function remove(itemId) {
    setError('')
    try {
      await api(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' })
      await reload()
      onChanged()
    } catch (e) {
      setError(e.message)
    }
  }

  async function cancel() {
    if (!window.confirm(`¿Cancelar la venta #${orderId}?`)) return
    try {
      await api(`/orders/${orderId}`, { method: 'DELETE' })
      onCancelled()
    } catch (e) {
      setError(e.message)
    }
  }

  const items = order?.items || []
  const total = orderTotal(order)

  return (
    <Card>
      <Notice tone="error">{loadError || error}</Notice>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) add({ barcode: code.trim() })
        }}
        className="grid grid-cols-[1fr_90px_auto] gap-2 items-end mb-3"
      >
        <Field label="Código de barras (lector o teclado)">
          <input
            ref={codeRef}
            className="input-field tabular"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Escanea el producto…"
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
        <Field label="Cantidad">
          <input className="input-field" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || !code.trim()}>Agregar</Button>
      </form>

      <div className="relative mb-4">
        <input
          className="input-field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="…o busca por nombre (mín. 2 letras)"
          aria-label="Buscar producto por nombre"
        />
        {matches.length > 0 && (
          <ul
            className="absolute z-10 left-0 right-0 mt-1 rounded-md overflow-hidden shadow-xl"
            style={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
          >
            {matches.map((i) => {
              const exp = expiryState(i.producto.fecha_vencimiento)
              const blocked = exp.days != null && exp.days < 0
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => add({ product_id: i.producto_id })}
                    className="w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-3 hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate">
                      {i.producto.nombre} <span className="text-muted tabular">· {i.producto.codigo_barras}</span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {blocked && <Badge tone="error">Vencido</Badge>}
                      <span className="text-muted">{i.stock_actual} disp.</span>
                      <span className="font-semibold">{money(i.producto.precio)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {items.length === 0 ? (
        <Empty>Escanea el primer producto del cliente.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Cant.</th>
              <th className="num">Precio</th>
              <th className="num">Subtotal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <div className="font-medium">{it.producto?.nombre}</div>
                  <div className="text-xs text-muted tabular">{it.producto?.codigo_barras}</div>
                </td>
                <td className="num">{it.cantidad} {UNIT_SHORT[it.producto?.unidad_medida] || ''}</td>
                <td className="num">{money(it.precio_unitario)}</td>
                <td className="num font-semibold">{money(it.precio_unitario * it.cantidad)}</td>
                <td className="text-right">
                  <button type="button" onClick={() => remove(it.id)} className="text-sm" style={{ color: 'var(--color-error)' }}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button variant="danger" onClick={cancel}>Cancelar venta</Button>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs uppercase text-muted">Total</div>
            <div className="text-3xl font-bold tabular">{money(total)}</div>
          </div>
          <Button variant="success" className="!px-6 !py-3 !text-base" disabled={!items.length} onClick={() => onCharge(order)}>
            Cobrar
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        Las existencias se validan al agregar cada producto y se descuentan solo al confirmar el pago (RN-02).
      </p>
    </Card>
  )
}

function ChargeModal({ order, onClose, onPaid, onReceipt }) {
  const total = orderTotal(order)
  const [method, setMethod] = useState('efectivo')
  const [tendered, setTendered] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const tenderedNum = Number(tendered) || 0
  const insufficient = method === 'efectivo' && tendered !== '' && tenderedNum < total

  async function pay() {
    setBusy(true)
    setError('')
    try {
      const body = { metodo_pago: method }
      if (method === 'efectivo' && tenderedNum > 0) body.monto_entregado = tenderedNum
      const res = await api(`/orders/${order.id}/finalize`, { method: 'POST', body })
      setResult(res)
      onPaid(`Venta #${order.id} cobrada: ${money(res.total)} (${PAYMENT_LABELS[res.metodo_pago]}).`)
    } catch (e) {
      // A1/A2/A3/A5: la venta sigue abierta y el inventario no se afectó.
      setError(`${e.message}. La venta sigue abierta y el inventario no se afectó.`)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <Modal
        title="Venta registrada"
        subtitle={`Venta #${order.id}`}
        onClose={onClose}
        footer={
          <>
            <Button variant="ghost" onClick={() => onReceipt(order.id)}>Ver comprobante</Button>
            <Button onClick={onClose}>Nueva venta</Button>
          </>
        }
      >
        <div className="text-center mb-4">
          <div className="text-xs uppercase text-muted">Total cobrado</div>
          <div className="text-4xl font-bold" style={{ color: 'var(--color-success)' }}>{money(result.total)}</div>
          <div className="text-sm text-muted">{PAYMENT_LABELS[result.metodo_pago]}</div>
        </div>

        {result.cambio && result.cambio.total_cambio > 0 && (
          <div className="rounded-md p-3 mb-4" style={{ border: '1px solid var(--color-border)' }}>
            <div className="flex justify-between font-semibold mb-2">
              <span>Cambio a entregar</span>
              <span style={{ color: 'var(--color-success)' }}>{money(result.cambio.total_cambio)}</span>
            </div>
            <p className="text-xs text-muted mb-2">Desglose calculado con el algoritmo voraz según el efectivo de la caja:</p>
            {result.cambio.denominaciones.map(({ denominacion, cantidad }) => (
              <div key={denominacion} className="flex justify-between text-sm">
                <span className="text-muted">{money(denominacion)}</span>
                <span>× {cantidad}</span>
              </div>
            ))}
            {!result.cambio.cambio_exacto && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-error)' }}>
                La caja no tiene suelto suficiente para el cambio exacto.
              </p>
            )}
          </div>
        )}

        {result.alerts?.length > 0 && (
          <Notice tone="warning">
            <strong>Alerta de stock mínimo (RN-11):</strong>
            <ul className="mt-1 list-disc pl-5">
              {result.alerts.map((a) => (
                <li key={a.producto_id}>{a.producto}: quedan {a.stock_actual} (mínimo {a.stock_minimo})</li>
              ))}
            </ul>
          </Notice>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title={`Cobrar venta #${order.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button variant="success" onClick={pay} disabled={busy || insufficient}>{busy ? 'Procesando…' : `Confirmar ${money(total)}`}</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <div className="text-center mb-5">
        <div className="text-xs uppercase text-muted">Total a cobrar</div>
        <div className="text-4xl font-bold tabular">{money(total)}</div>
      </div>
      <Field label="Medio de pago">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMethod(k)} className={method === k ? 'btn-primary' : 'btn-ghost'}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      {method === 'efectivo' && (
        <Field label="Efectivo recibido (opcional, para calcular el cambio)" error={insufficient ? 'El monto recibido es menor que el total.' : ''} className="mt-4">
          <input className="input-field tabular" type="number" min="0" step="50" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total)} />
          <div className="flex flex-wrap gap-2 mt-2">
            {[total, 20000, 50000, 100000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map((v) => (
              <button key={v} type="button" className="btn-ghost !py-1 !px-2 text-xs" onClick={() => setTendered(String(v))}>{money(v)}</button>
            ))}
          </div>
        </Field>
      )}
    </Modal>
  )
}

function RecentSales({ onReceipt, refreshKey }) {
  const { data } = useApi('/orders?estado=pagado', [refreshKey])
  const today = todayISO()
  const todays = (data || []).filter((o) => (o.cerrado_at || '').slice(0, 10) === today)
  return (
    <aside className="card h-fit">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">Mis ventas de hoy</h2>
      {todays.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay ventas cobradas hoy.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todays.slice(0, 12).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <button type="button" onClick={() => onReceipt(o.id)} className="text-left hover:underline">
                #{o.id} <span className="text-muted">{dateTime(o.cerrado_at).split(',')[1]}</span>
              </button>
              <span className="font-semibold tabular">{money(o.pago?.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Historial de ventas (administradores)
// ════════════════════════════════════════════════════════════════════════════

function SalesHistory() {
  const { store } = useAuth()
  const [tab, setTab] = useState('pagado')
  const { data, error, loading, reload } = useApi(`/orders${tab === 'all' ? '' : `?estado=${tab}`}`, [store?.id])
  const [receiptId, setReceiptId] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [notice, setNotice] = useState('')
  const orders = data || []

  return (
    <div>
      <PageHeader title="Ventas" subtitle="Historial de ventas de la tienda. Las ventas pagadas son inmutables: solo pueden anularse (RN-10)." />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error">{error}</Notice>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pagado', label: 'Pagadas' },
          { value: 'anulado', label: 'Anuladas' },
          { value: 'abierto', label: 'Abiertas' },
          { value: 'all', label: 'Todas' },
        ]}
      />
      {loading && !data ? (
        <Loading />
      ) : orders.length === 0 ? (
        <Empty>No hay ventas en esta vista.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Venta</th>
              <th>Fecha</th>
              <th>Cajero</th>
              <th className="num">Turno</th>
              <th className="num">Ítems</th>
              <th className="num">Total</th>
              <th>Medio de pago</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="font-semibold">#{o.id}</td>
                <td className="whitespace-nowrap">{dateTime(o.cerrado_at || o.created_at)}</td>
                <td>{o.usuario?.nombre}</td>
                <td className="num">{o.turno_id ?? '—'}</td>
                <td className="num">{(o.items || []).reduce((a, i) => a + i.cantidad, 0)}</td>
                <td className="num font-semibold">{money(o.pago?.total ?? orderTotal(o))}</td>
                <td>{o.pago ? PAYMENT_LABELS[o.pago.metodo_pago] : '—'}</td>
                <td><Badge tone={ORDER_STATES[o.estado]?.tone}>{ORDER_STATES[o.estado]?.label}</Badge></td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setReceiptId(o.id)}>Comprobante</Button>{' '}
                  {o.estado === 'pagado' && (
                    <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => setVoiding(o)}>Anular</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {receiptId && <ReceiptModal orderId={receiptId} onClose={() => setReceiptId(null)} />}
      {voiding && (
        <VoidModal
          order={voiding}
          onClose={() => setVoiding(null)}
          onDone={() => {
            setNotice(`Venta #${voiding.id} anulada. Las existencias se restauraron con movimientos trazables.`)
            setVoiding(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function VoidModal({ order, onClose, onDone }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await api(`/orders/${order.id}/annul`, { method: 'POST', body: { motivo } })
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Anular venta #${order.id}`}
      subtitle={`${money(order.pago?.total)} · ${order.usuario?.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button variant="danger" onClick={submit} disabled={busy || !motivo.trim()}>{busy ? 'Anulando…' : 'Anular venta'}</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <p className="text-sm text-muted mb-4">
        La venta no se modifica ni se borra: queda en estado <strong>Anulada</strong>, se devuelven las unidades al inventario
        con un movimiento inverso y la operación queda en la bitácora.
      </p>
      <Field label="Motivo de la anulación (obligatorio)">
        <textarea className="input-field" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
      </Field>
    </Modal>
  )
}

/** Comprobante de venta (RF-08): detalle, total y cajero que la registró. */
export function ReceiptModal({ orderId, onClose }) {
  const { data: o, error, loading } = useApi(`/orders/${orderId}`)
  return (
    <Modal
      title={`Comprobante · venta #${orderId}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button onClick={() => window.print()} disabled={!o}>Imprimir</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      {loading && !o ? (
        <Loading />
      ) : o ? (
        <div className="receipt rounded-md p-4 font-mono text-sm" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
          <div className="text-center mb-3">
            <div className="font-bold text-base">SUPERMERCADO · {o.sede?.nombre?.toUpperCase()}</div>
            <div className="text-xs">{o.sede?.direccion}</div>
            {o.sede?.telefono && <div className="text-xs">Tel. {o.sede.telefono}</div>}
          </div>
          <div className="text-xs mb-2">
            <div>Comprobante de venta N.º {o.id}</div>
            <div>Fecha: {dateTime(o.cerrado_at || o.created_at)}</div>
            <div>Cajero: {o.usuario?.nombre}</div>
            <div>Turno: {o.turno_id ?? '—'}</div>
          </div>
          <div className="border-t border-dashed my-2" style={{ borderColor: 'currentColor' }} />
          {(o.items || []).map((it) => (
            <div key={it.id} className="mb-1">
              <div>{it.producto?.nombre}</div>
              <div className="flex justify-between text-xs">
                <span>{it.cantidad} × {money(it.precio_unitario)}</span>
                <span>{money(it.cantidad * it.precio_unitario)}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dashed my-2" style={{ borderColor: 'currentColor' }} />
          <div className="flex justify-between font-bold text-base">
            <span>TOTAL</span>
            <span>{money(o.pago?.total ?? orderTotal(o))}</span>
          </div>
          {o.pago && <div className="text-xs">Medio de pago: {PAYMENT_LABELS[o.pago.metodo_pago]}</div>}
          <div className="text-xs mt-1">Unidades: {number((o.items || []).reduce((a, i) => a + i.cantidad, 0))}</div>
          {o.estado === 'anulado' && (
            <div className="mt-3 text-center font-bold" style={{ color: 'var(--color-error)' }}>
              *** VENTA ANULADA ***
              <div className="text-xs font-normal">{dateTime(o.anulado_at)} · {o.anulado_por?.nombre}</div>
              <div className="text-xs font-normal">Motivo: {o.motivo_anulacion}</div>
            </div>
          )}
          {o.estado === 'abierto' && <div className="mt-3 text-center font-bold">*** VENTA ABIERTA — SIN COBRAR ***</div>}
          <div className="text-center text-xs mt-3">¡Gracias por su compra!</div>
        </div>
      ) : null}
    </Modal>
  )
}
