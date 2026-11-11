package repository

import (
	"time"

	"gorm.io/gorm"
)

// SalesFilter encapsula los filtros opcionales de los reportes por período (RF-12).
type SalesFilter struct {
	VenueID *uint
	From    *time.Time
	To      *time.Time
}

// SalesReportRow representa una línea del reporte: un ítem vendido en una venta pagada.
type SalesReportRow struct {
	Fecha           time.Time `json:"fecha"`
	OrderID         uint      `json:"order_id"`
	ProductoID      uint      `json:"producto_id"`
	CodigoBarras    string    `json:"codigo_barras"`
	Producto        string    `json:"producto"`
	CantidadVendida int       `json:"cantidad_vendida"`
	PrecioVenta     float64   `json:"precio_venta"`
	CostoCompra     float64   `json:"costo_compra"`
	Ganancia        float64   `json:"ganancia"`
	Sede            string    `json:"sede"`
	Cajero          string    `json:"cajero"`
	TurnoID         *uint     `json:"turno_id"`
	MetodoPago      string    `json:"metodo_pago"`
}

// TopProduct resume las unidades totales vendidas de un producto en el período.
type TopProduct struct {
	ProductoID    uint   `json:"producto_id"`
	Nombre        string `json:"nombre"`
	TotalQuantity int    `json:"total_quantity"`
}

// ReportKPIs agrupa los indicadores clave del reporte de ventas.
type ReportKPIs struct {
	TotalRevenue     float64 `json:"total_revenue"`
	TransactionCount int64   `json:"transaction_count"`
	VoidedCount      int64   `json:"voided_count"`
}

// InventoryReportRow es una línea del reporte de inventario.
type InventoryReportRow struct {
	Sede             string     `json:"sede"`
	CodigoBarras     string     `json:"codigo_barras"`
	Producto         string     `json:"producto"`
	Categoria        string     `json:"categoria"`
	UnidadMedida     string     `json:"unidad_medida"`
	StockActual      int        `json:"stock_actual"`
	StockMinimo      int        `json:"stock_minimo"`
	CostoCompra      float64    `json:"costo_compra"`
	Precio           float64    `json:"precio"`
	ValorCosto       float64    `json:"valor_costo"`
	ValorVenta       float64    `json:"valor_venta"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento"`
	DiasRestantes    *int       `json:"dias_restantes"`
}

// StaffReportRow es una línea del reporte de personal.
type StaffReportRow struct {
	UsuarioID       uint       `json:"usuario_id"`
	Username        string     `json:"username"`
	Nombre          string     `json:"nombre"`
	Documento       string     `json:"documento"`
	Rol             string     `json:"rol"`
	Sede            string     `json:"sede"`
	Activo          bool       `json:"activo"`
	FechaIngreso    *time.Time `json:"fecha_ingreso"`
	TurnosAsignados int        `json:"turnos_asignados"`
	TurnosCerrados  int        `json:"turnos_cerrados"`
	Ventas          int        `json:"ventas"`
	TotalVentas     float64    `json:"total_ventas"`
}

// StoreOverview resume el estado de una tienda: alimenta el selector de
// tiendas del administrador general y el panel de cada tienda.
type StoreOverview struct {
	ID              uint    `json:"id"`
	Nombre          string  `json:"nombre"`
	Direccion       string  `json:"direccion"`
	Telefono        string  `json:"telefono"`
	Color           string  `json:"color"`
	Activa          bool    `json:"activa"`
	Productos       int     `json:"productos"`
	StockBajo       int     `json:"stock_bajo"`
	Vencidos        int     `json:"vencidos"`
	PorVencer       int     `json:"por_vencer"`
	VentasHoy       int     `json:"ventas_hoy"`
	TotalHoy        float64 `json:"total_hoy"`
	PedidosAbiertos int     `json:"pedidos_abiertos"`
	Personal        int     `json:"personal"`
	TurnosAbiertos  int     `json:"turnos_abiertos"`
	ValorInventario float64 `json:"valor_inventario"`
}

// ReportRepository define las consultas de agregación para reportes.
type ReportRepository interface {
	GetRows(f SalesFilter) ([]SalesReportRow, error)
	GetKPIs(f SalesFilter) (ReportKPIs, error)
	GetTopProducts(f SalesFilter) ([]TopProduct, error)
	GetInventory(venueID *uint) ([]InventoryReportRow, error)
	GetStaff(f SalesFilter) ([]StaffReportRow, error)
	// GetStoreOverview resume cada tienda; venueID nil = todas.
	// expiryDays es la ventana para contar productos "por vencer".
	GetStoreOverview(venueID *uint, includeInactive bool, expiryDays int) ([]StoreOverview, error)
}

type reportRepository struct {
	db *gorm.DB
}

func NewReportRepository(db *gorm.DB) ReportRepository {
	return &reportRepository{db: db}
}

// buildWhere construye la cláusula WHERE + argumentos comunes a las consultas
// de ventas. Siempre filtra ventas en estado 'pagado' (las anuladas no cuentan).
func buildWhere(f SalesFilter) (string, []interface{}) {
	where := " WHERE p.estado = 'pagado'"
	var args []interface{}
	if f.VenueID != nil {
		where += " AND p.sede_id = ?"
		args = append(args, *f.VenueID)
	}
	if f.From != nil {
		where += " AND pag.fecha >= ?"
		args = append(args, *f.From)
	}
	if f.To != nil {
		where += " AND pag.fecha <= ?"
		args = append(args, *f.To)
	}
	return where, args
}

// GetRows retorna el detalle línea a línea: un registro por ítem en cada venta pagada.
func (r *reportRepository) GetRows(f SalesFilter) ([]SalesReportRow, error) {
	where, args := buildWhere(f)
	sql := `
SELECT
    pag.fecha,
    p.id                                                        AS order_id,
    prod.id                                                     AS producto_id,
    prod.codigo_barras,
    prod.nombre                                                 AS producto,
    pd.cantidad                                                 AS cantidad_vendida,
    pd.precio_unitario                                          AS precio_venta,
    prod.costo_compra,
    (pd.precio_unitario - prod.costo_compra) * pd.cantidad      AS ganancia,
    s.nombre                                                    AS sede,
    u.nombre                                                    AS cajero,
    p.turno_id,
    pag.metodo_pago
FROM pagos pag
JOIN pedidos p         ON p.id        = pag.pedido_id
JOIN pedido_detalle pd ON pd.pedido_id = p.id
JOIN productos prod    ON prod.id     = pd.producto_id
JOIN sedes s           ON s.id        = p.sede_id
JOIN usuarios u        ON u.id        = pag.usuario_id` +
		where + ` ORDER BY pag.fecha DESC`

	var rows []SalesReportRow
	return rows, r.db.Raw(sql, args...).Scan(&rows).Error
}

// GetKPIs calcula ingresos totales, conteo de transacciones y ventas anuladas.
func (r *reportRepository) GetKPIs(f SalesFilter) (ReportKPIs, error) {
	where, args := buildWhere(f)
	sql := `
SELECT
    COALESCE(SUM(pag.total), 0) AS total_revenue,
    COUNT(pag.id)               AS transaction_count
FROM pagos pag
JOIN pedidos p ON p.id = pag.pedido_id` + where

	var kpis ReportKPIs
	if err := r.db.Raw(sql, args...).Scan(&kpis).Error; err != nil {
		return kpis, err
	}

	voidWhere := " WHERE p.estado = 'anulado'"
	var voidArgs []interface{}
	if f.VenueID != nil {
		voidWhere += " AND p.sede_id = ?"
		voidArgs = append(voidArgs, *f.VenueID)
	}
	if f.From != nil {
		voidWhere += " AND p.anulado_at >= ?"
		voidArgs = append(voidArgs, *f.From)
	}
	if f.To != nil {
		voidWhere += " AND p.anulado_at <= ?"
		voidArgs = append(voidArgs, *f.To)
	}
	return kpis, r.db.Raw("SELECT COUNT(*) FROM pedidos p"+voidWhere, voidArgs...).Scan(&kpis.VoidedCount).Error
}

// GetTopProducts retorna los 10 productos más vendidos por cantidad de unidades.
func (r *reportRepository) GetTopProducts(f SalesFilter) ([]TopProduct, error) {
	where, args := buildWhere(f)
	sql := `
SELECT
    prod.id        AS producto_id,
    prod.nombre,
    SUM(pd.cantidad) AS total_quantity
FROM pedido_detalle pd
JOIN pedidos p      ON p.id      = pd.pedido_id
JOIN pagos pag      ON pag.pedido_id = p.id
JOIN productos prod ON prod.id   = pd.producto_id` +
		where + `
GROUP BY prod.id, prod.nombre
ORDER BY total_quantity DESC
LIMIT 10`

	var top []TopProduct
	return top, r.db.Raw(sql, args...).Scan(&top).Error
}

// GetInventory retorna el inventario valorizado de los productos activos.
func (r *reportRepository) GetInventory(venueID *uint) ([]InventoryReportRow, error) {
	where := " WHERE p.activo = 1"
	var args []interface{}
	if venueID != nil {
		where += " AND p.sede_id = ?"
		args = append(args, *venueID)
	}
	sql := `
SELECT
    s.nombre                                    AS sede,
    p.codigo_barras,
    p.nombre                                    AS producto,
    c.nombre                                    AS categoria,
    p.unidad_medida,
    COALESCE(i.stock_actual, 0)                 AS stock_actual,
    COALESCE(i.stock_minimo, 0)                 AS stock_minimo,
    p.costo_compra,
    p.precio,
    COALESCE(i.stock_actual, 0) * p.costo_compra AS valor_costo,
    COALESCE(i.stock_actual, 0) * p.precio       AS valor_venta,
    p.fecha_vencimiento,
    DATEDIFF(p.fecha_vencimiento, CURDATE())    AS dias_restantes
FROM productos p
JOIN sedes s      ON s.id = p.sede_id
JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN inventario i ON i.producto_id = p.id AND i.sede_id = p.sede_id` +
		where + ` ORDER BY s.nombre, c.nombre, p.nombre`

	var rows []InventoryReportRow
	return rows, r.db.Raw(sql, args...).Scan(&rows).Error
}

// GetStaff retorna el personal con su actividad (turnos y ventas) en el período.
func (r *reportRepository) GetStaff(f SalesFilter) ([]StaffReportRow, error) {
	// Fragmentos de período para turnos (por fecha) y ventas (por fecha de pago).
	shiftCond, saleCond := "", ""
	var shiftArgs, saleArgs []interface{}
	if f.From != nil {
		shiftCond += " AND t.fecha >= ?"
		shiftArgs = append(shiftArgs, f.From.Format("2006-01-02"))
		saleCond += " AND pg.fecha >= ?"
		saleArgs = append(saleArgs, *f.From)
	}
	if f.To != nil {
		shiftCond += " AND t.fecha <= ?"
		shiftArgs = append(shiftArgs, f.To.Format("2006-01-02"))
		saleCond += " AND pg.fecha <= ?"
		saleArgs = append(saleArgs, *f.To)
	}

	sql := `
SELECT
    u.id AS usuario_id, u.username, u.nombre, u.documento, u.rol,
    COALESCE(s.nombre, 'Todas') AS sede, u.activo, u.fecha_ingreso,
    (SELECT COUNT(*) FROM turnos t WHERE t.usuario_id = u.id` + shiftCond + `) AS turnos_asignados,
    (SELECT COUNT(*) FROM turnos t WHERE t.usuario_id = u.id AND t.estado = 'cerrado'` + shiftCond + `) AS turnos_cerrados,
    (SELECT COUNT(*) FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.usuario_id = u.id AND p.estado = 'pagado'` + saleCond + `) AS ventas,
    (SELECT COALESCE(SUM(pg.total), 0) FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id
        WHERE pg.usuario_id = u.id AND p.estado = 'pagado'` + saleCond + `) AS total_ventas
FROM usuarios u
LEFT JOIN sedes s ON s.id = u.sede_id`

	var args []interface{}
	args = append(args, shiftArgs...)
	args = append(args, shiftArgs...)
	args = append(args, saleArgs...)
	args = append(args, saleArgs...)
	if f.VenueID != nil {
		sql += " WHERE u.sede_id = ?"
		args = append(args, *f.VenueID)
	}
	sql += " ORDER BY sede, u.rol, u.nombre"

	var rows []StaffReportRow
	return rows, r.db.Raw(sql, args...).Scan(&rows).Error
}

func (r *reportRepository) GetStoreOverview(venueID *uint, includeInactive bool, expiryDays int) ([]StoreOverview, error) {
	sql := `
SELECT
    s.id, s.nombre, s.direccion, s.telefono, s.color, s.activa,
    (SELECT COUNT(*) FROM productos p WHERE p.sede_id = s.id AND p.activo = 1) AS productos,
    (SELECT COUNT(*) FROM inventario i JOIN productos p ON p.id = i.producto_id AND p.activo = 1
        WHERE i.sede_id = s.id AND i.stock_actual <= i.stock_minimo) AS stock_bajo,
    (SELECT COUNT(*) FROM productos p WHERE p.sede_id = s.id AND p.activo = 1
        AND p.fecha_vencimiento < CURDATE()) AS vencidos,
    (SELECT COUNT(*) FROM productos p WHERE p.sede_id = s.id AND p.activo = 1
        AND p.fecha_vencimiento BETWEEN CURDATE() AND CURDATE() + INTERVAL ? DAY) AS por_vencer,
    (SELECT COUNT(*) FROM pedidos o JOIN pagos pg ON pg.pedido_id = o.id
        WHERE o.sede_id = s.id AND o.estado = 'pagado' AND DATE(pg.fecha) = CURDATE()) AS ventas_hoy,
    (SELECT COALESCE(SUM(pg.total), 0) FROM pedidos o JOIN pagos pg ON pg.pedido_id = o.id
        WHERE o.sede_id = s.id AND o.estado = 'pagado' AND DATE(pg.fecha) = CURDATE()) AS total_hoy,
    (SELECT COUNT(*) FROM pedidos o WHERE o.sede_id = s.id AND o.estado = 'abierto') AS pedidos_abiertos,
    (SELECT COUNT(*) FROM usuarios u WHERE u.sede_id = s.id AND u.activo = 1) AS personal,
    (SELECT COUNT(*) FROM turnos t WHERE t.sede_id = s.id AND t.estado = 'abierto') AS turnos_abiertos,
    (SELECT COALESCE(SUM(i.stock_actual * p.costo_compra), 0) FROM inventario i
        JOIN productos p ON p.id = i.producto_id AND p.activo = 1 WHERE i.sede_id = s.id) AS valor_inventario
FROM sedes s
WHERE 1 = 1`
	args := []interface{}{expiryDays}
	if venueID != nil {
		sql += " AND s.id = ?"
		args = append(args, *venueID)
	}
	if !includeInactive {
		sql += " AND s.activa = 1"
	}
	sql += " ORDER BY s.nombre"

	var rows []StoreOverview
	return rows, r.db.Raw(sql, args...).Scan(&rows).Error
}
