import { useState } from 'react'
import { api } from '../api'
import { Button, Card, Empty, Field, Icon, Loading, Modal, Notice, PageHeader, Table, useApi } from '../components/ui'

/**
 * Categorías — parámetro global de la plataforma que define el administrador
 * general (Tabla 1). Son compartidas por el catálogo de todas las tiendas.
 */
export default function Categories() {
  const { data, error, loading, reload } = useApi('/categories')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  async function remove(c) {
    if (!window.confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return
    setActionError('')
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' })
      setNotice(`Categoría "${c.nombre}" eliminada.`)
      reload()
    } catch (e) {
      setActionError(e.message)
    }
  }

  return (
    <div>
      <PageHeader
        icon="collection"
        title="Categorías"
        subtitle="Parámetro global: las categorías se comparten entre todas las tiendas."
        actions={<Button icon="plus-lg" onClick={() => setEditing({})}>Nueva categoría</Button>}
      />
      <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>
      <Notice tone="error" onClose={() => setActionError('')}>{actionError || error}</Notice>
      <Card>
        {loading && !data ? (
          <Loading />
        ) : !data?.length ? (
          <Empty icon="collection">No hay categorías.</Empty>
        ) : (
          <Table>
            <thead>
              <tr><th>Nombre</th><th>Descripción</th><th /></tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td className="fw-medium"><Icon name="tag" className="me-2 text-primary" />{c.nombre}</td>
                  <td className="text-body-secondary">{c.descripcion || '—'}</td>
                  <td className="text-end text-nowrap">
                    <div className="btn-group btn-group-sm">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(c)} title="Editar"><Icon name="pencil" /></button>
                      <button type="button" className="btn btn-outline-danger" onClick={() => remove(c)} title="Eliminar"><Icon name="trash3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing && (
        <CategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            setNotice(msg)
            reload()
          }}
        />
      )}
    </div>
  )
}

function CategoryModal({ category, onClose, onSaved }) {
  const isNew = !category.id
  const [name, setName] = useState(category.nombre || '')
  const [description, setDescription] = useState(category.descripcion || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(isNew ? '/categories' : `/categories/${category.id}`, { method: isNew ? 'POST' : 'PUT', body: { name, description } })
      onSaved(`Categoría "${name}" ${isNew ? 'creada' : 'actualizada'}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={isNew ? 'Nueva categoría' : `Editar ${category.nombre}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="cat-form" icon="check-lg" disabled={busy || !name.trim()}>Guardar</Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={save} className="vstack gap-3">
        <Notice tone="error">{error}</Notice>
        <Field label="Nombre">
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
        </Field>
        <Field label="Descripción">
          <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
