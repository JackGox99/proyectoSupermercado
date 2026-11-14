// Package routes define los endpoints HTTP y los agrupa en recursos REST.
// Solo conoce qué URLs existen, qué roles pueden usarlas y a qué controller
// apuntan. No sabe cómo se construyen los controllers ni cómo se conecta la BD (SRP).
//
// Matriz de permisos (Tabla 1 del documento):
//
//	Recurso            | Admin general | Admin tienda | Cajero | Aux. bodega
//	-------------------+---------------+--------------+--------+------------
//	Tiendas (escribir) |      ✔        |              |        |
//	Categorías (esc.)  |      ✔        |              |        |
//	Usuarios/personal  |      ✔        | ✔ (su tienda)|        |
//	Productos (esc.)   |      ✔        |      ✔       |        |
//	Entradas/ajustes   |      ✔ (*)    |              |        |     ✔  (RN-05)
//	Registrar venta    |      ✔ (*)    |              |   ✔    |
//	Anular venta       |      ✔        |      ✔       |        |
//	Turnos (asignar)   |      ✔        |      ✔       |        |
//	Reportes/bitácora  |      ✔        | ✔ (su tienda)|        |
//	Consultar stock    |      ✔        |      ✔       |   ✔    |     ✔  (CU-04)
//
//	(*) Excepción decidida por el equipo (ADR-018): el administrador general
//	    puede ejecutar las operaciones de todos los roles en la tienda que tenga
//	    seleccionada. Sus ventas no se asocian a un turno.
package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/controllers"
	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
)

// Controllers agrupa todos los controllers del sistema.
type Controllers struct {
	Auth      *controllers.AuthController
	User      *controllers.UserController
	Profile   *controllers.ProfileController
	Venue     *controllers.VenueController
	Category  *controllers.CategoryController
	Product   *controllers.ProductController
	Inventory *controllers.InventoryController
	Order     *controllers.OrderController
	Shift     *controllers.ShiftController
	Alert     *controllers.AlertController
	Report    *controllers.ReportController
	Audit     *controllers.AuditController
}

// Register registra todas las rutas en el router.
// authMiddleware y auditMiddleware se reciben como parámetros (DIP).
func Register(r *gin.Engine, ctrl Controllers, authMiddleware, auditMiddleware gin.HandlerFunc) {
	// ── Health Check ──────────────────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Server is running"})
	})

	api := r.Group("/api/v1", auditMiddleware)
	audited := middleware.Audited
	role := middleware.RequireRole

	var (
		admin  = role(models.RolAdmin)
		admins = role(models.RolAdmin, models.RolAdminTienda)
		// El administrador general puede ejecutar también las operaciones de
		// cajero y de auxiliar de bodega (ADR-018).
		cashier     = role(models.RolCajero, models.RolAdmin)
		warehouse   = role(models.RolAuxiliarBodega, models.RolAdmin)
		salesViewer = role(models.RolAdmin, models.RolAdminTienda, models.RolCajero)
		stockViewer = role(models.RolAdmin, models.RolAdminTienda, models.RolAuxiliarBodega)
		shiftWorker = role(models.RolCajero, models.RolAuxiliarBodega)
	)

	// ── Auth (públicas) ───────────────────────────────────────────────────────
	auth := api.Group("/auth")
	{
		auth.POST("/login", audited("sesion.iniciar", "usuario"), ctrl.Auth.Login)
		auth.POST("/logout", ctrl.Auth.Logout)
	}

	// ── Rutas protegidas: JWT + alcance por tienda (RN-04) ────────────────────
	protected := api.Group("", authMiddleware, middleware.StoreScope())

	protected.GET("/dashboard", ctrl.Venue.Dashboard)

	profile := protected.Group("/profile")
	{
		profile.PUT("/password", audited("perfil.cambiar_password", "usuario"), ctrl.Profile.ChangePassword)
	}

	// Tiendas — RF-01 / CU-09 / RN-06: solo el administrador general escribe.
	venues := protected.Group("/venues")
	{
		venues.GET("", ctrl.Venue.List)
		venues.GET("/overview", admin, ctrl.Venue.Overview)
		venues.POST("", audited("tienda.crear", "tienda"), admin, ctrl.Venue.Create)
		venues.PUT("/:id", audited("tienda.configurar", "tienda"), admin, ctrl.Venue.Update)
		venues.PATCH("/:id/status", audited("tienda.estado", "tienda"), admin, ctrl.Venue.SetStatus)
	}

	// Usuarios y personal — RF-02 / RF-10 / CU-06.
	users := protected.Group("/users")
	{
		users.GET("", admins, ctrl.User.List)
		users.GET("/:id", admins, ctrl.User.GetByID)
		users.POST("", audited("usuario.crear", "usuario"), admins, ctrl.User.Create)
		users.PUT("/:id", audited("usuario.actualizar", "usuario"), admins, ctrl.User.Update)
		users.PATCH("/:id/deactivate", audited("usuario.inactivar", "usuario"), admins, ctrl.User.Deactivate)
		users.DELETE("/:id", audited("usuario.eliminar", "usuario"), admin, ctrl.User.Delete)
	}

	// Categorías — parámetro global definido por el administrador general.
	categories := protected.Group("/categories")
	{
		categories.GET("", ctrl.Category.List)
		categories.GET("/:id", ctrl.Category.GetByID)
		categories.POST("", audited("categoria.crear", "categoria"), admin, ctrl.Category.Create)
		categories.PUT("/:id", audited("categoria.actualizar", "categoria"), admin, ctrl.Category.Update)
		categories.DELETE("/:id", audited("categoria.eliminar", "categoria"), admin, ctrl.Category.Delete)
	}

	// Productos — RF-05 / CU-05: catálogo maestro de cada tienda.
	products := protected.Group("/products")
	{
		products.GET("", ctrl.Product.List)
		products.GET("/barcode/:code", ctrl.Product.ByBarcode) // lector de código de barras
		products.GET("/:id", ctrl.Product.GetByID)
		products.POST("", audited("producto.crear", "producto"), admins, ctrl.Product.Create)
		products.PUT("/:id", audited("producto.actualizar", "producto"), admins, ctrl.Product.Update)
		products.PATCH("/:id/price", audited("producto.precio", "producto"), admins, ctrl.Product.UpdatePrice)
		products.DELETE("/:id", audited("producto.eliminar", "producto"), admins, ctrl.Product.Delete)
	}

	// Inventario — consulta para todos (CU-04); entradas y ajustes solo el
	// auxiliar de bodega (RN-05, CU-02, CU-03).
	inventory := protected.Group("/inventory")
	{
		inventory.GET("", ctrl.Inventory.List)
		inventory.GET("/binary-search", ctrl.Inventory.BinarySearch)
		inventory.GET("/movements", stockViewer, ctrl.Inventory.ListMovements)
		inventory.POST("/add", audited("inventario.entrada", "inventario"), warehouse, ctrl.Inventory.AddStock)
		inventory.POST("/adjust", audited("inventario.ajuste", "inventario"), warehouse, ctrl.Inventory.Adjust)
	}

	// Alertas — RN-11 / RF-09.
	protected.GET("/alerts", ctrl.Alert.List)

	// Ventas — CU-01: el cajero registra y cobra; los administradores consultan
	// y anulan (RN-10).
	orders := protected.Group("/orders")
	{
		orders.GET("", salesViewer, ctrl.Order.List)
		orders.GET("/:id", salesViewer, ctrl.Order.GetByID)
		orders.POST("", audited("venta.abrir", "venta"), cashier, ctrl.Order.Create)
		orders.DELETE("/:id", audited("venta.cancelar", "venta"), cashier, ctrl.Order.Cancel)
		orders.POST("/:id/items", cashier, ctrl.Order.AddItem)
		orders.DELETE("/:id/items/:itemId", cashier, ctrl.Order.RemoveItem)
		orders.POST("/:id/pay", audited("venta.cobrar", "venta"), cashier, ctrl.Order.Finalize)
		orders.POST("/:id/finalize", audited("venta.cobrar", "venta"), cashier, ctrl.Order.Finalize)
		orders.POST("/:id/annul", audited("venta.anular", "venta"), admins, ctrl.Order.Annul)
	}

	// Turnos — RF-11 / CU-07 / RN-09.
	shifts := protected.Group("/shifts")
	{
		shifts.GET("", ctrl.Shift.List)
		shifts.GET("/current", ctrl.Shift.Current)
		shifts.POST("", audited("turno.asignar", "turno"), admins, ctrl.Shift.Assign)
		shifts.DELETE("/:id", audited("turno.eliminar", "turno"), admins, ctrl.Shift.Delete)
		shifts.POST("/:id/open", audited("turno.abrir", "turno"), shiftWorker, ctrl.Shift.Open)
		shifts.POST("/:id/close", audited("turno.cerrar", "turno"), ctrl.Shift.Close)
	}

	// Reportes — RF-12 / CU-08: ventas, inventario y personal en CSV o XLSX.
	reports := protected.Group("/reports", admins)
	{
		reports.GET("/sales", ctrl.Report.Sales)
		reports.GET("/sales/export", audited("reporte.exportar", "reporte"), ctrl.Report.SalesExport)
		reports.GET("/sales/csv", audited("reporte.exportar", "reporte"), ctrl.Report.SalesExport)
		reports.GET("/inventory", ctrl.Report.Inventory)
		reports.GET("/inventory/export", audited("reporte.exportar", "reporte"), ctrl.Report.InventoryExport)
		reports.GET("/staff", ctrl.Report.Staff)
		reports.GET("/staff/export", audited("reporte.exportar", "reporte"), ctrl.Report.StaffExport)
	}

	// Bitácora de auditoría — RF-13.
	protected.GET("/audit", admins, ctrl.Audit.List)
}
