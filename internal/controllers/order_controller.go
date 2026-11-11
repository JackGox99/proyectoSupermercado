package controllers

import (
	"fmt"
	"math"
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/algorithms"
	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// OrderController maneja el registro de ventas (CU-01).
type OrderController struct {
	service services.OrderService
}

func NewOrderController(service services.OrderService) *OrderController {
	return &OrderController{service: service}
}

// List retorna las ventas de la tienda activa.
//   - Cajero: solo sus propias ventas.
//   - Administradores: todas las ventas de la tienda (o de todas, admin general).
//
// Filtro opcional ?estado=abierto|pagado|anulado.
func (oc *OrderController) List(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	f := repository.OrderFilter{VenueID: storeScope(c), Estado: c.Query("estado")}
	if claims.Rol == models.RolCajero {
		uid := claims.UserID
		f.UsuarioID = &uid
	}
	orders, err := oc.service.List(f)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, orders)
}

// GetByID retorna la venta con su detalle, pago y cajero. También sirve como
// comprobante de venta (RF-08).
func (oc *OrderController) GetByID(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	order, err := oc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if !ensureStoreAccess(c, order.SedeID) {
		return
	}
	c.JSON(http.StatusOK, order)
}

// Create abre una venta. Requiere rol cajero con turno abierto (RN-09).
func (oc *OrderController) Create(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	order, err := oc.service.Create(claims)
	if err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, order.ID)
	c.JSON(http.StatusCreated, order)
}

// Cancel elimina una venta abierta del cajero (no afecta inventario).
func (oc *OrderController) Cancel(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := oc.service.Cancel(claims, id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "venta cancelada"})
}

// AddItem agrega un producto a la venta por ID o por código de barras,
// validando existencias (RN-01) y vigencia (RN-03).
func (oc *OrderController) AddItem(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	orderID, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body struct {
		ProductoID uint   `json:"product_id"`
		Barcode    string `json:"barcode"`
		Cantidad   int    `json:"cantidad"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.ProductoID == 0 && body.Barcode == "") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "se requiere el producto (o código de barras) y la cantidad"})
		return
	}
	if body.Cantidad == 0 {
		body.Cantidad = 1
	}

	item, err := oc.service.AddItem(claims, orderID, body.ProductoID, body.Barcode, body.Cantidad)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

// RemoveItem elimina una línea de una venta abierta (HU024).
func (oc *OrderController) RemoveItem(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	orderID, ok := parseID(c, "id")
	if !ok {
		return
	}
	itemID, ok := parseID(c, "itemId")
	if !ok {
		return
	}
	if err := oc.service.RemoveItem(claims, orderID, itemID); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "producto retirado de la venta"})
}

// Finalize cobra la venta (HU025 / HU026 / CU-01 pasos 4-9): registra el pago
// y descuenta las existencias en una sola transacción. Responde con el pago,
// las alertas de stock mínimo generadas y, si es efectivo, el cambio.
func (oc *OrderController) Finalize(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	orderID, ok := parseID(c, "id")
	if !ok {
		return
	}

	var body struct {
		MetodoPago     models.MetodoPago `json:"metodo_pago"      binding:"required"`
		MontoEntregado float64           `json:"monto_entregado"` // opcional — solo efectivo
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el medio de pago es obligatorio"})
		return
	}

	result, err := oc.service.Finalize(claims, orderID, body.MetodoPago)
	if err != nil {
		respondError(c, err)
		return
	}
	payment := result.Payment
	middleware.SetAuditDetail(c, fmt.Sprintf("Venta #%d cobrada: $%.0f (%s)", orderID, payment.Total, payment.MetodoPago))

	resp := gin.H{
		"id":          payment.ID,
		"pedido_id":   payment.PedidoID,
		"total":       payment.Total,
		"metodo_pago": payment.MetodoPago,
		"fecha":       payment.Fecha,
		"alerts":      result.Alerts,
	}

	// Algoritmo Voraz — Cambio de Monedas con caja registradora (algorithms/coinchange.go):
	// si el pago es en efectivo y el cajero envió monto_entregado > total,
	// calcula el cambio con las denominaciones disponibles en la caja.
	if body.MetodoPago == models.MetodoEfectivo && body.MontoEntregado > payment.Total {
		cambioPesos := int(math.Round(body.MontoEntregado - payment.Total))
		resp["cambio"] = algorithms.CoinChangeFromRegister(algorithms.DefaultCashRegister, cambioPesos)
	}
	c.JSON(http.StatusOK, resp)
}

// Annul anula una venta pagada (RN-10). Solo administradores; requiere motivo.
// Genera movimientos inversos de inventario y queda registrada en la bitácora.
func (oc *OrderController) Annul(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var body struct {
		Motivo string `json:"motivo"`
	}
	_ = c.ShouldBindJSON(&body)

	if err := oc.service.Annul(claims, id, body.Motivo); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, fmt.Sprintf("Venta #%d anulada: %s", id, body.Motivo))
	order, err := oc.service.GetByID(id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "venta anulada"})
		return
	}
	c.JSON(http.StatusOK, order)
}
