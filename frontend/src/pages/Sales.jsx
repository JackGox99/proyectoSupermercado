import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  date, dateTime, expiryState, money, number, ORDER_STATES, orderTotal, PAYMENT_LABELS, todayISO, UNIT_SHORT,
} from '../lib/format'
import { Badge, Button, Card, Empty, Field, Icon, Loading, Modal, Notice, PageHeader, Table, Tabs, useApi } from '../components/ui'

const PAYMENT_ICONS = { efectivo: 'cash-stack', tarjeta_debito: 'credit-card', tarjeta_credito: 'credit-card-2-front' }

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
        icon="upc-scan"
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
        <div className="d-flex flex-column flex-md-row align-items-md-center gap-4 py-3">
          <div className="stat-card"><div className="stat-icon tone-primary" style={{ width: 56, height: 56 }}><Icon name="clock-history" className="fs-4" /></div></div>
          <div className="flex-grow-1">
            <h2 className="h5 fw-semibold mb-1">Tienes un turno programado hoy</h2>
            <p className="text-body-secondary mb-0">
              {date(scheduled.fecha)} · {scheduled.hora_inicio}–{scheduled.hora_fin}. Inícialo para registrar ventas: cada venta
              queda asociada a ti y a este turno (RN-09).
            </p>
          </div>
          <Button size="lg" icon="play-fill" onClick={start} disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar turno'}</Button>
        </div>
      ) : closed ? (
        <Empty icon="moon-stars">Tu turno de hoy ya fue cerrado. Consulta el resumen en <Link to="/turnos">Mis turnos</Link>.</Empty>
      ) : (
        <Empty icon="calendar-x">No tienes un turno asignado para hoy. Solicítalo al administrador de tu tienda.</Empty>
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
    <div className="row g-4">
      <div className="col-xl-8 col-xxl-9">
        <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
        <Notice tone="error" onClose={() => setError('')}>{error}</Notice>

        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          {sales.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`btn btn-sm ${s.id === activeId ? 'btn-primary' : 'btn-outline-secondary'} btn-icon`}
            >
              <Icon name="receipt" /> Venta #{s.id}
              <span className={`badge rounded-pill ${s.id === activeId ? 'bg-white text-dark' : 'bg-body-secondary text-body'}`}>{(s.items || []).length}</span>
            </button>
          ))}
          <Button size="sm" variant={sales.length ? 'ghost' : 'primary'} icon="plus-lg" onClick={newSale}>Nueva venta</Button>
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
            <Empty icon="cart-plus">No hay ventas abiertas. Pulsa “Nueva venta” y escanea el primer producto.</Empty>
          </Card>
        )}
      </div>

      <div className="col-xl-4 col-xxl-3">
        <RecentSales onReceipt={setReceiptId} refreshKey={notice} />
      </div>

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
  const units = items.reduce((a, i) => a + i.cantidad, 0)

  return (
    <div className="card">
      <div className="card-body">
        <Notice tone="error">{loadError || error}</Notice>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) add({ barcode: code.trim() })
          }}
          className="row g-2 align-items-end mb-3"
        >
          <div className="col-12 col-md">
            <label className="form-label" htmlFor="barcode">Código de barras (lector o teclado)</label>
            <div className="input-group input-group-lg">
              <span className="input-group-text"><Icon name="upc-scan" /></span>
              <input
                id="barcode"
                ref={codeRef}
                className="form-control tabular"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Escanea el producto…"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="col-5 col-md-2">
            <label className="form-label" htmlFor="qty">Cantidad</label>
            <input id="qty" className="form-control form-control-lg" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="col-7 col-md-auto">
            <Button type="submit" size="lg" icon="plus-lg" className="w-100" disabled={busy || !code.trim()}>Agregar</Button>
          </div>
        </form>

        <div className="position-relative mb-4">
          <div className="input-group">
            <span className="input-group-text bg-transparent"><Icon name="search" /></span>
            <input
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="…o busca por nombre (mín. 2 letras)"
              aria-label="Buscar producto por nombre"
            />
          </div>
          {matches.length > 0 && (
            <div className="search-results list-group list-group-flush">
              {matches.map((i) => {
                const exp = expiryState(i.producto.fecha_vencimiento)
                const blocked = exp.days != null && exp.days < 0
                return (
                  <button
                    key={i.id}
                    type="button"
                    disabled={blocked}
                    onClick={() => add({ product_id: i.producto_id })}
                    className="list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-3 bg-transparent"
                  >
                    <span className="min-w-0 text-truncate">
                      <span className="fw-medium">{i.producto.nombre}</span>{' '}
                      <span className="text-body-secondary small tabular">{i.producto.codigo_barras}</span>
                    </span>
                    <span className="d-flex align-items-center gap-2 flex-shrink-0">
                      {blocked && <Badge tone="error">Vencido</Badge>}
                      <span className="small text-body-secondary">{i.stock_actual} disp.</span>
                      <span className="fw-semibold">{money(i.producto.precio)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <Empty icon="upc">Escanea el primer producto del cliente.</Empty>
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
                    <div className="fw-medium">{it.producto?.nombre}</div>
                    <div className="small text-body-secondary tabular">{it.producto?.codigo_barras}</div>
                  </td>
                  <td className="num">{it.cantidad} <span className="text-body-secondary small">{UNIT_SHORT[it.producto?.unidad_medida] || ''}</span></td>
                  <td className="num">{money(it.precio_unitario)}</td>
                  <td className="num fw-semibold">{money(it.precio_unitario * it.cantidad)}</td>
                  <td className="text-end">
                    <button type="button" onClick={() => remove(it.id)} className="btn btn-sm btn-link text-danger" aria-label="Quitar">
                      <Icon name="trash3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="card-footer bg-transparent d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 py-3">
        <Button variant="danger" icon="x-circle" onClick={cancel}>Cancelar venta</Button>
        <div className="d-flex align-items-center gap-4">
          <div className="text-end">
            <div className="small text-body-secondary">Total · {units} unidad(es)</div>
            <div className="pos-total">{money(total)}</div>
          </div>
          <Button variant="success" size="lg" icon="cash-coin" disabled={!items.length} onClick={() => onCharge(order)}>Cobrar</Button>
        </div>
      </div>
      <div className="px-3 pb-3 small text-body-secondary">
        <Icon name="info-circle" className="me-1" />
        Las existencias se validan al agregar cada producto y se descuentan solo al confirmar el pago (RN-02).
      </div>
    </div>
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
            <Button variant="ghost" icon="receipt" onClick={() => onReceipt(order.id)}>Ver comprobante</Button>
            <Button icon="plus-lg" onClick={onClose}>Nueva venta</Button>
          </>
        }
      >
        <div className="text-center mb-4">
          <div className="d-inline-grid rounded-circle tone-success mb-2" style={{ width: 64, height: 64, placeItems: 'center' }}>
            <Icon name="check-lg" className="fs-2" />
          </div>
          <div className="small text-body-secondary">Total cobrado</div>
          <div className="display-6 fw-bold text-success">{money(result.total)}</div>
          <div className="text-body-secondary"><Icon name={PAYMENT_ICONS[result.metodo_pago]} className="me-1" />{PAYMENT_LABELS[result.metodo_pago]}</div>
        </div>

        {result.cambio && result.cambio.total_cambio > 0 && (
          <div className={`card mb-3 ${result.cambio.cambio_exacto ? '' : 'border-danger'}`}>
            <div className="card-body">
              <div className="d-flex justify-content-between fw-semibold mb-1">
                <span>Cambio a entregar</span>
                <span className="text-success">{money(result.cambio.total_cambio)}</span>
              </div>
              <p className="small text-body-secondary mb-2">Desglose calculado con el algoritmo voraz según el efectivo de la caja:</p>
              <ul className="list-group list-group-flush small">
                {result.cambio.denominaciones.map(({ denominacion, cantidad }) => (
                  <li key={denominacion} className="list-group-item bg-transparent d-flex justify-content-between px-0 py-1">
                    <span className="text-body-secondary">{money(denominacion)}</span>
                    <span>× {cantidad}</span>
                  </li>
                ))}
              </ul>
              {!result.cambio.cambio_exacto && (
                <p className="small text-danger mt-2 mb-0">La caja no tiene suelto suficiente para el cambio exacto.</p>
              )}
            </div>
          </div>
        )}

        {result.alerts?.length > 0 && (
          <Notice tone="warning">
            <strong>Alerta de stock mínimo (RN-11):</strong>
            <ul className="mb-0 mt-1 ps-3">
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
          <Button variant="success" icon="check2-circle" onClick={pay} disabled={busy || insufficient}>
            {busy ? 'Procesando…' : `Confirmar ${money(total)}`}
          </Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <div className="text-center mb-4">
        <div className="small text-body-secondary">Total a cobrar</div>
        <div className="display-6 fw-bold tabular">{money(total)}</div>
      </div>
      <div className="form-label">Medio de pago</div>
      <div className="row g-2 mb-3">
        {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
          <div className="col-4" key={k}>
            <input type="radio" className="btn-check" name="pay" id={`pay-${k}`} checked={method === k} onChange={() => setMethod(k)} />
            <label className="btn btn-outline-primary w-100 py-3 d-flex flex-column align-items-center gap-1" htmlFor={`pay-${k}`}>
              <Icon name={PAYMENT_ICONS[k]} className="fs-4" />
              <span className="small">{label}</span>
            </label>
          </div>
        ))}
      </div>
      {method === 'efectivo' && (
        <Field label="Efectivo recibido (opcional, para calcular el cambio)" error={insufficient ? 'El monto recibido es menor que el total.' : ''}>
          <div className="input-group">
            <span className="input-group-text">$</span>
            <input className="form-control tabular" type="number" min="0" step="50" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={String(total)} />
          </div>
          <div className="d-flex flex-wrap gap-2 mt-2">
            {[total, 20000, 50000, 100000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map((v) => (
              <button key={v} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setTendered(String(v))}>{money(v)}</button>
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
  const total = todays.reduce((a, o) => a + (o.pago?.total || 0), 0)
  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="card-title-sm">Mis ventas de hoy</h2>
        <span className="fw-semibold small">{money(total)}</span>
      </div>
      {todays.length === 0 ? (
        <div className="card-body small text-body-secondary">Aún no hay ventas cobradas hoy.</div>
      ) : (
        <div className="list-group list-group-flush">
          {todays.slice(0, 12).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onReceipt(o.id)}
              className="list-group-item list-group-item-action bg-transparent d-flex justify-content-between align-items-center"
            >
              <span>
                <span className="fw-medium">#{o.id}</span>{' '}
                <span className="small text-body-secondary">{dateTime(o.cerrado_at).split(',')[1]}</span>
              </span>
              <span className="fw-semibold tabular">{money(o.pago?.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
      <PageHeader
        icon="receipt"
        title="Ventas"
        subtitle="Historial de ventas de la tienda. Las ventas pagadas son inmutables: solo pueden anularse (RN-10)."
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error">{error}</Notice>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pagado', label: 'Pagadas', icon: 'check2-circle' },
          { value: 'anulado', label: 'Anuladas', icon: 'x-circle' },
          { value: 'abierto', label: 'Abiertas', icon: 'hourglass' },
          { value: 'all', label: 'Todas' },
        ]}
      />
      {loading && !data ? (
        <Loading />
      ) : orders.length === 0 ? (
        <Card><Empty>No hay ventas en esta vista.</Empty></Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Venta</th>
              <th>Fecha</th>
              <th>Cajero</th>
              <th className="num">Turno</th>
              <th className="num">Unidades</th>
              <th className="num">Total</th>
              <th>Medio de pago</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="fw-semibold">#{o.id}</td>
                <td className="text-nowrap">{dateTime(o.cerrado_at || o.created_at)}</td>
                <td>{o.usuario?.nombre}</td>
                <td className="num">{o.turno_id ?? '—'}</td>
                <td className="num">{(o.items || []).reduce((a, i) => a + i.cantidad, 0)}</td>
                <td className="num fw-semibold">{money(o.pago?.total ?? orderTotal(o))}</td>
                <td className="text-nowrap">{o.pago ? <><Icon name={PAYMENT_ICONS[o.pago.metodo_pago]} className="me-1 text-body-secondary" />{PAYMENT_LABELS[o.pago.metodo_pago]}</> : '—'}</td>
                <td><Badge tone={ORDER_STATES[o.estado]?.tone}>{ORDER_STATES[o.estado]?.label}</Badge></td>
                <td className="text-end text-nowrap">
                  <Button size="sm" variant="ghost" icon="receipt" onClick={() => setReceiptId(o.id)}>Comprobante</Button>{' '}
                  {o.estado === 'pagado' && <Button size="sm" variant="danger" icon="arrow-counterclockwise" onClick={() => setVoiding(o)}>Anular</Button>}
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
          <button type="button" className="btn btn-danger btn-icon" onClick={submit} disabled={busy || !motivo.trim()}>
            <Icon name="arrow-counterclockwise" /> {busy ? 'Anulando…' : 'Anular venta'}
          </button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <p className="small text-body-secondary">
        La venta no se modifica ni se borra: queda en estado <strong>Anulada</strong>, se devuelven las unidades al inventario
        con un movimiento inverso y la operación queda en la bitácora.
      </p>
      <Field label="Motivo de la anulación (obligatorio)">
        <textarea className="form-control" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
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
          <Button icon="printer" onClick={() => window.print()} disabled={!o}>Imprimir</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      {loading && !o ? (
        <Loading />
      ) : o ? (
        <div className="receipt">
          <div className="text-center mb-2">
            <div className="fw-bold">SUPERMERCADO · {o.sede?.nombre?.toUpperCase()}</div>
            <div className="small">{o.sede?.direccion}</div>
            {o.sede?.telefono && <div className="small">Tel. {o.sede.telefono}</div>}
          </div>
          <div className="small">
            <div>Comprobante de venta N.º {o.id}</div>
            <div>Fecha: {dateTime(o.cerrado_at || o.created_at)}</div>
            <div>Cajero: {o.usuario?.nombre}</div>
            <div>Turno: {o.turno_id ?? '—'}</div>
          </div>
          <hr />
          {(o.items || []).map((it) => (
            <div key={it.id} className="mb-1">
              <div>{it.producto?.nombre}</div>
              <div className="d-flex justify-content-between small">
                <span>{it.cantidad} × {money(it.precio_unitario)}</span>
                <span>{money(it.cantidad * it.precio_unitario)}</span>
              </div>
            </div>
          ))}
          <hr />
          <div className="d-flex justify-content-between fw-bold fs-6">
            <span>TOTAL</span>
            <span>{money(o.pago?.total ?? orderTotal(o))}</span>
          </div>
          {o.pago && <div className="small">Medio de pago: {PAYMENT_LABELS[o.pago.metodo_pago]}</div>}
          <div className="small">Unidades: {number((o.items || []).reduce((a, i) => a + i.cantidad, 0))}</div>
          {o.estado === 'anulado' && (
            <div className="mt-3 text-center fw-bold text-danger">
              *** VENTA ANULADA ***
              <div className="small fw-normal">{dateTime(o.anulado_at)} · {o.anulado_por?.nombre}</div>
              <div className="small fw-normal">Motivo: {o.motivo_anulacion}</div>
            </div>
          )}
          {o.estado === 'abierto' && <div className="mt-3 text-center fw-bold">*** VENTA ABIERTA — SIN COBRAR ***</div>}
          <div className="text-center small mt-3">¡Gracias por su compra!</div>
        </div>
      ) : null}
    </Modal>
  )
}
