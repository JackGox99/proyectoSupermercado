# Arquitectura del sistema — Supermercado

## Resumen

Sistema de información para la gestión de inventario, ventas y personal de un supermercado
con varias tiendas. Es un **monolito modular en capas** bajo un esquema **cliente-servidor**
(sección 10 del documento del proyecto):

- **Presentación:** cliente web en React (Vite + Bootstrap 5.3 + Bootstrap Icons).
- **Aplicación:** API REST en **Go** con **Gin**: controladores, middleware de seguridad
  (JWT + rol + tienda), bitácora y manejo uniforme de errores.
- **Lógica de negocio:** servicios por módulo (tiendas, personal, productos, inventario,
  ventas, turnos, alertas, reportes, auditoría).
- **Acceso a datos:** repositorios con **GORM** y transacciones ACID sobre **MySQL**.

Cada capa depende solo de **interfaces** de la capa inferior (inyección de dependencias),
aplicando los principios SOLID.

## Módulos del dominio

| Módulo | Controller / Service / Repository | Reglas que implementa |
|---|---|---|
| Tiendas | `venue_*` | RF-01, RN-06 |
| Personal | `user_*` | RF-02, RF-04, RF-10, RN-12 |
| Productos | `product_*` | RF-05, RN-07, RN-08 |
| Inventario | `inventory_*` | CU-02, CU-03, RN-05 |
| Ventas | `order_*` | CU-01, RN-01, RN-02, RN-03, RN-09, RN-10 |
| Turnos | `shift_*` | RF-11, RN-09 |
| Alertas | `alert_*` | RF-09, RN-11 |
| Reportes | `report_*` + `internal/export` | RF-12 |
| Bitácora | `audit_*` + `middleware/audit.go` | RF-13, RN-06 |

## Dónde vive cada regla (sección 7.3)

- **Capa de aplicación (middleware):** autorización por rol (`RequireRole`) y por tienda
  (`StoreScope`, RN-04), RN-05 y RN-06 en las rutas; bitácora (`AuditTrail`).
- **Capa de lógica de negocio:** RN-01, RN-02, RN-03, RN-09, RN-10, RN-11 en los servicios.
- **Capa de acceso a datos:** RN-07 y RN-08 reforzadas además con restricciones e índices
  únicos; el descuento de stock usa un `UPDATE` condicional dentro de una transacción para
  que dos cajas no vendan la misma última unidad (CU-01, A5).

---

## Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│  cmd/api/main.go          — Punto de entrada (solo orquesta)    │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  internal/server/server.go    — Composition Root + Server       │
│  · Construye el grafo de dependencias                           │
│  · Registra middlewares                                         │
│  · Delega rutas a routes.Register                               │
└───────┬───────────────────────────────────────────┬─────────────┘
        │                                           │
┌───────▼──────────┐                   ┌────────────▼────────────┐
│  internal/routes │                   │  internal/middleware    │
│  · Define URLs   │                   │  · AuthRequired (JWT)   │
│  · Agrupa recursos REST              └─────────────────────────┘
└───────┬──────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│  internal/controllers/        — Capa HTTP                        │
│  · Parsea request, llama al service, serializa response JSON     │
│  · Depende de interfaces de services (no de implementaciones)    │
└───────┬──────────────────────────────────────────────────────────┘
        │  (interfaces)
┌───────▼──────────────────────────────────────────────────────────┐
│  internal/services/           — Capa de Lógica de Negocio        │
│  · Orquesta operaciones, aplica reglas de negocio                │
│  · Depende de interfaces de repository (no de GORM directamente) │
└───────┬──────────────────────────────────────────────────────────┘
        │  (interfaces)
┌───────▼──────────────────────────────────────────────────────────┐
│  internal/repository/         — Capa de Acceso a Datos           │
│  · Implementaciones GORM de las interfaces de repositorio        │
│  · Único lugar donde existe código SQL/GORM                      │
└───────┬──────────────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│  internal/models/             — Entidades de Dominio             │
│  · Structs GORM con json tags                                    │
│  · Sin lógica de negocio ni dependencias HTTP                    │
└──────────────────────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│  MySQL (Docker) ← internal/database/db.go                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Flujo de una petición HTTP

```
[Cliente web]  POST /api/v1/orders/42/finalize   (cobrar una venta, CU-01)
      │  Authorization: Bearer <jwt> · X-Store-ID: 1
      ▼
[AuditTrail]        registra la operación al terminar (RF-13)
      ▼
[AuthRequired]      valida el JWT
      ▼
[StoreScope]        resuelve la tienda; rechaza otra tienda (RN-04)
      ▼
[Audited + RequireRole(cajero)]
      ▼
[OrderController.Finalize]     bind JSON
      ▼
[OrderService.Finalize]        método de pago válido, turno abierto (RN-09)
      ▼
[OrderRepository.FinalizeSale] una transacción ACID:
      │   SELECT … FOR UPDATE (venta)
      │   valida vencimiento (RN-03)
      │   UPDATE inventario … WHERE stock_actual >= q   (RN-01, RN-02, A5)
      │   INSERT movimiento descuento_venta · INSERT pago · UPDATE venta → pagado
      ▼
[Respuesta 200]     total, alertas de stock mínimo (RN-11), cambio (algoritmo voraz)
```

---

## Principios SOLID aplicados

### S — Single Responsibility Principle
Cada paquete tiene exactamente una razón para cambiar:

| Paquete | Razón de cambio |
|---|---|
| `models` | Cambia el esquema de BD |
| `repository` | Cambia el ORM o motor de BD |
| `services` | Cambia una regla de negocio |
| `controllers` | Cambia el formato de la API |
| `routes` | Cambia la estructura de URLs |
| `server` | Cambia la inicialización o el framework |
| `middleware` | Cambia la estrategia de autenticación |

### O — Open/Closed Principle
Para agregar un nuevo recurso (ej: `Turno`):
1. Crear `models/turno.go`
2. Crear `repository/turno_repository.go` (interfaz + impl)
3. Crear `services/turno_service.go` (interfaz + impl)
4. Crear `controllers/turno_controller.go`
5. Agregar `Turno *TurnoController` a `routes.Controllers`
6. Agregar rutas en `routes.Register`

**Ningún archivo existente necesita ser modificado** — solo adición.

### L — Liskov Substitution Principle
Cualquier implementación alternativa de `UserRepository` (ej: PostgreSQL, Redis cache, mock para tests)
puede reemplazar a `userRepository` sin cambiar `userService` ni `UserController`.

### I — Interface Segregation Principle
Las interfaces son pequeñas y enfocadas en un rol. `ReportService` solo conoce los métodos
de reporte — no hereda métodos de `OrderService`. `PaymentRepository` expone solo 3 métodos
en lugar de compartir interfaz con `OrderRepository`.

### D — Dependency Inversion Principle
```
Controller  →  depende de →  services.OrderService (interfaz)
Service     →  depende de →  repository.OrderRepository (interfaz)
Repository  →  depende de →  *gorm.DB (detalle de implementación — oculto)
```
Los módulos de alto nivel (controllers) nunca importan `gorm.io/gorm`.

---

## Composition Root

`internal/server/server.go` es el **único archivo** donde se instancian objetos concretos y se
ensambla el grafo de dependencias. Esta es la aplicación del patrón **Composition Root**:

```go
// server.go — setupRoutes()
userRepo := repository.NewUserRepository(s.db)   // concreto
userSvc  := services.NewUserService(userRepo)     // concreto
ctrl     := controllers.NewUserController(userSvc) // concreto

// A partir de aquí todo el código trabaja con interfaces
```

Ventaja: para hacer un test de integración, se puede crear un `Server` de prueba con un DB
de test — sin tocar ningún otro archivo.

---

## Grafo de dependencias (sin ciclos)

```
main
 └── server
      ├── config
      ├── database
      ├── repository  ──→  models
      ├── services    ──→  repository, models, config
      ├── controllers ──→  services
      ├── routes      ──→  controllers
      └── middleware
```

Go garantiza en tiempo de compilación que no haya ciclos de importación.

---

---

## Arquitectura frontend

Ver [docs/frontend.md](frontend.md). El cliente web no contiene reglas de negocio: solo
anticipa errores para mejorar la experiencia; la validación que protege el negocio se
ejecuta siempre en el servidor.

| Entorno | URL |
|---|---|
| Desarrollo (`npm run dev`) | `http://localhost:3000` (proxy `/api` → `:8080`) |
| Docker Compose | `http://localhost:3000` |
| API | `http://localhost:8080/api/v1/...` |

---

## Decisiones de diseño

Ver [docs/decisions.md](decisions.md) para el registro completo de decisiones arquitectónicas (ADRs).

Ver [docs/modelo_relacional.md](modelo_relacional.md) para el modelo entidad-relación y sus decisiones de diseño.
