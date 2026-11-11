package controllers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/services"
)

// ProductController maneja el catálogo de productos de cada tienda (RF-05 / CU-05).
type ProductController struct {
	service services.ProductService
}

func NewProductController(service services.ProductService) *ProductController {
	return &ProductController{service: service}
}

// productRequest es el DTO de entrada para crear/actualizar un producto.
// Los precios se reciben como enteros en pesos. ExpiryDate en formato
// YYYY-MM-DD (vacío = el producto no vence).
type productRequest struct {
	Barcode      string  `json:"barcode"       binding:"required"`
	Name         string  `json:"name"          binding:"required,min=1,max=150"`
	CategoryID   uint    `json:"category_id"   binding:"required"`
	Description  string  `json:"description"`
	Unit         string  `json:"unit"`
	PurchaseCost float64 `json:"purchase_cost"`
	SalePrice    float64 `json:"sale_price"`
	ExpiryDate   string  `json:"expiry_date"`
	MinStock     *int    `json:"min_stock"`
}

func (req *productRequest) apply(p *models.Product) error {
	fecha, err := parseOptionalDate(req.ExpiryDate)
	if err != nil {
		return err
	}
	p.CodigoBarras = strings.TrimSpace(req.Barcode)
	p.Nombre = req.Name
	p.CategoriaID = req.CategoryID
	p.Descripcion = req.Description
	p.UnidadMedida = models.UnidadMedida(strings.ToLower(strings.TrimSpace(req.Unit)))
	p.CostoCompra = req.PurchaseCost
	p.Precio = req.SalePrice
	p.FechaVencimiento = fecha
	return nil
}

// List retorna el catálogo de la tienda activa con existencias.
func (pc *ProductController) List(c *gin.Context) {
	products, err := pc.service.List(storeScope(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, products)
}

// GetByID retorna un producto por su ID (solo de la tienda del usuario).
func (pc *ProductController) GetByID(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	product, err := pc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if !ensureStoreAccess(c, product.SedeID) {
		return
	}
	c.JSON(http.StatusOK, product)
}

// ByBarcode consulta un producto por código de barras en la tienda activa
// (lector de código de barras — CU-01 / CU-04).
func (pc *ProductController) ByBarcode(c *gin.Context) {
	store, ok := requireStore(c)
	if !ok {
		return
	}
	product, err := pc.service.FindByBarcode(store, c.Param("code"))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, product)
}

// Create registra un producto en la tienda activa.
func (pc *ProductController) Create(c *gin.Context) {
	store, ok := requireStore(c)
	if !ok {
		return
	}
	var req productRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "código de barras, nombre y categoría son obligatorios"})
		return
	}
	product := &models.Product{SedeID: store}
	if err := req.apply(product); err != nil {
		respondError(c, err)
		return
	}
	minStock := 0
	if req.MinStock != nil {
		minStock = *req.MinStock
	}

	if err := pc.service.Create(product, minStock); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, product.ID)
	middleware.SetAuditDetail(c, "Producto creado: "+product.CodigoBarras+" "+product.Nombre)
	c.JSON(http.StatusCreated, gin.H{"message": "Producto registrado correctamente", "product": product})
}

// Update actualiza un producto de la tienda.
func (pc *ProductController) Update(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	product, err := pc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if !ensureStoreAccess(c, product.SedeID) {
		return
	}

	var req productRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "código de barras, nombre y categoría son obligatorios"})
		return
	}
	if err := req.apply(product); err != nil {
		respondError(c, err)
		return
	}
	product.Categoria = models.Category{}

	if err := pc.service.Update(product, req.MinStock); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, "Producto actualizado: "+product.CodigoBarras+" "+product.Nombre)
	c.JSON(http.StatusOK, gin.H{"message": "Producto actualizado correctamente", "product": product})
}

// UpdatePrice actualiza únicamente el precio de un producto (HU014 / RN-07).
func (pc *ProductController) UpdatePrice(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	product, err := pc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if !ensureStoreAccess(c, product.SedeID) {
		return
	}

	var req struct {
		Price float64 `json:"price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el precio es obligatorio"})
		return
	}
	if err := pc.service.UpdatePrice(id, req.Price); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, "Precio actualizado: "+product.Nombre)
	c.JSON(http.StatusOK, gin.H{"message": "Precio actualizado correctamente"})
}

// Delete realiza la eliminación lógica de un producto (HU016).
func (pc *ProductController) Delete(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	product, err := pc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if !ensureStoreAccess(c, product.SedeID) {
		return
	}
	if err := pc.service.Delete(id); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, "Producto retirado del catálogo: "+product.Nombre)
	c.JSON(http.StatusOK, gin.H{"message": "Producto retirado del catálogo"})
}
