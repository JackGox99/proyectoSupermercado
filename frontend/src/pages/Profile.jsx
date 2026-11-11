import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../lib/format'
import { Button, Card, Field, Icon, Notice, PageHeader } from '../components/ui'

const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

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
    <div style={{ maxWidth: 880 }}>
      <PageHeader icon="person-circle" title="Mi perfil" />
      <div className="row g-4">
        <div className="col-md-5">
          <div className="card h-100">
            <div className="card-body text-center py-4">
              <div className="avatar mx-auto mb-3" style={{ width: 72, height: 72, fontSize: '1.5rem' }}>{initials(user?.nombre)}</div>
              <h2 className="h5 fw-bold mb-0">{user?.nombre}</h2>
              <div className="text-body-secondary small mb-3">@{user?.username}</div>
              <ul className="list-group list-group-flush text-start small">
                <li className="list-group-item bg-transparent d-flex justify-content-between"><span className="text-body-secondary">Cargo</span><span>{ROLE_LABELS[user?.rol]}</span></li>
                <li className="list-group-item bg-transparent d-flex justify-content-between"><span className="text-body-secondary">Tienda</span><span>{user?.rol === 'admin' ? 'Todas' : store?.nombre}</span></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="col-md-7">
          <Card title="Cambiar contraseña" className="h-100">
            <Notice tone="success">{notice}</Notice>
            <Notice tone="error">{error}</Notice>
            <form onSubmit={save} className="vstack gap-3">
              <Field label="Nueva contraseña" error={tooShort ? 'Mínimo 8 caracteres.' : ''}>
                <input className="form-control" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
              </Field>
              <Field label="Confirmar contraseña" error={mismatch ? 'Las contraseñas no coinciden.' : ''}>
                <input className="form-control" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </Field>
              <div>
                <Button type="submit" icon="key" disabled={busy || !pwd || mismatch || tooShort}>Actualizar contraseña</Button>
              </div>
              <p className="small text-body-secondary mb-0"><Icon name="shield-lock" className="me-1" />La contraseña se guarda cifrada (bcrypt).</p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
