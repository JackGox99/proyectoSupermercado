import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/format'
import { Button, Card, Field, Notice, PageHeader } from '../components/ui'

/** Mi perfil — módulo privado de cada usuario para actualizar su contraseña (HU010). */
export default function Profile() {
  const { user, store } = useAuth()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const mismatch = confirm !== '' && pwd !== confirm
  const tooShort = pwd !== '' && pwd.length < 8

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const r = await api('/profile/password', { method: 'PUT', body: { new_password: pwd, confirm_password: confirm } })
      setNotice(r.message)
      setPwd('')
      setConfirm('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Mi perfil" />
      <Card className="mb-6">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Nombre</dt><dd className="font-medium">{user?.nombre}</dd>
          <dt className="text-muted">Usuario</dt><dd>{user?.username}</dd>
          <dt className="text-muted">Cargo</dt><dd>{ROLE_LABELS[user?.rol]}</dd>
          <dt className="text-muted">Tienda</dt><dd>{user?.rol === 'admin' ? 'Todas (administración general)' : store?.nombre}</dd>
        </dl>
      </Card>
      <Card title="Cambiar contraseña">
        <Notice tone="success">{notice}</Notice>
        <Notice tone="error">{error}</Notice>
        <form onSubmit={save} className="flex flex-col gap-4 max-w-sm">
          <Field label="Nueva contraseña" error={tooShort ? 'Mínimo 8 caracteres.' : ''}>
            <input className="input-field" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
          </Field>
          <Field label="Confirmar contraseña" error={mismatch ? 'Las contraseñas no coinciden.' : ''}>
            <input className="input-field" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <Button type="submit" disabled={busy || !pwd || mismatch || tooShort}>Actualizar contraseña</Button>
        </form>
      </Card>
    </div>
  )
}
