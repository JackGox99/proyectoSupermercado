package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// InventoryController maneja existencias, entradas y ajustes de inventario.
type InventoryController struct {
	service services.InventoryService
}

func NewInventoryController(service services.InventoryService) *InventoryController {
	return &InventoryController{service: service}
}

// List retorna el inventario de la tienda activa (HU017 / CU-04).
// Con ?search= aplica la búsqueda binaria por nombre exacto (variante recursiva).
func (ic *InventoryController) List(c *gin.Context) {
	store := storeScope(c)
	if search := c.Query("search"); search != "" && store != nil {
		item, err := ic.service.SearchByProductName(*store, search, services.AlgoRecursive)
		if err != nil {
			c.JSON(http.StatusOK, []models.Inventory{})
			return
		}
		c.JSON(http.StatusOK, []models.Inventory{*item})
		return
	}
	items, err := ic.service.List(store)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// BinarySearch expone las dos variantes del algoritmo de búsqueda binaria
// (iterativa y recursiva) para uso didáctico desde la UI.
// Query params: name (requerido), algo = "iterative" | "recursive".
func (ic *InventoryController) BinarySearch(c *gin.Context) {
	store, ok := requireStore(c)
	if !ok {
		return
	}
	name := c.Query("name")
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el nombre es obligatorio"})
		return
	}
	algo := c.Query("algo")
	if algo != services.AlgoIterative && algo != services.AlgoRecursive {
		algo = services.AlgoRecursive
	}
	item, err := ic.service.SearchByProductName(store, name, algo)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"item": nil, "algo": algo, "found": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": item, "algo": algo, "found": true})
}

// ListMovements retorna el historial de movimientos de la tienda activa.
// Filtros: ?product= (nombre o código) y ?tipo= (tipo de movimiento).
func (ic *InventoryController) ListMovements(c *gin.Context) {
	movements, err := ic.service.ListMovements(repository.MovementFilter{
		VenueID:       storeScope(c),
		ProductSearch: c.Query("product"),
		Tipo:          c.Query("tipo"),
	})
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, movements)
}

// stockRequest es el DTO de entradas y ajustes. Quantity se recibe como
// json.Number para rechazar decimales con un mensaje claro (HU019).
type stockRequest struct {
	ProductID uint        `json:"product_id" binding:"required"`
	Quantity  json.Number `json:"quantity"   binding:"required"`
	Type      string      `json:"type"`
	Reason    string      `json:"reason"`
}

func (req stockRequest) integerQuantity(c *gin.Context) (int, bool) {
	q, err := req.Quantity.Int64()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Valor inválido. Ingrese un número entero (por ejemplo, 10)."})
		return 0, false
	}
	return int(q), true
}

// AddStock registra una entrada de mercancía (CU-02 / HU018).
// Solo el auxiliar de bodega puede ejecutarla (RN-05, aplicado en rutas).
func (ic *InventoryController) AddStock(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	store, ok := requireStore(c)
	if !ok {
		return
	}
	var req stockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "producto y cantidad son obligatorios"})
		return
	}
	qty, ok := req.integerQuantity(c)
	if !ok {
		return
	}

	inv, err := ic.service.AddStock(store, req.ProductID, qty, req.Reason, claims.UserID)
	if err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, inv.ID)
	middleware.SetAuditDetail(c, fmt.Sprintf("Entrada de %d unidad(es): %s (stock %d)", qty, inv.Producto.Nombre, inv.StockActual))
	c.JSON(http.StatusOK, gin.H{"message": "Entrada registrada correctamente", "inventory": inv})
}

// Adjust registra un ajuste por avería, devolución, vencimiento o corrección
// (CU-03). Solo el auxiliar de bodega puede ejecutarlo (RN-05).
func (ic *InventoryController) Adjust(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	store, ok := requireStore(c)
	if !ok {
		return
	}
	var req stockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "producto, cantidad, tipo y motivo son obligatorios"})
		return
	}
	qty, ok := req.integerQuantity(c)
	if !ok {
		return
	}

	inv, err := ic.service.Adjust(store, req.ProductID, req.Type, qty, req.Reason, claims.UserID)
	if err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, inv.ID)
	middleware.SetAuditDetail(c, fmt.Sprintf("Ajuste %s (%d): %s — %s (stock %d)", req.Type, qty, inv.Producto.Nombre, req.Reason, inv.StockActual))
	c.JSON(http.StatusOK, gin.H{"message": "Ajuste registrado correctamente", "inventory": inv})
}
