import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import {
  ADJUSTMENT_TYPES, dateTime, expiryState, money, MOVEMENT_LABELS, stockState, UNIT_SHORT,
} from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice, PageHeader, Table, Tabs, useApi } from '../components/ui'

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
  const [modal, setModal] = useState(null) // { kind: 'entrada'|'ajuste', productId? }
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
        title={rol === 'cajero' ? 'Precios y stock' : 'Inventario'}
        subtitle={
          isWarehouse
            ? 'Registra entradas de mercancía y ajustes. Eres el único rol autorizado para modificar existencias (RN-05).'
            : 'Existencias de la tienda en tiempo real. Las modificaciones las registra el auxiliar de bodega (RN-05).'
        }
        actions={
          isWarehouse && (
            <>
              <Button onClick={() => setModal({ kind: 'entrada' })}>+ Entrada de mercancía</Button>
              <Button variant="ghost" onClick={() => setModal({ kind: 'ajuste' })}>Ajustar inventario</Button>
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
            { value: 'stock', label: 'Existencias' },
            { value: 'movimientos', label: 'Movimientos' },
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
    <Card className="mb-6">
      <Notice tone="error">{inventory.error}</Notice>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className="input-field sm:max-w-sm" placeholder="Buscar por nombre o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input-field sm:max-w-[220px]" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtrar">
          <option value="all">Todos los productos</option>
          <option value="low">Stock mínimo o agotados</option>
          <option value="expiry">Vencidos o por vencer</option>
        </select>
      </div>
      {inventory.loading && !inventory.data ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty>No hay productos que coincidan.</Empty>
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
                  <td className="tabular text-muted">{p.codigo_barras}</td>
                  <td className="font-medium">{p.nombre}</td>
                  <td className="text-muted">{p.categoria?.nombre}</td>
                  <td className="num">{money(p.precio)}</td>
                  <td className="num font-semibold">{i.stock_actual} <span className="text-muted font-normal">{UNIT_SHORT[p.unidad_medida]}</span></td>
                  <td className="num text-muted">{i.stock_minimo}</td>
                  <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  <td><Badge tone={ex.tone}>{ex.label}</Badge></td>
                  {isWarehouse && (
                    <td className="text-right whitespace-nowrap">
                      <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => onEntry(i.producto_id)}>Entrada</Button>{' '}
                      <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => onAdjust(i.producto_id)}>Ajuste</Button>
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
          <Button type="submit" form="stock-form" disabled={busy || !productId || !validQty || (!isEntry && !reason.trim()) || resulting < 0}>
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="stock-form" onSubmit={submit} className="flex flex-col gap-4">
        <Notice tone="error">{error}</Notice>
        <Field label="Producto">
          <select className="input-field" value={productId} onChange={(e) => setProductId(e.target.value)} required autoFocus>
            <option value="">Selecciona un producto…</option>
            {inventory.map((i) => (
              <option key={i.id} value={i.producto_id}>
                {i.producto?.nombre} · {i.producto?.codigo_barras} (stock {i.stock_actual})
              </option>
            ))}
          </select>
        </Field>

        {!isEntry && (
          <Field label="Tipo de ajuste" hint={adj.hint}>
            <div className="grid grid-cols-2 gap-2">
              {ADJUSTMENT_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => { setType(t.value); setDirection('out') }} className={type === t.value ? 'btn-primary' : 'btn-ghost'}>
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {!isEntry && adj.direction === 'both' && (
          <Field label="Sentido">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDirection('in')} className={direction === 'in' ? 'btn-primary' : 'btn-ghost'}>
                {type === 'devolucion' ? 'Devolución de cliente (+)' : 'Sumar unidades (+)'}
              </button>
              <button type="button" onClick={() => setDirection('out')} className={direction === 'out' ? 'btn-primary' : 'btn-ghost'}>
                {type === 'devolucion' ? 'Devolución a proveedor (−)' : 'Restar unidades (−)'}
              </button>
            </div>
          </Field>
        )}

        <Field
          label={isEntry ? 'Unidades recibidas' : 'Unidades'}
          error={qty !== '' && !validQty ? 'Ingresa un número entero mayor que cero (HU019).' : resulting < 0 ? 'El stock no puede quedar negativo.' : ''}
          hint={resulting != null ? `Stock actual ${item.stock_actual} → quedará en ${resulting}` : ''}
        >
          <input className="input-field" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </Field>

        <Field label={isEntry ? 'Proveedor / factura (opcional)' : 'Motivo (obligatorio)'}>
          <input className="input-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isEntry ? 'p. ej. Factura 4521 — Distribuidora XYZ' : 'Describe el motivo del ajuste'} />
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
        className="flex flex-col sm:flex-row gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(product.trim())
        }}
      >
        <select className="input-field sm:max-w-[260px]" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de movimiento">
          <option value="">Todos los movimientos</option>
          {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input-field sm:max-w-sm" placeholder="Producto o código…" value={product} onChange={(e) => setProduct(e.target.value)} />
        <Button type="submit" variant="ghost">Buscar</Button>
      </form>
      {loading && !data ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Sin movimientos para este filtro.</Empty>
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
                <td className="whitespace-nowrap">{dateTime(m.fecha)}</td>
                <td className="font-medium">{m.inventario?.producto?.nombre}</td>
                <td className="whitespace-nowrap">{MOVEMENT_LABELS[m.tipo] || m.tipo}</td>
                <td className="num font-semibold" style={{ color: m.cantidad >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td className="num">{m.stock_final}</td>
                <td>{m.usuario?.nombre}</td>
                <td className="text-muted">{m.motivo}</td>
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
    <Card title="Búsqueda binaria — coincidencia exacta" actions={<span className="text-xs text-muted">MergeSort O(n log n) + búsqueda O(log n)</span>}>
      <form onSubmit={search} className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <Field label="Nombre exacto del producto" className="flex-1">
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Arroz Diana 1 kg" />
        </Field>
        <Field label="Variante">
          <div className="inline-flex rounded-md overflow-hidden" style={{ border: '1px solid var(--color-border)' }} role="radiogroup">
            {[['iterative', 'Iterativa'], ['recursive', 'Recursiva']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={algo === k}
                onClick={() => setAlgo(k)}
                className="px-3 py-2 text-sm font-semibold"
                style={{ backgroundColor: algo === k ? 'var(--color-brand-primary)' : 'transparent', color: algo === k ? 'var(--color-brand-dark)' : 'var(--color-text-primary)' }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Button type="submit" disabled={!name.trim()}>Buscar</Button>
      </form>
      <Notice tone="error">{error}</Notice>
      {result && (
        <div className="mt-3 text-sm">
          <Badge tone="info">Variante: {result.algo === 'iterative' ? 'iterativa' : 'recursiva'}</Badge>{' '}
          {result.found ? (
            <span>
              Encontrado: <strong>{result.item.producto?.nombre}</strong> · stock {result.item.stock_actual} · {money(result.item.producto?.precio)}
            </span>
          ) : (
            <span className="text-muted">No existe un producto con ese nombre exacto en esta tienda.</span>
          )}
        </div>
      )}
    </Card>
  )
}
