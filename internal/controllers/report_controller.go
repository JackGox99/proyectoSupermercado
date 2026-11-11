package controllers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/export"
	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// ReportController expone los reportes consolidados de ventas, inventario y
// personal por período, exportables en CSV o XLSX (RF-12 / CU-08).
type ReportController struct {
	service services.ReportService
}

func NewReportController(service services.ReportService) *ReportController {
	return &ReportController{service: service}
}

// salesFilter arma el filtro con la tienda activa y el período ?from=&to=.
func salesFilter(c *gin.Context) repository.SalesFilter {
	from, to := parseDateRange(c)
	return repository.SalesFilter{VenueID: storeScope(c), From: from, To: to}
}

// ── JSON ────────────────────────────────────────────────────────────────────

func (rc *ReportController) Sales(c *gin.Context) {
	report, err := rc.service.GetSalesReport(salesFilter(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, report)
}

func (rc *ReportController) Inventory(c *gin.Context) {
	report, err := rc.service.GetInventoryReport(storeScope(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, report)
}

func (rc *ReportController) Staff(c *gin.Context) {
	report, err := rc.service.GetStaffReport(salesFilter(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, report)
}

// ── Exportación ─────────────────────────────────────────────────────────────

// send escribe la tabla en el formato pedido (?format=csv|xlsx, default csv).
func send(c *gin.Context, name string, t export.Table) {
	format := c.DefaultQuery("format", "csv")
	stamp := time.Now().Format("20060102_1504")
	middleware.SetAuditDetail(c, fmt.Sprintf("Exportación %s (%s, %d filas)", name, format, len(t.Rows)))

	switch format {
	case "xlsx":
		c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s.xlsx"`, name, stamp))
		if err := export.WriteXLSX(c.Writer, t); err != nil {
			respondError(c, err)
		}
	case "csv":
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s.csv"`, name, stamp))
		if err := export.WriteCSV(c.Writer, t); err != nil {
			respondError(c, err)
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "el formato debe ser csv o xlsx"})
	}
}

// SalesExport exporta el detalle de ventas del período.
func (rc *ReportController) SalesExport(c *gin.Context) {
	report, err := rc.service.GetSalesReport(salesFilter(c))
	if err != nil {
		respondError(c, err)
		return
	}
	t := export.Table{
		Sheet: "Ventas",
		Headers: []string{"Fecha", "Venta", "Código", "Producto", "Cantidad", "Precio venta",
			"Costo compra", "Ganancia", "Tienda", "Cajero", "Turno", "Método de pago"},
	}
	for _, r := range report.Rows {
		t.Rows = append(t.Rows, []interface{}{
			r.Fecha, r.OrderID, r.CodigoBarras, r.Producto, r.CantidadVendida, r.PrecioVenta,
			r.CostoCompra, r.Ganancia, r.Sede, r.Cajero, r.TurnoID, paymentMethodLabel(r.MetodoPago),
		})
	}
	send(c, "reporte_ventas", t)
}

// InventoryExport exporta el inventario valorizado.
func (rc *ReportController) InventoryExport(c *gin.Context) {
	report, err := rc.service.GetInventoryReport(storeScope(c))
	if err != nil {
		respondError(c, err)
		return
	}
	t := export.Table{
		Sheet: "Inventario",
		Headers: []string{"Tienda", "Código", "Producto", "Categoría", "Unidad", "Stock", "Stock mínimo",
			"Estado stock", "Costo", "Precio", "Valor a costo", "Valor a precio", "Vencimiento", "Estado vencimiento"},
	}
	for _, r := range report.Rows {
		t.Rows = append(t.Rows, []interface{}{
			r.Sede, r.CodigoBarras, r.Producto, r.Categoria, r.UnidadMedida, r.StockActual, r.StockMinimo,
			stockStatus(r.StockActual, r.StockMinimo), r.CostoCompra, r.Precio, r.ValorCosto, r.ValorVenta,
			r.FechaVencimiento, expiryStatus(r.DiasRestantes),
		})
	}
	send(c, "reporte_inventario", t)
}

// StaffExport exporta el personal con su actividad del período.
func (rc *ReportController) StaffExport(c *gin.Context) {
	report, err := rc.service.GetStaffReport(salesFilter(c))
	if err != nil {
		respondError(c, err)
		return
	}
	t := export.Table{
		Sheet: "Personal",
		Headers: []string{"Tienda", "Usuario", "Nombre", "Documento", "Cargo", "Estado", "Fecha ingreso",
			"Turnos asignados", "Turnos cerrados", "Ventas", "Total ventas"},
	}
	for _, r := range report.Rows {
		estado := "Activo"
		if !r.Activo {
			estado = "Inactivo"
		}
		t.Rows = append(t.Rows, []interface{}{
			r.Sede, r.Username, r.Nombre, r.Documento, roleLabel(r.Rol), estado, r.FechaIngreso,
			r.TurnosAsignados, r.TurnosCerrados, r.Ventas, r.TotalVentas,
		})
	}
	send(c, "reporte_personal", t)
}

func paymentMethodLabel(m string) string {
	switch m {
	case "efectivo":
		return "Efectivo"
	case "tarjeta_debito":
		return "Tarjeta débito"
	case "tarjeta_credito":
		return "Tarjeta crédito"
	}
	return m
}

func roleLabel(r string) string {
	switch r {
	case "admin":
		return "Administrador general"
	case "admin_tienda":
		return "Administrador de tienda"
	case "cajero":
		return "Cajero"
	case "auxiliar_bodega":
		return "Auxiliar de bodega"
	}
	return r
}

func stockStatus(actual, minimo int) string {
	switch {
	case actual <= 0:
		return "Agotado"
	case actual <= minimo:
		return "Stock mínimo"
	}
	return "OK"
}

func expiryStatus(days *int) string {
	switch {
	case days == nil:
		return "No vence"
	case *days < 0:
		return "Vencido — retirar"
	case *days <= services.ExpiryWarningDays:
		return fmt.Sprintf("Vence en %d día(s)", *days)
	}
	return "Vigente"
}
