import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { expiryState, isoDate, money, stockState, UNIT_LABELS, UNIT_SHORT } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Loading, Modal, Notice, PageHeader, Table, useApi } from '../components/ui'

/**
 * Productos y precios de la tienda (RF-05 / CU-05).
 * RN-07: precio mayor que cero. RN-08: código de barras único en la tienda.
 * Las existencias no se editan aquí: las registra el auxiliar de bodega (RN-05).
 */
export default function Products() {
  const { store } = useAuth()
  const products = useApi('/products', [store?.id])
  const categories = useApi('/categories')
  const [editing, setEditing] = useState(null) // null | {} | product
  const [pricing, setPricing] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const list = products.data || []
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? list.filter((p) => p.nombre.toLowerCase().includes(t) || p.codigo_barras.includes(t)) : list
  }, [list, q])

  async function remove(p) {
    if (!window.confirm(`¿Retirar "${p.nombre}" del catálogo? Se conserva en los reportes históricos.`)) return
    setError('')
    try {
      await api(`/products/${p.id}`, { method: 'DELETE' })
      setNotice(`"${p.nombre}" retirado del catálogo.`)
      products.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  const done = (msg) => {
    setEditing(null)
    setPricing(null)
    setNotice(msg)
    products.reload()
  }

  return (
    <div>
      <PageHeader
        title="Productos y precios"
        subtitle={`Catálogo maestro de la tienda ${store?.nombre}.`}
        actions={<Button onClick={() => setEditing({})}>+ Nuevo producto</Button>}
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setError('')}>{error || products.error}</Notice>

      <Card>
        <input className="input-field sm:max-w-sm mb-3" placeholder="Buscar por nombre o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
        {products.loading && !products.data ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>No hay productos. Crea el primero con “Nuevo producto”.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Unidad</th>
                <th className="num">Costo</th>
                <th className="num">Precio</th>
                <th className="num">Stock / mín.</th>
                <th>Vencimiento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const st = stockState(p.stock_actual, p.stock_minimo)
                const ex = expiryState(p.fecha_vencimiento)
                return (
                  <tr key={p.id}>
                    <td className="tabular text-muted">{p.codigo_barras}</td>
                    <td className="font-medium">{p.nombre}</td>
                    <td className="text-muted">{p.categoria?.nombre}</td>
                    <td>{UNIT_SHORT[p.unidad_medida]}</td>
                    <td className="num text-muted">{money(p.costo_compra)}</td>
                    <td className="num font-semibold">{money(p.precio)}</td>
                    <td className="num"><Badge tone={st.tone}>{p.stock_actual} / {p.stock_minimo}</Badge></td>
                    <td><Badge tone={ex.tone}>{ex.label}</Badge></td>
                    <td className="text-right whitespace-nowrap">
                      <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setEditing(p)}>Editar</Button>{' '}
                      <Button variant="ghost" className="!py-1 !px-2 text-xs" onClick={() => setPricing(p)}>Precio</Button>{' '}
                      <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => remove(p)}>Retirar</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && (
        <ProductModal
          product={editing}
          categories={categories.data || []}
          onClose={() => setEditing(null)}
          onSaved={done}
          onEditExisting={(id) => setEditing(list.find((p) => p.id === id) || null)}
        />
      )}
      {pricing && <PriceModal product={pricing} onClose={() => setPricing(null)} onSaved={done} />}
    </div>
  )
}

function ProductModal({ product, categories, onClose, onSaved, onEditExisting }) {
  const isNew = !product.id
  const [form, setForm] = useState({
    barcode: product.codigo_barras || '',
    name: product.nombre || '',
    category_id: product.categoria_id ? String(product.categoria_id) : '',
    unit: product.unidad_medida || 'unidad',
    description: product.descripcion || '',
    purchase_cost: product.costo_compra ?? '',
    sale_price: product.precio ?? '',
    expiry_date: isoDate(product.fecha_vencimiento),
    min_stock: product.stock_minimo ?? 0,
  })
  const [error, setError] = useState('')
  const [existingId, setExistingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const price = Number(form.sale_price)
  const cost = Number(form.purchase_cost)
  const priceError = form.sale_price !== '' && !(price > 0) ? 'El precio debe ser mayor que cero (RN-07).' : ''
  const costError = form.purchase_cost !== '' && price > 0 && cost >= price ? 'El costo debe ser menor que el precio de venta.' : ''

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setExistingId(null)
    try {
      const body = {
        ...form,
        category_id: Number(form.category_id),
        purchase_cost: Number(form.purchase_cost),
        sale_price: Number(form.sale_price),
        min_stock: Number(form.min_stock) || 0,
      }
      await api(isNew ? '/products' : `/products/${product.id}`, { method: isNew ? 'POST' : 'PUT', body })
      onSaved(isNew ? `Producto "${form.name}" registrado. Pide al auxiliar de bodega registrar su entrada de mercancía.` : `Producto "${form.name}" actualizado.`)
    } catch (err) {
      setError(err.message)
      if (err.data?.existing_product_id) setExistingId(err.data.existing_product_id)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      wide
      title={isNew ? 'Nuevo producto' : `Editar ${product.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="product-form" disabled={saving || !!priceError || !!costError}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {error && (
          <div className="sm:col-span-2">
            <Notice tone="error">
              {error}
              {existingId && existingId !== product.id && (
                <div className="mt-2">
                  <Button variant="ghost" className="!py-1 text-xs" onClick={() => onEditExisting(existingId)}>Editar el producto existente</Button>
                </div>
              )}
            </Notice>
          </div>
        )}
        <Field label="Código de barras" hint="Único dentro de la tienda (RN-08).">
          <input className="input-field tabular" value={form.barcode} onChange={set('barcode')} required maxLength={50} autoFocus={isNew} />
        </Field>
        <Field label="Nombre">
          <input className="input-field" value={form.name} onChange={set('name')} required maxLength={150} />
        </Field>
        <Field label="Categoría">
          <select className="input-field" value={form.category_id} onChange={set('category_id')} required>
            <option value="">Selecciona…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Unidad de medida">
          <select className="input-field" value={form.unit} onChange={set('unit')}>
            {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Costo de compra (COP)" error={costError}>
          <input className="input-field" type="number" min="1" step="1" value={form.purchase_cost} onChange={set('purchase_cost')} required />
        </Field>
        <Field label="Precio de venta (COP)" error={priceError}>
          <input className="input-field" type="number" min="1" step="1" value={form.sale_price} onChange={set('sale_price')} required />
        </Field>
        <Field label="Fecha de vencimiento" hint="Vacío si el producto no vence. Vencido no se puede vender (RN-03).">
          <input className="input-field" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
        </Field>
        <Field label="Stock mínimo" hint="Al llegar a este nivel se genera una alerta (RN-11).">
          <input className="input-field" type="number" min="0" step="1" value={form.min_stock} onChange={set('min_stock')} />
        </Field>
        <Field label="Descripción" className="sm:col-span-2">
          <textarea className="input-field" rows={2} value={form.description} onChange={set('description')} />
        </Field>
        {!isNew && (
          <p className="sm:col-span-2 text-xs text-muted">
            Stock actual: {product.stock_actual} {UNIT_SHORT[product.unidad_medida]}. Las existencias solo las modifica el auxiliar de bodega (RN-05).
          </p>
        )}
      </form>
    </Modal>
  )
}

function PriceModal({ product, onClose, onSaved }) {
  const [price, setPrice] = useState(String(product.precio))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Number(price)

  async function save() {
    setBusy(true)
    setError('')
    try {
      await api(`/products/${product.id}/price`, { method: 'PATCH', body: { price: n } })
      onSaved(`Precio de "${product.nombre}" actualizado a ${money(n)}.`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Actualizar precio"
      subtitle={`${product.nombre} · costo ${money(product.costo_compra)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy || !(n > 0)}>Guardar precio</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <Field label="Nuevo precio de venta (COP)" error={price !== '' && !(n > 0) ? 'El precio debe ser mayor que cero (RN-07).' : ''}>
        <input className="input-field" type="number" min="1" step="1" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
      </Field>
    </Modal>
  )
}
