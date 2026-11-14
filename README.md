# proyectoSupermercado

**Sistema de información para la gestión de inventario, ventas y personal de un supermercado.**

Corporación Universitaria Minuto de Dios — UNIMINUTO · Ingeniería de Sistemas · Arquitectura de Software · 2026

Integrantes: Deivid Samir Garcia Dias · Julian Mateo Artunduaga Gomez (líder) · H. Santiago Suarez Olivos
Docente: Diego Aguirre

---

Aplicación web para supermercados de pequeña y mediana escala con varias tiendas. Centraliza
tres procesos: **inventario**, **ventas** y **personal**. Cada venta descuenta las existencias
automáticamente.

## Arquitectura

Monolito modular en capas, esquema cliente-servidor (ver [docs/architecture.md](docs/architecture.md)):

| Capa | Tecnología |
|---|---|
| Presentación | React 18 + Vite + Bootstrap 5.3 + Bootstrap Icons (servido por nginx) |
| Aplicación | API REST en Go + Gin · JWT · middleware de rol, tienda y bitácora |
| Lógica de negocio | Servicios por módulo: tiendas, personal, productos, inventario, ventas, turnos, alertas, reportes, auditoría |
| Acceso a datos | GORM + transacciones ACID sobre MySQL 8 |

## Roles (Tabla 1)

| Rol | Qué hace en el sistema |
|---|---|
| **Administrador general** | Entra a un **selector de tiendas**: crea, configura e inactiva tiendas, designa al administrador de cada una, define las categorías y consulta el consolidado. Dentro de cualquier tienda puede hacer **todo lo que hacen los demás roles**: vender, registrar entradas y ajustes, gestionar productos, turnos y personal (ADR-018). |
| **Administrador de tienda** | Administra solo su tienda: personal operativo, productos y precios, turnos, ventas (anulaciones), reportes y bitácora. |
| **Cajero** | Punto de venta: inicia su turno, registra la venta (lector de código de barras), cobra en efectivo, débito o crédito, entrega el comprobante y cierra su turno. |
| **Auxiliar de bodega** | Único rol que registra entradas de mercancía y ajustes por avería, devolución o vencimiento. Atiende las alertas. |

## Reglas de negocio implementadas

| Regla | Dónde |
|---|---|
| RN-01 No vender sin existencias | Validación al agregar y descuento condicional al pagar |
| RN-02 El stock se descuenta al pagar | Transacción de cobro (`FinalizeSale`) |
| RN-03 No vender vencidos | Al agregar y al pagar; alerta "Vencido — retirar" |
| RN-04 Solo la tienda asignada | Middleware `StoreScope` (403 + bitácora) |
| RN-05 Solo bodega modifica inventario | Rutas `/inventory/add` y `/inventory/adjust` (excepción: administrador general, ADR-018) |
| RN-06 Solo el admin general gestiona tiendas | Rutas `/venues` (403 + bitácora) |
| RN-07 Precio mayor que cero | Servicio de productos |
| RN-08 Código de barras único por tienda | Servicio + índice único `(sede_id, codigo_barras)` |
| RN-09 Venta asociada al cajero y su turno | `pedidos.turno_id`; no se vende sin turno abierto |
| RN-10 Venta pagada inmutable; anulación trazable | Anulación con motivo + movimientos inversos |
| RN-11 Alerta de stock mínimo | Panel de alertas y respuesta del cobro |
| RN-12 Usuario inactivo no inicia sesión | Servicio de autenticación |

También: turnos con cierre de caja (RF-11), reportes de ventas, inventario y personal en
CSV y XLSX (RF-12), bitácora de auditoría (RF-13), comprobante imprimible (RF-08) y las
demos de algoritmos (búsqueda binaria iterativa/recursiva, QuickSort/MergeSort, cambio
de monedas voraz).

## Ejecución

```bash
docker compose up --build
```

| Servicio | URL |
|---|---|
| Aplicación web | http://localhost:3000 |
| API | http://localhost:8080/api/v1 |
| MySQL | localhost:3309 |

Al primer arranque la API crea el esquema y carga datos de demostración: 3 tiendas,
10 categorías, 14 productos por tienda (con alertas de ejemplo) y turnos de 06:00 a 22:00
para los próximos 30 días.

### Usuarios de prueba

| Usuario | Contraseña | Rol | Tienda |
|---|---|---|---|
| `admin` | `admin123` | Administrador general | — |
| `tienda.galerias` | `tienda123` | Administrador de tienda | Galerías |
| `cajero.galerias` | `cajero123` | Cajero | Galerías |
| `bodega.galerias` | `bodega123` | Auxiliar de bodega | Galerías |

Mismo patrón para las otras tiendas: `tienda.restrepo`, `cajero.restrepo`, `bodega.restrepo`,
`tienda.zonat`, `cajero.zonat`, `bodega.zonat`.

### Desarrollo sin Docker

```bash
# API (requiere MySQL; variables en .env.example)
go run ./cmd/api

# Frontend
cd frontend && npm ci && npm run dev   # http://localhost:3000
```

## Documentación

- [Arquitectura](docs/architecture.md)
- [Decisiones de arquitectura (ADR)](docs/decisions.md)
- [Modelo relacional](docs/modelo_relacional.md)
- [Referencia de la API](docs/api.md)
- [Frontend](docs/frontend.md)
