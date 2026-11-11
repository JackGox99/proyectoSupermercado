# Architecture Decision Records (ADRs)

Registro de decisiones arquitectónicas tomadas en el proyecto, con contexto,
alternativas evaluadas y justificación de la elección.

---

## ADR-001 — Arquitectura en capas con Repository Pattern

**Estado:** Aceptado
**Fecha:** 2026-03-21
**HU relacionada:** HU003

### Contexto
Se necesita una arquitectura que soporte múltiples HUs de lógica de negocio (inventario,
pedidos, reportes), sea testeable y pueda escalar sin reescribir código existente.

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **Controller directo a DB** | El controller inyecta `*gorm.DB` y hace queries directamente | Viola SRP; cambiar ORM requiere tocar todos los controllers; imposible hacer unit tests sin BD |
| **Controller → Service → DB** | Capa de servicio pero sin repositorio | La lógica de acceso a datos queda en el servicio; difícil cambiar ORM o hacer mocks |
| **Repository Pattern** ✓ | Controller → Service (interfaz) → Repository (interfaz) → GORM | Elegida |
| **CQRS** | Separa comandos de queries en stacks distintos | Sobre-ingeniería para el tamaño del proyecto |
| **Hexagonal / Ports & Adapters** | Dominio puro sin dependencias externas | Válido pero más verboso; el beneficio no justifica la complejidad adicional aquí |

### Decisión
Repository Pattern con Service Layer. Las interfaces se definen en el paquete
que las posee (`repository.*Repository`, `services.*Service`). Los constructores
devuelven interfaces, no structs concretos.

### Consecuencias
- **Positivo:** Cada capa es testeable de forma aislada con mocks
- **Positivo:** Cambiar GORM por `pgx` o `sqlc` solo requiere reescribir el paquete `repository`
- **Positivo:** La lógica de negocio (services) no tiene dependencia de Gin ni de GORM
- **Negativo:** Más archivos y boilerplate inicial

---

## ADR-002 — Server Struct como Composition Root

**Estado:** Aceptado
**Fecha:** 2026-03-21
**HU relacionada:** HU003

### Contexto
Necesitamos un lugar donde ensamblar el grafo de dependencias sin contaminar `main.go`
ni distribuir la construcción de objetos entre múltiples paquetes.

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **Variables globales** | `var db *gorm.DB` a nivel de paquete | Estado global; dificulta tests paralelos; viola DIP |
| **main.go hace el wiring** | main instancia repositorios, servicios, controllers | main crece indefinidamente; difícil de testear |
| **Wire (Google)** | Generación de DI en tiempo de compilación | Overkill para el tamaño actual; agrega una herramienta de build |
| **Fx (Uber)** | DI en runtime con reflection | Magic implícita; errores difíciles de depurar; overkill |
| **Server Struct** ✓ | `server.New(cfg, db)` es el único Composition Root | Elegida |

### Decisión
`internal/server/server.go` contiene el Server struct y su método `setupRoutes()`,
que es el único lugar donde se instancian objetos concretos y se ensambla el grafo.

### Consecuencias
- **Positivo:** `main.go` queda en 10 líneas y es trivial
- **Positivo:** Para tests de integración: `server.New(testCfg, testDB)` sin cambiar nada más
- **Positivo:** Única fuente de verdad del grafo de dependencias

---

## ADR-003 — Gin como framework HTTP

**Estado:** Aceptado
**Fecha:** 2026-03-21

### Contexto
Go tiene múltiples opciones para servidor HTTP. Se necesita routing con parámetros,
middleware, y serialización JSON eficiente.

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **net/http** (stdlib) | Router manual | Sin grupos de rutas, sin middleware stacking nativo, más boilerplate |
| **Gin** ✓ | Framework minimalista y rápido | Elegido |
| **Echo** | Similar a Gin, levemente más ergonómico | El equipo ya tiene experiencia con Gin; el proyecto ya tenía la dependencia |
| **Fiber** | Inspirado en Express.js, muy rápido | Basado en `fasthttp` (no `net/http`); no compatible con la stdlib de Go; menor ecosistema de middleware |
| **Chi** | Router minimalista 100% compatible stdlib | Válido; Gin tiene mayor adopción y mejor documentación para equipos nuevos en Go |

### Decisión
Gin. Se usa `gin.New()` en lugar de `gin.Default()` para tener control explícito
sobre qué middlewares se registran (Logger, Recovery se añaden explícitamente).

### Consecuencias
- **Positivo:** Routing con parámetros, groups, y middleware en pocas líneas
- **Positivo:** Rendimiento: radix tree para routing
- **Positivo:** `gin.H{}` simplifica la serialización JSON de respuestas
- **Negativo:** Acoplamiento al tipo `*gin.Context` en todos los controllers (mitigado: es el único acoplamiento a Gin en la capa HTTP)

---

## ADR-004 — GORM como ORM

**Estado:** Aceptado
**Fecha:** 2026-03-21

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **database/sql** (stdlib) | Queries SQL manuales | Mucho boilerplate para un CRUD; sin migrations automáticas |
| **GORM** ✓ | ORM completo con AutoMigrate | Elegido |
| **sqlx** | Extensión de database/sql | Más control sobre SQL pero más boilerplate que GORM |
| **sqlc** | Genera Go a partir de SQL | Excelente para control total, pero requiere escribir SQL explícito; curva de aprendizaje mayor |
| **Ent** (Meta) | ORM con generación de código | Potente pero mayor complejidad inicial |

### Decisión
GORM con `AutoMigrate`. El `schema.sql` existente sirve como documentación del esquema;
GORM lo gestiona en runtime.

### Nota sobre AutoMigrate vs Migrations dedicadas
`AutoMigrate` es conveniente pero tiene limitaciones en producción:
- No puede eliminar columnas
- No garantiza orden de ejecución
- Puede causar locks en tablas grandes

**Para producción futura se recomienda migrar a `golang-migrate` o `goose`** con archivos
versionados `.sql`. El `schema.sql` ya existente facilita esa transición.

---

## ADR-005 — godotenv para configuración

**Estado:** Aceptado
**Fecha:** 2026-03-21

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **godotenv** ✓ | Carga `.env` en variables de entorno | Elegido — simple, sin magia |
| **viper** | Config completa: YAML, JSON, .env, remote, hot-reload | Over-engineering para los requisitos actuales; agrega 10+ dependencias transitivas |
| **envconfig** | Mapea env vars a structs con tags | Válido; godotenv + struct manual es igualmente claro y ya estaba implementado |

### Decisión
`godotenv` + `config.Config` struct con `getEnv(key, fallback)`. Si en el futuro se
necesita configuración jerárquica (múltiples entornos, override por archivo YAML), migrar
a `viper` es sencillo: solo cambia `config.go`.

---

## ADR-006 — gin.New() vs gin.Default()

**Estado:** Aceptado
**Fecha:** 2026-03-21

### Contexto
`gin.Default()` incluye automáticamente `Logger` y `Recovery`. `gin.New()` es el router vacío.

### Decisión
`gin.New()` con middlewares explícitos en `server.setupMiddleware()`.

### Justificación
- **Explícito > implícito** (principio Go)
- Permite sustituir el logger de Gin por `zerolog` o `zap` en un solo lugar sin efectos secundarios
- `gin.Default()` no es "incorrecto", pero `gin.New()` hace visible lo que corre

---

## ADR-007 — Middleware authMiddleware como parámetro de routes.Register

**Estado:** Aceptado
**Fecha:** 2026-03-21

### Contexto
El middleware de autenticación podría estar hardcodeado dentro de `routes.Register`
o recibirse como dependencia.

### Decisión
Se pasa como `gin.HandlerFunc` por parámetro:
```go
func Register(r *gin.Engine, ctrl Controllers, authMiddleware gin.HandlerFunc)
```

### Justificación
- `routes` no tiene dependencia directa del paquete `middleware` (DIP)
- En tests, se puede pasar un `authMiddleware` que siempre aprueba, sin cambiar routes
- Si el mecanismo de auth cambia (JWT → OAuth2), solo cambia el middleware — routes no se toca

---

---

## ADR-008 — Framework y sistema de diseño del Frontend

> **Estado:** la parte de estilos (Tailwind CSS) fue reemplazada por Bootstrap 5.3 — ver ADR-017. React + Vite se mantienen.

**Estado:** Aceptado
**Fecha:** 2026-03-21
**HU relacionada:** HU004

### Contexto
Se necesita configurar el entorno base de la interfaz de usuario. El frontend debe ser responsive,
en inglés, compatible con Google Chrome, y contar con una paleta corporativa.
Se evaluaron tres familias de soluciones: frameworks component-based, frameworks ligeros, y HTML/CSS puro.

### Alternativas evaluadas

| Opción | Descripción | Descartada porque |
|---|---|---|
| **Vanilla HTML/CSS/JS** | Sin build tooling, Fetch API nativa | Sin componentes reutilizables; el mantenimiento se degrada rápidamente; sin hot-reload |
| **HTML + Bootstrap CDN** | Bootstrap via CDN, sin bundle step | CSS completo (~200KB) aunque se use el 5%; clases genéricas dificultan la personalización de la paleta corporativa |
| **Vue 3 + Vite + Tailwind** | Framework progresivo, Composition API | Ecosistema menor; React domina el mercado laboral y tiene más integraciones con librerías de UI |
| **React + Vite + Tailwind CSS** ✓ | SPA component-based, Vite dev server, utilidades responsive | Elegido |
| **Next.js** | React con SSR/SSG | Sobre-ingeniería para un panel interno; el backend Go ya sirve la API; SSR no aporta valor aquí |

### Decisión
**React 18 + Vite 5 + Tailwind CSS 3** como stack frontend.

- **React**: modelo de componentes se alinea con la arquitectura en capas del backend (SRP, OCP).
  Cada módulo del sistema (inventario, pedidos, reportes) mapea naturalmente a un componente/página.
- **Vite**: dev server con HMR instantáneo + proxy a `:8080` para evitar CORS en desarrollo.
  Build produce assets estáticos servibles por nginx sin servidor Node.js en producción.
- **Tailwind CSS**: utilidades responsive (`md:hidden`, `md:translate-x-0`) resuelven el
  comportamiento del sidebar hamburger sin JavaScript adicional. Tokens de color extendidos
  en `tailwind.config.js` materializan la paleta corporativa como clases de utilidad.

### Estructura del frontend

```
frontend/
├── src/
│   ├── components/layout/   # Header, Sidebar, Layout (shell)
│   ├── pages/               # Una página por módulo de negocio
│   └── index.css            # Paleta corporativa + utilidades globales
├── vite.config.js           # Proxy /api → :8080
├── tailwind.config.js       # Paleta corporativa extendida
└── Dockerfile               # Multi-stage: build (node) + serve (nginx)
```

### Paleta y color por tienda

Los colores viven como variables CSS en `src/index.css`. `--color-brand-primary`
se reemplaza en tiempo de ejecución por el **color de la tienda activa** (ver ADR-010),
de modo que cada tienda se ve distinta y el usuario siempre sabe dónde opera.

| Variable | Valor | Uso |
|---|---|---|
| `--color-brand-primary` | color de la tienda (por defecto `#4ADE80`) | acentos, botones primarios, navegación activa |
| `--color-brand-dark` | `#07110B` | texto sobre el color de marca |
| `--color-bg-base` / `surface` / `elevated` | `#08110C` / `#0F1D15` / `#17291F` | fondos |
| `--color-accent` | `#FB923C` | naranja etiqueta de precio |
| `--color-success` / `warning` / `error` / `info` | | estados |

### Consecuencias
- **Positivo:** `npm run dev` levanta en 3000 con proxy al backend; no se necesita configurar CORS
- **Positivo:** `npm run build` produce un `dist/` estático que nginx sirve sin Node.js en producción
- **Positivo:** Tailwind purga CSS no usado → bundle final < 10KB de CSS
- **Positivo:** Componentes React son testeables con Vitest + Testing Library
- **Negativo:** Requiere Node.js ≥ 18 en el entorno de desarrollo
- **Negativo:** Más archivos de configuración que vanilla HTML (mitigado por la consistencia ganada)

---

## ADR-009 — Catálogo de productos por tienda

### Contexto
El documento asigna al administrador de tienda la gestión del maestro de productos
y precios de *su* tienda (Tabla 1, CU-05) y exige que el código de barras sea único
dentro de la misma tienda (RN-08).

### Decisión
Cada producto pertenece a una tienda (`productos.sede_id`). La unicidad se refuerza
en la base de datos con el índice único compuesto `(sede_id, codigo_barras)`, además
de la validación en el servicio (defensa en profundidad, sección 7.3). Las categorías
siguen siendo un parámetro global definido por el administrador general.

### Consecuencias
- El mismo código puede existir en tiendas distintas con precios distintos.
- Al crear un producto se crea su fila de inventario con stock 0: las existencias
  solo las registra el auxiliar de bodega (RN-05).

---

## ADR-010 — Tienda activa con el header `X-Store-ID`

### Contexto
El administrador general elige en un selector la tienda que quiere administrar;
el resto de roles queda fijo en su tienda asignada (RN-04).

### Decisión
El cliente envía la tienda activa en el header `X-Store-ID`. El middleware
`StoreScope` resuelve el alcance de cada petición:
- Administrador general: la tienda del header, o ninguna (vista consolidada).
- Resto de roles: siempre la tienda del JWT; si el header apunta a otra tienda
  responde **403** y el intento queda en la bitácora.

### Consecuencias
- Los controladores leen la tienda con `storeScope(c)` / `requireStore(c)` sin
  repetir reglas de autorización.
- El frontend guarda la tienda activa y aplica su color como color de marca.

---

## ADR-011 — Descuento de stock al pagar con UPDATE condicional

### Contexto
RN-02 exige descontar existencias solo cuando la venta pasa a "Pagado"; el flujo
A5 de CU-01 exige que dos cajas no puedan vender la última unidad a la vez.

### Decisión
Al agregar productos solo se **valida** el stock. Al cobrar, en una única
transacción ACID (RNF-07): se bloquea la venta (`SELECT … FOR UPDATE`), se
descuenta cada línea con
`UPDATE inventario SET stock_actual = stock_actual - q WHERE … AND stock_actual >= q`,
se registra el movimiento `descuento_venta`, se crea el pago y se cierra la venta.
Si alguna línea no se puede descontar, la transacción completa se revierte.

### Consecuencias
- El stock nunca queda negativo y una de dos ventas concurrentes se rechaza.
- Un reintento del cobro (A4) encuentra la venta ya pagada y no duplica el pago.

---

## ADR-012 — Anulación de ventas con movimientos inversos

Una venta pagada es inmutable (RN-10). La anulación la ejecutan los administradores
con un motivo obligatorio: la venta pasa a estado `anulado`, el pago se conserva y
cada línea genera un movimiento `anulacion_venta` que devuelve las unidades. Los
reportes de ventas excluyen las anuladas y muestran su conteo.

---

## ADR-013 — Alertas calculadas sobre el estado actual

Las alertas de stock mínimo, agotados, vencidos y por vencer (RN-11 / RF-09) se
calculan con una consulta sobre el inventario actual en lugar de guardarse en una
tabla. Así nunca quedan alertas "huérfanas": desaparecen en cuanto el auxiliar de
bodega repone o retira el producto. Además, el cobro de una venta devuelve las
alertas de stock mínimo que generó (CU-01, paso 8). La ventana de "por vencer" es
un parámetro global (`ExpiryWarningDays = 7`).

---

## ADR-014 — Bitácora de auditoría como middleware

Las rutas críticas se marcan con `middleware.Audited(accion, entidad)`, colocado
**antes** de `RequireRole`. El middleware `AuditTrail` registra al final de cada
petición: usuario, rol, tienda, acción, entidad, resultado (éxito / denegado /
fallido), IP y fecha. Cualquier respuesta 403 se registra aunque la ruta no esté
marcada, lo que cubre RN-04 y RN-06. Los controladores solo agregan el detalle
legible con `SetAuditDetail`. La tabla `auditoria` es de solo inserción.

---

## ADR-015 — Exportación XLSX sin dependencias externas

RF-12 pide exportar reportes en CSV o XLSX. El XLSX se genera con la librería
estándar de Go (`archive/zip` + SpreadsheetML mínimo, paquete `internal/export`):
encabezado en negrita, primera fila fija y celdas numéricas como números. Se evita
agregar una dependencia pesada para una sola hoja por reporte.

---

## ADR-016 — Turnos obligatorios para vender

CU-01 tiene como precondición que el cajero tenga un turno abierto. El administrador
de tienda programa turnos dentro del horario de operación 06:00–22:00 (RNF-03); el
empleado inicia el turno del día y lo cierra al terminar. Cada venta guarda el
`turno_id` (RN-09) y el cierre calcula el resumen de caja por medio de pago. No se
puede cerrar un turno con ventas abiertas.

---

## ADR-017 — Bootstrap 5.3 como sistema de diseño del frontend

### Contexto
Se pidió implementar la interfaz con **Bootstrap** y modernizarla. Mantener Tailwind y
Bootstrap a la vez genera conflictos de nombres (`.badge`, `.table`, `.container`) y dos
sistemas de estilos que mantener.

### Decisión
Migrar todo el frontend a **Bootstrap 5.3** (solo CSS, sin su JavaScript) y **Bootstrap Icons**:
- Los componentes interactivos (modales, menú de usuario, sidebar colapsable) se controlan
  con estado de React usando las clases de Bootstrap (`modal`, `dropdown-menu`, etc.).
- El **color de la tienda** reemplaza `--bs-primary` en tiempo de ejecución (`lib/theme.js`);
  `.btn-primary` y los focos de formulario se reescriben para usar ese color.
- **Modo claro y oscuro** con `data-bs-theme` (selector en el encabezado y en el login),
  recordado en `localStorage`.
- Paleta de tiendas en tonos medios (#16A34A, #2563EB, #DB2777…) legibles en ambos modos;
  la migración convierte los colores de la paleta anterior.

### Consecuencias
- **Positivo:** componentes estándar y documentados (cards, tablas, formularios, alerts),
  accesibles y responsivos; diseño consistente sin CSS propio extenso.
- **Positivo:** se elimina la configuración de Tailwind/PostCSS.
- **Negativo:** el CSS empaquetado es mayor (~47 KB gzip) porque se incluye Bootstrap completo;
  podría reducirse importando solo los módulos SCSS usados.
