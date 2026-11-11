/** Utilidades de formato y catálogos de etiquetas en español. */

const moneyFmt = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export const money = (n) => moneyFmt.format(Number(n) || 0)

export const number = (n) => new Intl.NumberFormat('es-CO').format(Number(n) || 0)

/** Toma la parte de fecha (AAAA-MM-DD) de un valor del servidor sin desfases de zona horaria. */
export const isoDate = (v) => (v ? String(v).slice(0, 10) : '')

/** dd/mm/aaaa a partir de una fecha del servidor. */
export function date(v) {
  const d = isoDate(v)
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

export function dateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
}

/** Fecha local de hoy en formato AAAA-MM-DD. */
export function todayISO(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ── Roles (Tabla 1 del documento) ──────────────────────────────────────────
export const ROLE_LABELS = {
  admin: 'Administrador general',
  admin_tienda: 'Administrador de tienda',
  cajero: 'Cajero',
  auxiliar_bodega: 'Auxiliar de bodega',
}

export const ROLE_TONES = {
  admin: 'brand',
  admin_tienda: 'info',
  cajero: 'success',
  auxiliar_bodega: 'warning',
}

export const isAdminRole = (rol) => rol === 'admin' || rol === 'admin_tienda'

// ── Catálogo ───────────────────────────────────────────────────────────────
export const UNIT_LABELS = {
  unidad: 'Unidad',
  kg: 'Kilogramo (kg)',
  g: 'Gramo (g)',
  l: 'Litro (l)',
  ml: 'Mililitro (ml)',
  paquete: 'Paquete',
}

export const UNIT_SHORT = { unidad: 'und', kg: 'kg', g: 'g', l: 'l', ml: 'ml', paquete: 'paq' }

// ── Inventario ─────────────────────────────────────────────────────────────
export const MOVEMENT_LABELS = {
  entrada: 'Entrada de mercancía',
  descuento_venta: 'Descuento por venta',
  anulacion_venta: 'Anulación de venta',
  ajuste_averia: 'Ajuste por avería',
  ajuste_devolucion: 'Ajuste por devolución',
  ajuste_vencimiento: 'Ajuste por vencimiento',
  ajuste_manual: 'Corrección de conteo',
}

export const ADJUSTMENT_TYPES = [
  { value: 'averia', label: 'Avería', direction: 'out', hint: 'Producto dañado: retira unidades.' },
  { value: 'vencimiento', label: 'Vencimiento', direction: 'out', hint: 'Producto vencido: retira unidades.' },
  { value: 'devolucion', label: 'Devolución', direction: 'both', hint: 'Devolución de cliente (+) o a proveedor (−).' },
  { value: 'correccion', label: 'Corrección de conteo', direction: 'both', hint: 'Ajuste por conteo físico (+/−).' },
]

/** Estado de existencias para badges. */
export function stockState(actual, minimo) {
  if (actual <= 0) return { label: 'Agotado', tone: 'error' }
  if (actual <= minimo) return { label: 'Stock mínimo', tone: 'warning' }
  return { label: 'Disponible', tone: 'success' }
}

/** Estado de vencimiento a partir de la fecha (AAAA-MM-DD). */
export function expiryState(fecha, windowDays = 7) {
  if (!fecha) return { label: 'No vence', tone: 'neutral', days: null }
  const today = new Date(todayISO() + 'T00:00:00')
  const exp = new Date(isoDate(fecha) + 'T00:00:00')
  const days = Math.round((exp - today) / 86400000)
  if (days < 0) return { label: 'Vencido — retirar', tone: 'error', days }
  if (days <= windowDays) return { label: days === 0 ? 'Vence hoy' : `Vence en ${days} d`, tone: 'warning', days }
  return { label: 'Vigente', tone: 'success', days }
}

// ── Ventas ─────────────────────────────────────────────────────────────────
export const PAYMENT_LABELS = {
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
}

export const ORDER_STATES = {
  abierto: { label: 'Abierta', tone: 'warning' },
  pagado: { label: 'Pagada', tone: 'success' },
  anulado: { label: 'Anulada', tone: 'error' },
}

export const SHIFT_STATES = {
  programado: { label: 'Programado', tone: 'info' },
  abierto: { label: 'En curso', tone: 'success' },
  cerrado: { label: 'Cerrado', tone: 'neutral' },
}

export const orderTotal = (order) =>
  (order?.items || []).reduce((sum, it) => sum + it.precio_unitario * it.cantidad, 0)
