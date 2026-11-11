/**
 * Cliente HTTP de la API REST (capa de presentación → capa de aplicación).
 *
 * - Agrega el token JWT de la sesión.
 * - Agrega el header X-Store-ID con la tienda activa: así el backend sabe
 *   sobre qué tienda opera el administrador general (RN-04 lo valida para
 *   el resto de roles).
 * - Convierte las respuestas de error en excepciones con el mensaje del servidor.
 */

export const AUTH_KEY = 'super_auth'
export const STORE_KEY = 'super_store'

export function readJSON(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

let unauthorizedHandler = null

/** Registra la acción a ejecutar cuando la sesión expira (401). */
export function onUnauthorized(fn) {
  unauthorizedHandler = fn
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

function headers(extra = {}) {
  const h = { ...extra }
  const auth = readJSON(AUTH_KEY)
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`
  const store = readJSON(STORE_KEY)
  if (store?.id) h['X-Store-ID'] = String(store.id)
  return h
}

async function handle(res) {
  const isJSON = (res.headers.get('content-type') || '').includes('application/json')
  const data = isJSON ? await res.json().catch(() => null) : null
  if (res.status === 401 && readJSON(AUTH_KEY)?.token && unauthorizedHandler) {
    unauthorizedHandler()
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Error ${res.status}`, res.status, data)
  }
  return data
}

/**
 * api('/products') · api('/orders', { method: 'POST', body: {...} })
 * Opciones: method, body (se envía como JSON), noStore (no enviar X-Store-ID).
 */
export async function api(path, { method = 'GET', body, noStore = false } = {}) {
  const h = headers(body !== undefined ? { 'Content-Type': 'application/json' } : {})
  if (noStore) delete h['X-Store-ID']
  let res
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: h,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // CU-01 A4: el servicio no respondió; la operación se puede reintentar.
    throw new ApiError('No fue posible comunicarse con el servidor. Intente de nuevo.', 0, null)
  }
  return handle(res)
}

/** Descarga un archivo (CSV/XLSX) respetando el token y la tienda activa. */
export async function download(path, fallbackName) {
  const res = await fetch(`/api/v1${path}`, { headers: headers() })
  if (!res.ok) {
    await handle(res)
    return
  }
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="([^"]+)"/)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = match ? match[1] : fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
