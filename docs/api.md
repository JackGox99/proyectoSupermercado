# Referencia de la API — Supermercado

API REST en Go (Gin). Base: `http://localhost:8080/api/v1`. Todas las respuestas son JSON,
excepto las exportaciones de reportes (CSV / XLSX).

## Autenticación y alcance por tienda

1. `POST /auth/login` con `{ "username": "...", "password": "..." }` devuelve un JWT.
2. Las rutas protegidas exigen `Authorization: Bearer <token>`.
3. La tienda sobre la que se opera se indica con el header **`X-Store-ID`** (o `?venue_id=`):
   - **Administrador general**: la tienda elegida en el selector. Sin header ve el consolidado.
   - **Resto de roles**: siempre su tienda asignada. Si el header apunta a otra tienda la API
     responde `403` (RN-04) y el intento queda en la bitácora.

Errores: `{ "error": "mensaje en español" }`. Códigos: `400` petición mal formada,
`401` sin sesión, `403` sin permiso, `404` no encontrado, `409` conflicto de negocio
(stock, estado, duplicado), `422` validación, `500` error interno (mensaje genérico).

## Roles

| Valor | Rol (Tabla 1) |
|---|---|
| `admin` | Administrador general (sin tienda) |
| `admin_tienda` | Administrador de tienda |
| `cajero` | Cajero |
| `auxiliar_bodega` | Auxiliar de bodega |

Abreviaturas de la columna **Roles**: AG = admin, AT = admin_tienda, CA = cajero, AB = auxiliar_bodega, Todos = cualquier usuario autenticado.

---

## Sesión y perfil

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público | Inicia sesión. Responde `token`, `rol`, `sede_id` y `sede` (con su color). RN-12: los usuarios inactivos se rechazan. |
| POST | `/auth/logout` | público | El cliente descarta el token. |
| PUT | `/profile/password` | Todos | `{ new_password, confirm_password }` (mínimo 8). |

## Tiendas — RF-01 / CU-09 / RN-06

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/venues` | Todos | AG: todas las tiendas (`?all=1` incluye inactivas). Resto: solo su tienda. |
| GET | `/venues/overview` | AG | Indicadores por tienda para el selector (ventas de hoy, alertas, personal, inventario). |
| GET | `/dashboard` | Todos | Indicadores de la tienda activa, o de todas si no hay tienda (consolidado). |
| POST | `/venues` | AG | `{ nombre, direccion, telefono, color }`. |
| PUT | `/venues/:id` | AG | Configura la tienda. |
| PATCH | `/venues/:id/status` | AG | `{ activa: bool }`. El personal de una tienda inactiva no puede iniciar sesión. |

## Personal — RF-02 / RF-10 / CU-06

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/users` | AG, AT | Personal de la tienda activa. `?sort_by=username` (QuickSort) o `nombre` (MergeSort). |
| GET | `/users/:id` | AG, AT | |
| POST | `/users` | AG, AT | `{ username, full_name, password, role, sede_id, documento, telefono, email, fecha_ingreso }`. AT solo crea `cajero` / `auxiliar_bodega` en su tienda. |
| PUT | `/users/:id` | AG, AT | Cambia datos, rol, tienda, estado (`activo`) o contraseña. |
| PATCH | `/users/:id/deactivate` | AG, AT | Inactivación lógica (RN-12). |
| DELETE | `/users/:id` | AG | Eliminación física. |

## Categorías (parámetro global)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/categories` | Todos | |
| POST / PUT / DELETE | `/categories[/:id]` | AG | `{ name, description }`. No se elimina si tiene productos. |

## Productos — RF-05 / CU-05

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/products` | Todos | Catálogo de la tienda con `stock_actual` y `stock_minimo`. |
| GET | `/products/barcode/:code` | Todos | Consulta por código de barras (lector, CU-04). |
| GET | `/products/:id` | Todos | |
| POST | `/products` | AG, AT | `{ barcode, name, category_id, unit, purchase_cost, sale_price, expiry_date, min_stock, description }`. RN-07: precio > 0. RN-08: código único en la tienda; si existe responde `409` con `existing_product_id`. |
| PUT | `/products/:id` | AG, AT | Mismos campos. |
| PATCH | `/products/:id/price` | AG, AT | `{ price }` (HU014). |
| DELETE | `/products/:id` | AG, AT | Retiro lógico del catálogo (HU016). |

Unidades (`unit`): `unidad`, `kg`, `g`, `l`, `ml`, `paquete`.

## Inventario — CU-02 / CU-03 / CU-04 / RN-05

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/inventory` | Todos | Existencias de la tienda. |
| GET | `/inventory/binary-search?name=&algo=iterative\|recursive` | Todos | Demo de MergeSort + búsqueda binaria. |
| GET | `/inventory/movements?tipo=&product=` | AG, AT, AB | Historial de movimientos (trazabilidad). |
| POST | `/inventory/add` | **AB**, AG | Entrada de mercancía `{ product_id, quantity, reason }`. |
| POST | `/inventory/adjust` | **AB**, AG | Ajuste `{ product_id, quantity, type, reason }`. `type`: `averia`, `vencimiento` (retiran unidades), `devolucion`, `correccion` (cantidad con signo). El stock nunca queda negativo. |

Tipos de movimiento: `entrada`, `descuento_venta`, `anulacion_venta`, `ajuste_averia`,
`ajuste_devolucion`, `ajuste_vencimiento`, `ajuste_manual`.

## Alertas — RN-11 / RF-09

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/alerts` | Todos | `{ alerts: [...], expiry_window_days }`. Tipos: `stock_minimo`, `agotado`, `vencido` (retirar, RN-03), `por_vencer` (7 días). |

## Ventas — CU-01

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/orders?estado=abierto\|pagado\|anulado&mine=1` | AG, AT, CA | CA ve solo sus ventas; `mine=1` filtra las del usuario autenticado. |
| GET | `/orders/:id` | AG, AT, CA | Detalle completo; sirve como comprobante (RF-08). |
| POST | `/orders` | CA, AG | Abre una venta. El cajero requiere turno abierto (RN-09); AG vende en la tienda activa sin turno (ADR-018). |
| DELETE | `/orders/:id` | CA, AG | Cancela una venta abierta propia (no afecta inventario). |
| POST | `/orders/:id/items` | CA, AG | `{ barcode \| product_id, cantidad }`. Valida stock (RN-01) y vencimiento (RN-03); **no** descuenta stock. |
| DELETE | `/orders/:id/items/:itemId` | CA, AG | |
| POST | `/orders/:id/finalize` (alias `/pay`) | CA, AG | `{ metodo_pago, monto_entregado? }`. Cobra y descuenta stock en una transacción (RN-02, RNF-07). Responde `total`, `alerts` (RN-11) y `cambio` (algoritmo voraz) si es efectivo. |
| POST | `/orders/:id/annul` | AG, AT | `{ motivo }` obligatorio. Anula una venta pagada con movimientos inversos (RN-10). |

Medios de pago: `efectivo`, `tarjeta_debito`, `tarjeta_credito`.

## Turnos — RF-11 / CU-07

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/shifts?from=&to=&usuario_id=&estado=` | Todos | AG/AT: turnos de la tienda. CA/AB: los propios. |
| GET | `/shifts/current` | Todos | Turno abierto del usuario (`{ shift: null }` si no tiene). |
| POST | `/shifts` | AG, AT | `{ usuario_id, fecha, hora_inicio, hora_fin }` dentro de 06:00–22:00 (RNF-03). Un turno por empleado y fecha. |
| DELETE | `/shifts/:id` | AG, AT | Solo turnos programados. |
| POST | `/shifts/:id/open` | CA, AB | Inicia el turno de hoy. |
| POST | `/shifts/:id/close` | dueño, AG, AT | Cierra el turno y guarda el resumen de caja. Falla si quedan ventas abiertas. |

## Reportes — RF-12 / CU-08

Todos para AG y AT, por período con `?from=AAAA-MM-DD&to=AAAA-MM-DD`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/reports/sales` | KPIs (ingresos, ventas, anuladas), más vendidos y detalle. |
| GET | `/reports/inventory` | Inventario valorizado, stock mínimo y vencimientos (sin período). |
| GET | `/reports/staff` | Personal con turnos y ventas del período. |
| GET | `/reports/{sales\|inventory\|staff}/export?format=csv\|xlsx` | Descarga el reporte. |

## Bitácora — RF-13

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/audit?from=&to=&accion=&usuario=&resultado=` | AG, AT | Operaciones críticas y accesos denegados. `resultado`: `exito`, `denegado`, `fallido`. |

## Salud

`GET /health` → `{ "status": "ok" }` (fuera de `/api/v1`).
