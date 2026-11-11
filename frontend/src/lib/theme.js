/**
 * Tema visual: modo claro/oscuro de Bootstrap 5.3 y color de la tienda activa.
 *
 * El color de la tienda reemplaza el color primario de Bootstrap (--bs-primary),
 * de modo que botones, enlaces, navegación activa y acentos cambian de color al
 * entrar a otra tienda.
 */

export const THEME_KEY = 'super_theme'
export const DEFAULT_STORE_COLOR = '#16A34A'

/** Paleta sugerida para tiendas: tonos medios legibles en modo claro y oscuro. */
export const STORE_PALETTE = ['#16A34A', '#2563EB', '#DB2777', '#D97706', '#7C3AED', '#0D9488', '#EA580C', '#DC2626']

function hexToRgb(hex) {
  const h = (hex || DEFAULT_STORE_COLOR).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mezcla el color con negro (amount < 0) o blanco (amount > 0). */
function mix([r, g, b], amount) {
  const target = amount < 0 ? 0 : 255
  const a = Math.abs(amount)
  return [r, g, b].map((c) => Math.round(c + (target - c) * a))
}

const toHex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('')

export function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* almacenamiento no disponible */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* almacenamiento no disponible */
  }
}

/**
 * Aplica el color de la tienda como color primario. En modo oscuro el texto en
 * color primario usa un tono más claro para mantener el contraste; los botones
 * conservan el tono base (con texto blanco).
 */
export function applyStoreColor(hex, theme) {
  const base = hexToRgb(hex)
  const text = theme === 'dark' ? mix(base, 0.35) : base
  const set = (k, v) => document.documentElement.style.setProperty(k, v)

  set('--store-color', toHex(base))
  set('--store-color-rgb', base.join(', '))
  set('--store-color-hover', toHex(mix(base, -0.12)))
  set('--store-color-active', toHex(mix(base, -0.2)))
  set('--bs-primary', toHex(text))
  set('--bs-primary-rgb', text.join(', '))
  set('--bs-link-color', toHex(text))
  set('--bs-link-color-rgb', text.join(', '))
  set('--bs-link-hover-color', toHex(mix(text, theme === 'dark' ? 0.2 : -0.15)))
  set('--bs-link-hover-color-rgb', mix(text, theme === 'dark' ? 0.2 : -0.15).join(', '))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', toHex(base))
}
