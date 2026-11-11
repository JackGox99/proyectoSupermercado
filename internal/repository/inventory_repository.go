package repository

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"supermercado-inventory-api/internal/models"
)

var (
	// ErrProductNotFound se retorna cuando el producto no existe, fue
	// desactivado o no pertenece a la tienda de la operación.
	ErrProductNotFound = errors.New("product not found")
	// ErrNegativeStock se retorna cuando una operación dejaría el stock en
	// negativo (restricción de datos: el stock nunca puede ser negativo).
	ErrNegativeStock = errors.New("stock cannot be negative")
)

// MovementFilter filtra el historial de movimientos de inventario.
type MovementFilter struct {
	VenueID       *uint  // nil = todas las tiendas (admin general)
	ProductSearch string // LIKE sobre nombre o código de barras
	Tipo          string // "" = todos los tipos
}

// InventoryRepository define el contrato de acceso a datos para inventario.
type InventoryRepository interface {
	// FindAll retorna el inventario de productos activos; venueID nil = todas las tiendas.
	FindAll(venueID *uint) ([]models.Inventory, error)
	FindByID(id uint) (*models.Inventory, error)
	FindByVenueAndProduct(venueID, productID uint) (*models.Inventory, error)
	// ApplyMovement suma `delta` (con signo) al stock del producto en la tienda
	// y registra el movimiento de inventario en una única transacción con
	// bloqueo de fila. Rechaza la operación si el stock resultante es negativo
	// o si el producto no pertenece a la tienda.
	ApplyMovement(venueID, productID uint, delta int, tipo models.TipoMovimiento, motivo string, userID uint) (*models.Inventory, error)
	// FindMovements retorna el historial de movimientos, más reciente primero.
	FindMovements(f MovementFilter) ([]models.InventoryMovement, error)
}

type inventoryRepository struct {
	db *gorm.DB
}

func NewInventoryRepository(db *gorm.DB) InventoryRepository {
	return &inventoryRepository{db: db}
}

// FindAll retorna inventario solo de productos activos (HU016).
func (r *inventoryRepository) FindAll(venueID *uint) ([]models.Inventory, error) {
	var items []models.Inventory
	q := r.db.
		Joins("JOIN productos ON productos.id = inventario.producto_id AND productos.activo = ?", true).
		Preload("Sede").Preload("Producto").Preload("Producto.Categoria").
		Order("productos.nombre ASC")
	if venueID != nil {
		q = q.Where("inventario.sede_id = ?", *venueID)
	}
	return items, q.Find(&items).Error
}

func (r *inventoryRepository) FindByID(id uint) (*models.Inventory, error) {
	var item models.Inventory
	return &item, r.db.Preload("Sede").Preload("Producto").Preload("Producto.Categoria").First(&item, id).Error
}

// FindByVenueAndProduct busca el stock de un producto en una tienda.
// Retorna (nil, nil) si no existe registro, lo que equivale a stock = 0.
func (r *inventoryRepository) FindByVenueAndProduct(venueID, productID uint) (*models.Inventory, error) {
	var item models.Inventory
	err := r.db.
		Where("sede_id = ? AND producto_id = ?", venueID, productID).
		Preload("Producto").
		First(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &item, err
}

func (r *inventoryRepository) ApplyMovement(venueID, productID uint, delta int, tipo models.TipoMovimiento, motivo string, userID uint) (*models.Inventory, error) {
	var inv models.Inventory

	err := r.db.Transaction(func(tx *gorm.DB) error {
		// 1) El producto debe existir, estar activo y pertenecer a la tienda.
		var prod models.Product
		if err := tx.Select("id", "activo", "sede_id").First(&prod, productID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrProductNotFound
			}
			return err
		}
		if !prod.Activo || prod.SedeID != venueID {
			return ErrProductNotFound
		}

		// 2) Bloquear (o crear) la fila de inventario para evitar carreras.
		res := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("sede_id = ? AND producto_id = ?", venueID, productID).
			First(&inv)
		if res.Error != nil {
			if !errors.Is(res.Error, gorm.ErrRecordNotFound) {
				return res.Error
			}
			inv = models.Inventory{SedeID: venueID, ProductoID: productID}
			if err := tx.Create(&inv).Error; err != nil {
				return err
			}
		}

		if inv.StockActual+delta < 0 {
			return ErrNegativeStock
		}
		inv.StockActual += delta
		if err := tx.Model(&models.Inventory{}).Where("id = ?", inv.ID).
			Update("stock_actual", inv.StockActual).Error; err != nil {
			return err
		}

		// 3) Registrar el movimiento para trazabilidad (quién, qué, cuándo).
		mov := models.InventoryMovement{
			InventarioID: inv.ID,
			UsuarioID:    userID,
			Tipo:         tipo,
			Cantidad:     delta,
			StockFinal:   inv.StockActual,
			Motivo:       motivo,
		}
		return tx.Create(&mov).Error
	})
	if err != nil {
		return nil, err
	}

	// Recargar con relaciones para la respuesta del endpoint.
	if err := r.db.Preload("Producto").Preload("Producto.Categoria").Preload("Sede").First(&inv, inv.ID).Error; err != nil {
		return nil, err
	}
	return &inv, nil
}

// FindMovements retorna el historial de movimientos (HU020 / trazabilidad).
func (r *inventoryRepository) FindMovements(f MovementFilter) ([]models.InventoryMovement, error) {
	var movements []models.InventoryMovement

	q := r.db.
		Joins("JOIN inventario ON inventario.id = movimientos_inventario.inventario_id").
		Preload("Usuario").
		Preload("Inventario.Producto").
		Preload("Inventario.Sede")

	if f.VenueID != nil {
		q = q.Where("inventario.sede_id = ?", *f.VenueID)
	}
	if f.Tipo != "" {
		q = q.Where("movimientos_inventario.tipo = ?", f.Tipo)
	}
	if f.ProductSearch != "" {
		like := "%" + f.ProductSearch + "%"
		q = q.
			Joins("JOIN productos ON productos.id = inventario.producto_id").
			Where("(LOWER(productos.nombre) LIKE LOWER(?) OR productos.codigo_barras LIKE ?)", like, like)
	}

	return movements, q.Order("movimientos_inventario.fecha DESC, movimientos_inventario.id DESC").
		Limit(500).Find(&movements).Error
}
