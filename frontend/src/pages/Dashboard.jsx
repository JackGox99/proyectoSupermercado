import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { money, number, ROLE_LABELS } from '../lib/format'
import { Button, Card, Empty, Icon, Loading, Notice, PageHeader, Stat, StoreDot, Table, useApi } from '../components/ui'
import { AlertList } from './Alerts'

/**
 * Panel — con tienda activa muestra los indicadores de esa tienda; en la vista
 * general del administrador general muestra el consolidado de todas las tiendas.
 */
export default function Dashboard() {
  const { store } = useAuth()
  return store ? <StorePanel /> : <ConsolidatedPanel />
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
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
        title={`${greeting()}, ${user?.nombre?.split(' ')[0] ?? ''}`}
        subtitle={`Tienda ${store.nombre} · ${ROLE_LABELS[rol]}`}
        actions={<QuickActions rol={rol} />}
      />
      <Notice tone="error">{error}</Notice>

      {operational && <ShiftBanner shift={shift.data?.shift} loading={shift.loading} rol={rol} />}

      {loading && !s ? (
        <Loading />
      ) : s ? (
        <div className="row g-3 mb-4 row-cols-1 row-cols-sm-2 row-cols-lg-3">
          <div className="col"><Stat icon="cash-coin" label="Ventas de hoy" value={money(s.total_hoy)} hint={`${number(s.ventas_hoy)} venta(s)`} /></div>
          <div className="col"><Stat icon="cart" label="Ventas abiertas" value={number(s.pedidos_abiertos)} tone="info" /></div>
          <div className="col"><Stat icon="tags" label="Productos" value={number(s.productos)} tone="neutral" hint={`Inventario ${money(s.valor_inventario)}`} /></div>
          <div className="col"><Stat icon="arrow-down-circle" label="En stock mínimo" value={number(s.stock_bajo)} tone="warning" /></div>
          <div className="col"><Stat icon="hourglass-split" label="Vencidos / por vencer" value={`${s.vencidos} / ${s.por_vencer}`} tone="error" /></div>
          <div className="col"><Stat icon="people" label="Personal activo" value={number(s.personal)} tone="success" hint={`${s.turnos_abiertos} en turno ahora`} /></div>
        </div>
      ) : null}

      <Card
        title={`Alertas de inventario (${alertCount})`}
        actions={<Link to="/alertas" className="small text-decoration-none">Ver todas <Icon name="arrow-right" /></Link>}
        bodyClassName="p-0"
      >
        {alerts.loading && !alerts.data ? <Loading /> : <AlertList alerts={(alerts.data?.alerts || []).slice(0, 8)} compact flush />}
      </Card>
    </div>
  )
}

function ShiftBanner({ shift, loading, rol }) {
  if (loading) return null
  if (shift) {
    return (
      <Notice tone="success">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
          <span>Turno en curso: <strong>{shift.hora_inicio}–{shift.hora_fin}</strong></span>
          <Link to="/turnos" className="alert-link">Cerrar turno</Link>
        </div>
      </Notice>
    )
  }
  return (
    <Notice tone="warning">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <span>
          No tienes un turno abierto.{' '}
          {rol === 'cajero' ? 'Para registrar ventas debes iniciar tu turno (RN-09).' : 'Inicia tu turno para comenzar la jornada.'}
        </span>
        <Link to="/turnos" className="alert-link">Iniciar turno</Link>
      </div>
    </Notice>
  )
}

function QuickActions({ rol }) {
  const navigate = useNavigate()
  const actions = {
    cajero: [
      { label: 'Registrar venta', to: '/ventas', icon: 'upc-scan', primary: true },
      { label: 'Precios y stock', to: '/inventario', icon: 'search' },
    ],
    auxiliar_bodega: [
      { label: 'Entrada de mercancía', to: '/inventario?accion=entrada', icon: 'box-arrow-in-down', primary: true },
      { label: 'Ajustar inventario', to: '/inventario?accion=ajuste', icon: 'sliders' },
    ],
    admin_tienda: [
      { label: 'Productos', to: '/productos', icon: 'tags', primary: true },
      { label: 'Turnos', to: '/turnos', icon: 'calendar-week' },
      { label: 'Reportes', to: '/reportes', icon: 'bar-chart-line' },
    ],
    admin: [
      { label: 'Productos', to: '/productos', icon: 'tags', primary: true },
      { label: 'Ventas', to: '/ventas', icon: 'receipt' },
      { label: 'Reportes', to: '/reportes', icon: 'bar-chart-line' },
    ],
  }[rol] || []

  return actions.map((a) => (
    <Button key={a.to} variant={a.primary ? 'primary' : 'ghost'} icon={a.icon} onClick={() => navigate(a.to)}>
      {a.label}
    </Button>
  ))
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
        actions={<Button icon="shop-window" onClick={() => navigate('/tiendas')}>Elegir tienda</Button>}
      />
      <Notice tone="error">{error}</Notice>

      <div className="row g-3 mb-4 row-cols-2 row-cols-lg-4">
        <div className="col"><Stat icon="receipt" label="Ventas de hoy" value={number(total('ventas_hoy'))} /></div>
        <div className="col"><Stat icon="cash-coin" label="Total vendido hoy" value={money(total('total_hoy'))} tone="success" /></div>
        <div className="col"><Stat icon="bell" label="Alertas de stock" value={number(total('stock_bajo'))} tone="warning" hint={`${total('vencidos')} vencidos · ${total('por_vencer')} por vencer`} /></div>
        <div className="col"><Stat icon="boxes" label="Inventario a costo" value={money(total('valor_inventario'))} tone="info" /></div>
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
                <td><span className="d-flex align-items-center gap-2 fw-semibold"><StoreDot color={s.color} />{s.nombre}</span></td>
                <td className="num">{number(s.ventas_hoy)}</td>
                <td className="num">{money(s.total_hoy)}</td>
                <td className="num">{number(s.productos)}</td>
                <td className="num">{number(s.stock_bajo)}</td>
                <td className="num">{number(s.vencidos)}</td>
                <td className="num">{number(s.por_vencer)}</td>
                <td className="num">{number(s.personal)}</td>
                <td className="num">{number(s.turnos_abiertos)}</td>
                <td className="num">{money(s.valor_inventario)}</td>
                <td className="text-end"><Button size="sm" variant="ghost" icon="arrow-right" onClick={() => enter(s)}>Administrar</Button></td>
              </tr>
            ))}
            <tr className="fw-bold">
              <td>Total</td>
              <td className="num">{number(total('ventas_hoy'))}</td>
              <td className="num">{money(total('total_hoy'))}</td>
              <td className="num">{number(total('productos'))}</td>
              <td className="num">{number(total('stock_bajo'))}</td>
              <td className="num">{number(total('vencidos'))}</td>
              <td className="num">{number(total('por_vencer'))}</td>
              <td className="num">{number(total('personal'))}</td>
              <td className="num">{number(total('turnos_abiertos'))}</td>
              <td className="num">{money(total('valor_inventario'))}</td>
              <td />
            </tr>
          </tbody>
        </Table>
      )}
    </div>
  )
}
