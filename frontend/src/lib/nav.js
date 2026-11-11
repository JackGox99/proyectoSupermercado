/**
 * Mapa de navegación por rol (Tabla 1 del documento).
 *
 * scope:
 *   - 'store'  → requiere una tienda activa (el admin general debe elegirla en el selector).
 *   - 'any'    → disponible también en la vista general del admin general.
 *   - 'global' → solo en la vista general (sin tienda seleccionada).
 * group: sección del menú lateral.
 * icon: nombre de Bootstrap Icons.
 */
const ALL = ['admin', 'admin_tienda', 'cajero', 'auxiliar_bodega']

export const NAV_ITEMS = [
  { to: '/tiendas', icon: 'shop-window', roles: ['admin'], scope: 'global', group: 'General', label: () => 'Tiendas' },
  {
    to: '/panel', icon: 'speedometer2', roles: ALL, scope: 'any', group: 'General',
    label: ({ store }) => (store ? 'Panel de la tienda' : 'Consolidado'),
  },
  {
    to: '/ventas', icon: 'receipt', roles: ['admin', 'admin_tienda', 'cajero'], scope: 'store', group: 'Operación',
    label: ({ rol }) => (rol === 'cajero' ? 'Punto de venta' : 'Ventas'),
  },
  {
    to: '/inventario', icon: 'boxes', roles: ALL, scope: 'store', group: 'Operación',
    label: ({ rol }) => (rol === 'cajero' ? 'Precios y stock' : 'Inventario'),
  },
  { to: '/productos', icon: 'tags', roles: ['admin', 'admin_tienda'], scope: 'store', group: 'Operación', label: () => 'Productos' },
  { to: '/alertas', icon: 'bell', roles: ALL, scope: 'store', group: 'Operación', label: () => 'Alertas' },
  {
    to: '/turnos', icon: 'calendar-week', roles: ALL, scope: 'store', group: 'Personal',
    label: ({ rol }) => (rol === 'cajero' || rol === 'auxiliar_bodega' ? 'Mis turnos' : 'Turnos'),
  },
  { to: '/personal', icon: 'people', roles: ['admin', 'admin_tienda'], scope: 'any', group: 'Personal', label: () => 'Personal' },
  { to: '/categorias', icon: 'collection', roles: ['admin'], scope: 'global', group: 'Administración', label: () => 'Categorías' },
  { to: '/reportes', icon: 'bar-chart-line', roles: ['admin', 'admin_tienda'], scope: 'any', group: 'Administración', label: () => 'Reportes' },
  { to: '/bitacora', icon: 'shield-check', roles: ['admin', 'admin_tienda'], scope: 'any', group: 'Administración', label: () => 'Bitácora' },
  { to: '/perfil', icon: 'person-circle', roles: ALL, scope: 'any', group: 'Cuenta', label: () => 'Mi perfil' },
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

/** Ítems visibles agrupados por sección, en orden. */
export function groupedNav(rol, store) {
  const groups = []
  for (const item of visibleNav(rol, store)) {
    let g = groups.find((x) => x.name === item.group)
    if (!g) {
      g = { name: item.group, items: [] }
      groups.push(g)
    }
    g.items.push(item)
  }
  return groups
}

/** Ruta inicial de cada rol después de iniciar sesión. */
export function homeFor(rol, store) {
  if (rol === 'admin' && !store) return '/tiendas'
  if (rol === 'cajero') return '/ventas'
  return '/panel'
}
