# Frontend — guía técnica

Cliente web (capa de presentación) en **React 18 + Vite + Tailwind CSS**, servido por
nginx en producción. Interfaz en español, alineada a los roles de la Tabla 1.

## Estructura

```
frontend/src/
├── api.js                    # Cliente HTTP: JWT, header X-Store-ID, errores, descargas
├── context/AuthContext.jsx   # Sesión + tienda activa + color de la tienda
├── lib/
│   ├── format.js             # Moneda COP, fechas, etiquetas (roles, estados, unidades…)
│   └── nav.js                # Menú por rol y modo; ruta inicial de cada rol
├── components/
│   ├── ui.jsx                # Card, Stat, Badge, Button, Modal, Field, Tabs, Table, useApi
│   ├── ProtectedRoute.jsx    # Exige sesión, rol y/o tienda activa
│   └── layout/               # Header (tienda activa), Sidebar, Layout
└── pages/
    ├── Login.jsx
    ├── StoreSelector.jsx     # Selector de tiendas del administrador general
    ├── Dashboard.jsx         # Panel de la tienda / consolidado
    ├── Sales.jsx             # Punto de venta (cajero) e historial + anulación (admins)
    ├── Inventory.jsx         # Existencias, entradas, ajustes, movimientos, búsqueda binaria
    ├── Products.jsx          # Catálogo y precios de la tienda
    ├── Alerts.jsx            # Stock mínimo, agotados, vencidos, por vencer
    ├── Shifts.jsx            # Asignación de turnos / mis turnos y cierre de caja
    ├── Staff.jsx             # Personal (datos básicos, cargo, estado, ingreso)
    ├── Categories.jsx        # Parámetro global (administrador general)
    ├── Reports.jsx           # Ventas, inventario y personal + CSV / XLSX
    ├── Audit.jsx             # Bitácora de auditoría
    └── Profile.jsx           # Cambio de contraseña
```

## Tienda activa

- El **administrador general** inicia en `/tiendas`: ve cada tienda con su color y sus
  indicadores, más el consolidado. Al pulsar *Administrar tienda* la aplicación entra en
  esa tienda; *Cambiar tienda* (en el encabezado) vuelve al selector.
- **Administrador de tienda, cajero y auxiliar de bodega** quedan fijos en su tienda.
- La tienda activa se guarda en `localStorage` y `api.js` la envía en `X-Store-ID`.
- Su color reemplaza `--color-brand-primary`: botones, navegación activa, encabezado y
  badges cambian de color, así cada tienda se ve distinta.

## Navegación por rol

| Pantalla | Admin general | Admin tienda | Cajero | Aux. bodega |
|---|---|---|---|---|
| Tiendas (selector) | ✔ vista general | | | |
| Panel / consolidado | ✔ | ✔ | ✔ | ✔ |
| Ventas | historial y anulación | historial y anulación | punto de venta | |
| Inventario | consulta + movimientos | consulta + movimientos | precios y stock | entradas, ajustes, movimientos |
| Productos | ✔ | ✔ | | |
| Alertas | ✔ | ✔ | ✔ | ✔ |
| Turnos | asignar | asignar | mis turnos | mis turnos |
| Personal | ✔ (todo) | ✔ (su tienda) | | |
| Categorías | ✔ vista general | | | |
| Reportes / Bitácora | ✔ (tienda o consolidado) | ✔ (su tienda) | | |

Las pantallas de tienda exigen una tienda activa (`ProtectedRoute requireStore`); si el
administrador general no eligió una, lo envía al selector.

## Punto de venta (CU-01)

1. Si el cajero no tiene turno abierto, la pantalla ofrece iniciar el turno del día (RN-09).
2. *Nueva venta* → el cajero escanea (o digita) el código de barras, o busca por nombre.
   El servidor valida existencias (RN-01) y vencimiento (RN-03) en cada línea.
3. *Cobrar* → medio de pago y, en efectivo, monto recibido. El servidor descuenta el stock
   en la misma transacción del pago (RN-02) y responde con el cambio (algoritmo voraz) y las
   alertas de stock mínimo generadas (RN-11).
4. *Ver comprobante* → comprobante imprimible (RF-08, impresión de 80 mm).

## Estilos

Paleta en variables CSS (`src/index.css`) y clases de componentes (`btn-*`, `card`,
`badge-*`, `notice-*`, `data-table`, `input-field`). Las clases que se arman
dinámicamente están en el `safelist` de `tailwind.config.js`.

## Cómo correrlo

```bash
cd frontend
npm ci          # instala dependencias para el sistema operativo actual
npm run dev     # http://localhost:3000 — el proxy reenvía /api → http://localhost:8080
npm run build   # genera dist/ (lo sirve nginx en Docker)
```

Con Docker Compose desde la raíz: `docker compose up --build` → `http://localhost:3000`.
