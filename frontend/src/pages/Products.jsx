import { useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { expiryState, isoDate, money, stockState, UNIT_LABELS, UNIT_SHORT } from '../lib/format'
import { Badge, Button, Card, Empty, Field, Icon, Loading, Modal, Notice, PageHeader, Table, useApi } from '../components/ui'

/**
 * Productos y precios de la tienda (RF-05 / CU-05).
 * RN-07: precio mayor que cero. RN-08: código de barras único en la tienda.
 * Las existencias no se editan aquí: las registra el auxiliar de bodega (RN-05).
 */
export default function Products() {
  const { store } = useAuth()
  const products = useApi('/products', [store?.id])
  const categories = useApi('/categories')
  const [editing, setEditing] = useState(null)
  const [pricing, setPricing] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')

  const list = products.data || []
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return list.filter((p) => {
      if (cat && String(p.categoria_id) !== cat) return false
      return !t || p.nombre.toLowerCase().includes(t) || p.codigo_barras.includes(t)
    })
  }, [list, q, cat])

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
        icon="tags"
        title="Productos y precios"
        subtitle={`Catálogo maestro de la tienda ${store?.nombre}.`}
        actions={<Button icon="plus-lg" onClick={() => setEditing({})}>Nuevo producto</Button>}
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setError('')}>{error || products.error}</Notice>

      <Card>
        <div className="row g-2 mb-3">
          <div className="col-md-6 col-lg-5">
            <div className="input-group">
              <span className="input-group-text bg-transparent"><Icon name="search" /></span>
              <input className="form-control" placeholder="Buscar por nombre o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="col-md-4 col-lg-3">
            <select className="form-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        </div>
        {products.loading && !products.data ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty icon="tags">No hay productos. Crea el primero con “Nuevo producto”.</Empty>
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
                <th className="num">Margen</th>
                <th>Stock / mín.</th>
                <th>Vencimiento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const st = stockState(p.stock_actual, p.stock_minimo)
                const ex = expiryState(p.fecha_vencimiento)
                const margin = p.precio > 0 ? Math.round(((p.precio - p.costo_compra) / p.precio) * 100) : 0
                return (
                  <tr key={p.id}>
                    <td className="tabular text-body-secondary small">{p.codigo_barras}</td>
                    <td className="fw-medium">{p.nombre}</td>
                    <td className="text-body-secondary">{p.categoria?.nombre}</td>
                    <td>{UNIT_SHORT[p.unidad_medida]}</td>
                    <td className="num text-body-secondary">{money(p.costo_compra)}</td>
                    <td className="num fw-semibold">{money(p.precio)}</td>
                    <td className="num text-body-secondary">{margin}%</td>
                    <td><Badge tone={st.tone}>{p.stock_actual} / {p.stock_minimo}</Badge></td>
                    <td><Badge tone={ex.tone}>{ex.label}</Badge></td>
                    <td className="text-end text-nowrap">
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(p)} title="Editar"><Icon name="pencil" /></button>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setPricing(p)} title="Cambiar precio"><Icon name="currency-dollar" /></button>
                        <button type="button" className="btn btn-outline-danger" onClick={() => remove(p)} title="Retirar del catálogo"><Icon name="trash3" /></button>
                      </div>
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
          <Button type="submit" form="product-form" icon="check-lg" disabled={saving || !!priceError || !!costError}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <form id="product-form" onSubmit={save} className="row g-3">
        {error && (
          <div className="col-12">
            <Notice tone="error">
              {error}
              {existingId && existingId !== product.id && (
                <div className="mt-2">
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onEditExisting(existingId)}>
                    <Icon name="pencil" className="me-1" /> Editar el producto existente
                  </button>
                </div>
              )}
            </Notice>
          </div>
        )}
        <div className="col-md-6">
          <Field label="Código de barras" hint="Único dentro de la tienda (RN-08).">
            <div className="input-group">
              <span className="input-group-text"><Icon name="upc" /></span>
              <input className="form-control tabular" value={form.barcode} onChange={set('barcode')} required maxLength={50} autoFocus={isNew} />
            </div>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Nombre">
            <input className="form-control" value={form.name} onChange={set('name')} required maxLength={150} />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Categoría">
            <select className="form-select" value={form.category_id} onChange={set('category_id')} required>
              <option value="">Selecciona…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Unidad de medida">
            <select className="form-select" value={form.unit} onChange={set('unit')}>
              {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Costo de compra" error={costError}>
            <div className="input-group">
              <span className="input-group-text">$</span>
              <input className="form-control" type="number" min="1" step="1" value={form.purchase_cost} onChange={set('purchase_cost')} required />
            </div>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Precio de venta" error={priceError}>
            <div className="input-group">
              <span className="input-group-text">$</span>
              <input className="form-control" type="number" min="1" step="1" value={form.sale_price} onChange={set('sale_price')} required />
            </div>
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Fecha de vencimiento" hint="Vacío si el producto no vence. Vencido no se puede vender (RN-03).">
            <input className="form-control" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          </Field>
        </div>
        <div className="col-md-6">
          <Field label="Stock mínimo" hint="Al llegar a este nivel se genera una alerta (RN-11).">
            <input className="form-control" type="number" min="0" step="1" value={form.min_stock} onChange={set('min_stock')} />
          </Field>
        </div>
        <div className="col-12">
          <Field label="Descripción">
            <textarea className="form-control" rows={2} value={form.description} onChange={set('description')} />
          </Field>
        </div>
        {!isNew && (
          <div className="col-12 small text-body-secondary">
            <Icon name="info-circle" className="me-1" />
            Stock actual: {product.stock_actual} {UNIT_SHORT[product.unidad_medida]}. Las existencias solo las modifica el auxiliar de bodega (RN-05).
          </div>
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
          <Button icon="check-lg" onClick={save} disabled={busy || !(n > 0)}>Guardar precio</Button>
        </>
      }
    >
      <Notice tone="error">{error}</Notice>
      <Field label="Nuevo precio de venta" error={price !== '' && !(n > 0) ? 'El precio debe ser mayor que cero (RN-07).' : ''}>
        <div className="input-group input-group-lg">
          <span className="input-group-text">$</span>
          <input className="form-control" type="number" min="1" step="1" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
        </div>
      </Field>
    </Modal>
  )
}
