import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { money, number, ROLE_LABELS, SHIFT_STATES } from '../lib/format'
import { Badge, Button, Card, Empty, Loading, Notice, PageHeader, Stat, StoreDot, Table, useApi } from '../components/ui'
import { AlertList } from './Alerts'

/**
 * Panel — con tienda activa muestra los indicadores de esa tienda; en la vista
 * general del administrador general muestra el consolidado de todas las tiendas.
 */
export default function Dashboard() {
  const { store } = useAuth()
  return store ? <StorePanel /> : <ConsolidatedPanel />
}

function StorePanel() {
  const { user, rol, store } = useAuth()
  const { data, error, loading } = useApi('/dashboard', [store?.id])
  const alerts = useApi('/alerts', [store?.id])
  const operational = rol === 'cajero' || rol === 'auxiliar_bodega'
  const shift = useApi(operational ? '/shifts/current' : null)

  const s = data?.store
  const alertCount = alerts.data?.alerts?.length ?? 0

  return (
    <div>
      <PageHeader
        title={`Tienda ${store.nombre}`}
        subtitle={`Hola, ${user?.nombre}. Estás operando como ${ROLE_LABELS[rol]?.toLowerCase()}.`}
      />
      <Notice tone="error">{error}</Notice>

      {operational && <ShiftBanner shift={shift.data?.shift} loading={shift.loading} rol={rol} />}

      {loading && !s ? (
        <Loading />
      ) : s ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          <Stat label="Ventas de hoy" value={number(s.ventas_hoy)} hint={money(s.total_hoy)} />
          <Stat label="Ventas abiertas" value={number(s.pedidos_abiertos)} tone="accent" />
          <Stat label="Productos" value={number(s.productos)} tone="neutral" hint={`Inventario a costo ${money(s.valor_inventario)}`} />
          <Stat label="En stock mínimo" value={number(s.stock_bajo)} tone="warning" />
          <Stat label="Vencidos / por vencer" value={`${s.vencidos} / ${s.por_vencer}`} tone="error" />
          <Stat label="Personal activo" value={number(s.personal)} tone="neutral" hint={`${s.turnos_abiertos} en turno ahora`} />
        </div>
      ) : null}

      <QuickActions rol={rol} />

      <Card
        title={`Alertas de inventario (${alertCount})`}
        actions={<Link to="/alertas" className="text-sm">Ver todas →</Link>}
        className="mt-6"
      >
        {alerts.loading && !alerts.data ? <Loading /> : <AlertList alerts={(alerts.data?.alerts || []).slice(0, 8)} compact />}
      </Card>
    </div>
  )
}

function ShiftBanner({ shift, loading, rol }) {
  if (loading) return null
  if (shift) {
    return (
      <Notice tone="success">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Turno en curso: {shift.hora_inicio}–{shift.hora_fin} <Badge tone={SHIFT_STATES.abierto.tone}>{SHIFT_STATES.abierto.label}</Badge>
          </span>
          <Link to="/turnos" className="text-sm">Cerrar turno →</Link>
        </div>
      </Notice>
    )
  }
  return (
    <Notice tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          No tienes un turno abierto.{' '}
          {rol === 'cajero' ? 'Para registrar ventas debes iniciar tu turno (RN-09).' : 'Inicia tu turno para comenzar la jornada.'}
        </span>
        <Link to="/turnos" className="text-sm font-semibold">Iniciar turno →</Link>
      </div>
    </Notice>
  )
}

function QuickActions({ rol }) {
  const navigate = useNavigate()
  const actions = {
    cajero: [
      { label: 'Registrar venta', to: '/ventas', primary: true },
      { label: 'Consultar precios y stock', to: '/inventario' },
      { label: 'Mis turnos', to: '/turnos' },
    ],
    auxiliar_bodega: [
      { label: 'Registrar entrada de mercancía', to: '/inventario?accion=entrada', primary: true },
      { label: 'Ajustar inventario', to: '/inventario?accion=ajuste' },
      { label: 'Ver alertas', to: '/alertas' },
    ],
    admin_tienda: [
      { label: 'Gestionar productos', to: '/productos', primary: true },
      { label: 'Asignar turnos', to: '/turnos' },
      { label: 'Personal', to: '/personal' },
      { label: 'Reportes', to: '/reportes' },
    ],
    admin: [
      { label: 'Gestionar productos', to: '/productos', primary: true },
      { label: 'Ventas de la tienda', to: '/ventas' },
      { label: 'Asignar turnos', to: '/turnos' },
      { label: 'Reportes de la tienda', to: '/reportes' },
    ],
  }[rol] || []

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.to} variant={a.primary ? 'primary' : 'ghost'} onClick={() => navigate(a.to)}>
          {a.label}
        </Button>
      ))}
    </div>
  )
}

function ConsolidatedPanel() {
  const { selectStore } = useAuth()
  const navigate = useNavigate()
  const { data, error, loading } = useApi('/dashboard', ['global'])
  const stores = data?.stores || []
  const total = (k) => stores.reduce((a, s) => a + (Number(s[k]) || 0), 0)

  function enter(s) {
    selectStore({ id: s.id, nombre: s.nombre, color: s.color, direccion: s.direccion })
    navigate('/panel')
  }

  return (
    <div>
      <PageHeader
        title="Consolidado de todas las tiendas"
        subtitle="Indicadores del día por tienda. Entra a una tienda para operar sobre ella."
        actions={<Button onClick={() => navigate('/tiendas')}>Elegir tienda</Button>}
      />
      <Notice tone="error">{error}</Notice>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="Ventas de hoy" value={number(total('ventas_hoy'))} />
        <Stat label="Total vendido hoy" value={money(total('total_hoy'))} tone="success" />
        <Stat label="Alertas de stock" value={number(total('stock_bajo'))} tone="warning" hint={`${total('vencidos')} vencidos · ${total('por_vencer')} por vencer`} />
        <Stat label="Inventario a costo" value={money(total('valor_inventario'))} tone="accent" />
      </div>

      {loading && !data ? (
        <Loading />
      ) : stores.length === 0 ? (
        <Empty>No hay tiendas activas.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Tienda</th>
              <th className="num">Ventas hoy</th>
              <th className="num">Total hoy</th>
              <th className="num">Productos</th>
              <th className="num">Stock mínimo</th>
              <th className="num">Vencidos</th>
              <th className="num">Por vencer</th>
              <th className="num">Personal</th>
              <th className="num">En turno</th>
              <th className="num">Inventario a costo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                <td><span className="flex items-center gap-2 font-semibold"><StoreDot color={s.color} />{s.nombre}</span></td>
                <td className="num">{number(s.ventas_hoy)}</td>
                <td className="num">{money(s.total_hoy)}</td>
                <td className="num">{number(s.productos)}</td>
                <td className="num">{number(s.stock_bajo)}</td>
                <td className="num">{number(s.vencidos)}</td>
                <td className="num">{number(s.por_vencer)}</td>
                <td className="num">{number(s.personal)}</td>
                <td className="num">{number(s.turnos_abiertos)}</td>
                <td className="num">{money(s.valor_inventario)}</td>
                <td><Button variant="ghost" className="!py-1 !px-3" onClick={() => enter(s)}>Administrar →</Button></td>
              </tr>
            ))}
            <tr>
              <td className="font-bold">Total</td>
              <td className="num font-bold">{number(total('ventas_hoy'))}</td>
              <td className="num font-bold">{money(total('total_hoy'))}</td>
              <td className="num font-bold">{number(total('productos'))}</td>
              <td className="num font-bold">{number(total('stock_bajo'))}</td>
              <td className="num font-bold">{number(total('vencidos'))}</td>
              <td className="num font-bold">{number(total('por_vencer'))}</td>
              <td className="num font-bold">{number(total('personal'))}</td>
              <td className="num font-bold">{number(total('turnos_abiertos'))}</td>
              <td className="num font-bold">{money(total('valor_inventario'))}</td>
              <td />
            </tr>
          </tbody>
        </Table>
      )}
    </div>
  )
}
