/**
 * Mapa de navegación por rol (Tabla 1 del documento).
 *
 * scope:
 *   - 'store'  → requiere una tienda activa (el admin general debe elegirla en el selector).
 *   - 'any'    → disponible también en la vista general del admin general.
 *   - 'global' → solo en la vista general (sin tienda seleccionada).
 */
const ALL = ['admin', 'admin_tienda', 'cajero', 'auxiliar_bodega']

export const NAV_ITEMS = [
  { to: '/tiendas', icon: '🏬', roles: ['admin'], scope: 'global', label: () => 'Tiendas' },
  {
    to: '/panel', icon: '▦', roles: ALL, scope: 'any',
    label: ({ store }) => (store ? 'Panel de la tienda' : 'Consolidado'),
  },
  {
    to: '/ventas', icon: '🧾', roles: ['admin', 'admin_tienda', 'cajero'], scope: 'store',
    label: ({ rol }) => (rol === 'cajero' ? 'Punto de venta' : 'Ventas'),
  },
  {
    to: '/inventario', icon: '📦', roles: ALL, scope: 'store',
    label: ({ rol }) => (rol === 'cajero' ? 'Precios y stock' : 'Inventario'),
  },
  { to: '/productos', icon: '🛒', roles: ['admin', 'admin_tienda'], scope: 'store', label: () => 'Productos' },
  { to: '/alertas', icon: '🔔', roles: ALL, scope: 'store', label: () => 'Alertas' },
  {
    to: '/turnos', icon: '🕒', roles: ALL, scope: 'store',
    label: ({ rol }) => (rol === 'cajero' || rol === 'auxiliar_bodega' ? 'Mis turnos' : 'Turnos'),
  },
  { to: '/personal', icon: '👥', roles: ['admin', 'admin_tienda'], scope: 'any', label: () => 'Personal' },
  { to: '/categorias', icon: '📂', roles: ['admin'], scope: 'global', label: () => 'Categorías' },
  { to: '/reportes', icon: '📊', roles: ['admin', 'admin_tienda'], scope: 'any', label: () => 'Reportes' },
  { to: '/bitacora', icon: '📜', roles: ['admin', 'admin_tienda'], scope: 'any', label: () => 'Bitácora' },
  { to: '/perfil', icon: '🔑', roles: ALL, scope: 'any', label: () => 'Mi perfil' },
]

/** Ítems visibles para el rol y el modo actual. */
export function visibleNav(rol, store) {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(rol)) return false
    if (item.scope === 'store') return !!store
    if (item.scope === 'global') return !store
    return true
  })
}

/** Ruta inicial de cada rol después de iniciar sesión. */
export function homeFor(rol, store) {
  if (rol === 'admin' && !store) return '/tiendas'
  if (rol === 'cajero') return '/ventas'
  return '/panel'
}
