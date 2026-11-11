import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  ADJUSTMENT_TYPES, dateTime, expiryState, money, MOVEMENT_LABELS, stockState, UNIT_SHORT,
} from '../lib/format'
import { Badge, Button, Card, Empty, Field, Icon, Loading, Modal, Notice, PageHeader, Table, Tabs, useApi } from '../components/ui'

const ADJ_ICONS = { averia: 'heartbreak', vencimiento: 'calendar-x', devolucion: 'arrow-return-left', correccion: 'pencil-square' }

/**
 * Inventario de la tienda activa.
 *  - Todos los roles consultan existencias y precios (CU-04).
 *  - Solo el auxiliar de bodega registra entradas (CU-02) y ajustes (CU-03) — RN-05.
 *  - Bodega y administradores consultan el historial de movimientos (trazabilidad).
 */
export default function Inventory() {
  const { rol, store } = useAuth()
  const isWarehouse = rol === 'auxiliar_bodega'
  const canSeeMovements = rol !== 'cajero'
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('stock')
  const [modal, setModal] = useState(null)
  const [notice, setNotice] = useState('')
  const inventory = useApi('/inventory', [store?.id])

  // Accesos directos desde el panel: /inventario?accion=entrada|ajuste
  useEffect(() => {
    const accion = params.get('accion')
    if (isWarehouse && (accion === 'entrada' || accion === 'ajuste')) {
      setModal({ kind: accion })
      setParams({}, { replace: true })
    }
  }, [params, setParams, isWarehouse])

  return (
    <div>
      <PageHeader
        icon="boxes"
        title={rol === 'cajero' ? 'Precios y stock' : 'Inventario'}
        subtitle={
          isWarehouse
            ? 'Registra entradas de mercancía y ajustes. Eres el único rol autorizado para modificar existencias (RN-05).'
            : 'Existencias de la tienda en tiempo real. Las modificaciones las registra el auxiliar de bodega (RN-05).'
        }
        actions={
          isWarehouse && (
            <>
              <Button icon="box-arrow-in-down" onClick={() => setModal({ kind: 'entrada' })}>Entrada de mercancía</Button>
              <Button variant="ghost" icon="sliders" onClick={() => setModal({ kind: 'ajuste' })}>Ajustar inventario</Button>
            </>
          )
        }
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>

      {canSeeMovements && (
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'stock', label: 'Existencias', icon: 'grid-3x3-gap' },
            { value: 'movimientos', label: 'Movimientos', icon: 'clock-history' },
          ]}
        />
      )}

      {tab === 'stock' ? (
        <>
          <StockTable
            inventory={inventory}
            isWarehouse={isWarehouse}
            onEntry={(id) => setModal({ kind: 'entrada', productId: id })}
            onAdjust={(id) => setModal({ kind: 'ajuste', productId: id })}
          />
          <BinarySearchDemo />
        </>
      ) : (
        <Movements key={notice} />
      )}

      {modal && (
        <StockModal
          kind={modal.kind}
          initialProduct={modal.productId}
          inventory={inventory.data || []}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null)
            setNotice(msg)
            inventory.reload()
          }}
        />
      )}
    </div>
  )
}

function StockTable({ inventory, isWarehouse, onEntry, onAdjust }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const items = inventory.data || []

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter((i) => {
      const p = i.producto || {}
      if (term && !p.nombre?.toLowerCase().includes(term) && !p.codigo_barras?.includes(term)) return false
      const st = stockState(i.stock_actual, i.stock_minimo)
      const ex = expiryState(p.fecha_vencimiento)
      if (filter === 'low') return st.tone !== 'success'
      if (filter === 'expiry') return ex.tone === 'error' || ex.tone === 'warning'
      return true
    })
  }, [items, q, filter])

  return (
    <Card className="mb-4">
      <Notice tone="error">{inventory.error}</Notice>
      <div className="row g-2 mb-3">
        <div className="col-md-6 col-lg-5">
          <div className="input-group">
            <span className="input-group-text bg-transparent"><Icon name="search" /></span>
            <input className="form-control" placeholder="Buscar por nombre o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="col-md-4 col-lg-3">
          <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar">
            <option value="all">Todos los productos</option>
            <option value="low">Stock mínimo o agotados</option>
            <option value="expiry">Vencidos o por vencer</option>
          </select>
        </div>
        <div className="col-md-2 col-lg-4 d-flex align-items-center justify-content-md-end small text-body-secondary">
          {shown.length} de {items.length} productos
        </div>
      </div>
      {inventory.loading && !inventory.data ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty icon="search">No hay productos que coincidan.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              <th className="num">Mínimo</th>
              <th>Estado</th>
              <th>Vencimiento</th>
              {isWarehouse && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => {
              const p = i.producto || {}
              const st = stockState(i.stock_actual, i.stock_minimo)
              const ex = expiryState(p.fecha_vencimiento)
              return (
                <tr key={i.id}>
                  <td className="tabular text-body-secondary small">{p.codigo_barras}</td>
                  <td className="fw-medium">{p.nombre}</td>
                  <td className="text-body-secondary">{p.categoria?.nombre}</td>
                  <td className="num">{money(p.precio)}</td>
                  <td className="num fw-semibold">{i.stock_actual} <span className="text-body-secondary fw-normal small">{UNIT_SHORT[p.unidad_medida]}</span></td>
                  <td className="num text-body-secondary">{i.stock_minimo}</td>
                  <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td><Badge tone={ex.tone}>{ex.label}</Badge></td>
                  {isWarehouse && (
                    <td className="text-end text-nowrap">
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-secondary" onClick={() => onEntry(i.producto_id)} title="Entrada"><Icon name="box-arrow-in-down" /></button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => onAdjust(i.producto_id)} title="Ajuste"><Icon name="sliders" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

function StockModal({ kind, initialProduct, inventory, onClose, onDone }) {
  const isEntry = kind === 'entrada'
  const [productId, setProductId] = useState(initialProduct ? String(initialProduct) : '')
  const [qty, setQty] = useState('')
  const [type, setType] = useState('averia')
  const [direction, setDirection] = useState('out')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const item = inventory.find((i) => String(i.producto_id) === productId)
  const adj = ADJUSTMENT_TYPES.find((t) => t.value === type)
  const qtyNum = Number(qty)
  const validQty = qty !== '' && Number.isInteger(qtyNum) && qtyNum > 0
  const sign = isEntry || (adj.direction === 'both' && direction === 'in') ? 1 : -1
  const resulting = item && validQty ? item.stock_actual + sign * qtyNum : null

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isEntry) {
        const res = await api('/inventory/add', { method: 'POST', body: { product_id: Number(productId), quantity: qtyNum, reason } })
        onDone(`Entrada registrada: ${res.inventory.producto?.nombre} — stock actual ${res.inventory.stock_actual}.`)
      } else {
        const res = await api('/inventory/adjust', {
          method: 'POST',
          body: { product_id: Number(productId), quantity: sign * qtyNum, type, reason },
        })
        onDone(`Ajuste por ${adj.label.toLowerCase()} registrado: ${res.inventory.producto?.nombre} — stock actual ${res.inventory.stock_actual}.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isEntry ? 'Entrada de mercancía' : 'Ajuste de inventario'}
      subtitle={isEntry ? 'CU-02 · productos recibidos de un proveedor' : 'CU-03 · avería, devolución, vencimiento o corrección'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            type="submit"
            form="stock-form"
            icon="check-lg"
            disabled={busy || !productId || !validQty || (!isEntry && !reason.trim()) || resulting < 0}
          >
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="vstack gap-3">
        <Notice tone="error">{error}</Notice>
        <Field label="Producto">
          <select className="form-select" value={productId} onChange={(e) => setProductId(e.target.value)} required autoFocus>
            <option value="">Selecciona un producto…</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.producto_id}>
                {i.producto?.nombre} · {i.producto?.codigo_barras} (stock {i.stock_actual})
              </option>
            ))}
          </select>
        </Field>

        {!isEntry && (
          <div>
            <div className="form-label">Tipo de ajuste</div>
            <div className="row g-2">
              {ADJUSTMENT_TYPES.map((t) => (
                <div className="col-6" key={t.value}>
                  <input type="radio" className="btn-check" name="adj" id={`adj-${t.value}`} checked={type === t.value} onChange={() => { setType(t.value); setDirection('out') }} />
                  <label className="btn btn-outline-primary w-100 btn-icon justify-content-center" htmlFor={`adj-${t.value}`}>
                    <Icon name={ADJ_ICONS[t.value]} /> {t.label}
                  </label>
                </div>
              ))}
            </div>
            <div className="form-text">{adj.hint}</div>
          </div>
        )}

        {!isEntry && adj.direction === 'both' && (
          <div className="btn-group w-100" role="group" aria-label="Sentido">
            <input type="radio" className="btn-check" name="dir" id="dir-in" checked={direction === 'in'} onChange={() => setDirection('in')} />
            <label className="btn btn-outline-success" htmlFor="dir-in">
              <Icon name="plus-circle" className="me-1" />{type === 'devolucion' ? 'Devolución de cliente' : 'Sumar unidades'}
            </label>
            <input type="radio" className="btn-check" name="dir" id="dir-out" checked={direction === 'out'} onChange={() => setDirection('out')} />
            <label className="btn btn-outline-danger" htmlFor="dir-out">
              <Icon name="dash-circle" className="me-1" />{type === 'devolucion' ? 'Devolución a proveedor' : 'Restar unidades'}
            </label>
          </div>
        )}

        <Field
          label={isEntry ? 'Unidades recibidas' : 'Unidades'}
          error={qty !== '' && !validQty ? 'Ingresa un número entero mayor que cero (HU019).' : resulting < 0 ? 'El stock no puede quedar negativo.' : ''}
        >
          <input className="form-control" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>
        {resulting != null && resulting >= 0 && (
          <div className="d-flex align-items-center gap-2 small">
            <span className="text-body-secondary">Stock</span>
            <Badge tone="neutral">{item.stock_actual}</Badge>
            <Icon name="arrow-right" className="text-body-secondary" />
            <Badge tone={sign > 0 ? 'success' : 'warning'}>{resulting}</Badge>
          </div>
        )}

        <Field label={isEntry ? 'Proveedor / factura (opcional)' : 'Motivo (obligatorio)'}>
          <input
            className="form-control"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={isEntry ? 'p. ej. Factura 4521 — Distribuidora XYZ' : 'Describe el motivo del ajuste'}
          />
        </Field>
      </form>
    </Modal>
  )
}

function Movements() {
  const { store } = useAuth()
  const [tipo, setTipo] = useState('')
  const [product, setProduct] = useState('')
  const [query, setQuery] = useState('')
  const qs = new URLSearchParams()
  if (tipo) qs.set('tipo', tipo)
  if (query) qs.set('product', query)
  const { data, error, loading } = useApi(`/inventory/movements?${qs}`, [store?.id])
  const rows = data || []

  return (
    <Card>
      <Notice tone="error">{error}</Notice>
      <form
        className="row g-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(product.trim())
        }}
      >
        <div className="col-md-4">
          <select className="form-select" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de movimiento">
            <option value="">Todos los movimientos</option>
            {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="col-md-5">
          <input className="form-control" placeholder="Producto o código…" value={product} onChange={(e) => setProduct(e.target.value)} />
        </div>
        <div className="col-md-auto">
          <Button type="submit" variant="ghost" icon="search">Buscar</Button>
        </div>
      </form>
      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon="clock-history">Sin movimientos para este filtro.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th className="num">Cantidad</th>
              <th className="num">Stock final</th>
              <th>Usuario</th>
              <th>Motivo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="text-nowrap small">{dateTime(m.fecha)}</td>
                <td className="fw-medium">{m.inventario?.producto?.nombre}</td>
                <td className="text-nowrap">{MOVEMENT_LABELS[m.tipo] || m.tipo}</td>
                <td className={`num fw-semibold ${m.cantidad >= 0 ? 'text-success' : 'text-danger'}`}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td className="num">{m.stock_final}</td>
                <td>{m.usuario?.nombre}</td>
                <td className="text-body-secondary small">{m.motivo}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}

/** Demo didáctica: MergeSort + búsqueda binaria iterativa vs. recursiva. */
function BinarySearchDemo() {
  const [name, setName] = useState('')
  const [algo, setAlgo] = useState('iterative')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function search(e) {
    e.preventDefault()
    setError('')
    setResult(null)
    try {
      setResult(await api(`/inventory/binary-search?name=${encodeURIComponent(name.trim())}&algo=${algo}`))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Card
      title="Búsqueda binaria — coincidencia exacta"
      actions={<span className="small text-body-secondary">MergeSort O(n log n) + búsqueda O(log n)</span>}
    >
      <form onSubmit={search} className="row g-2 align-items-end">
        <div className="col-md">
          <Field label="Nombre exacto del producto">
            <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Arroz Diana 1 kg" />
          </Field>
        </div>
        <div className="col-auto">
          <div className="form-label">Variante</div>
          <div className="btn-group" role="group">
            {[['iterative', 'Iterativa'], ['recursive', 'Recursiva']].map(([k, label]) => (
              <Fragment key={k}>
                <input type="radio" className="btn-check" name="algo" id={`algo-${k}`} checked={algo === k} onChange={() => setAlgo(k)} />
                <label className="btn btn-outline-primary" htmlFor={`algo-${k}`}>{label}</label>
              </Fragment>
            ))}
          </div>
        </div>
        <div className="col-auto">
          <Button type="submit" icon="search" disabled={!name.trim()}>Buscar</Button>
        </div>
      </form>
      <div className="mt-3"><Notice tone="error">{error}</Notice></div>
      {result && (
        <div className="small d-flex flex-wrap align-items-center gap-2">
          <Badge tone="info">Variante {result.algo === 'iterative' ? 'iterativa' : 'recursiva'}</Badge>
          {result.found ? (
            <span>
              Encontrado: <strong>{result.item.producto?.nombre}</strong> · stock {result.item.stock_actual} · {money(result.item.producto?.precio)}
            </span>
          ) : (
            <span className="text-body-secondary">No existe un producto con ese nombre exacto en esta tienda.</span>
          )}
        </div>
      )}
    </Card>
  )
}
