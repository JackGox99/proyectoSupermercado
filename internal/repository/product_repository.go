package repository

import (
	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
)

// ProductWithStock es un producto del catálogo junto con sus existencias en la
// tienda (RF-05: el catálogo incluye stock actual y stock mínimo).
type ProductWithStock struct {
	models.Product
	InventarioID uint `json:"inventario_id"`
	StockActual  int  `json:"stock_actual"`
	StockMinimo  int  `json:"stock_minimo"`
}

// ProductRepository define el contrato de acceso a datos para productos.
type ProductRepository interface {
	// FindAll retorna los productos activos; venueID nil = todas las tiendas.
	FindAll(venueID *uint) ([]ProductWithStock, error)
	FindByID(id uint) (*models.Product, error)
	FindByName(venueID uint, name string) (*models.Product, error)
	// FindByBarcode busca un producto activo por código de barras en una tienda (RN-08 / CU-01).
	FindByBarcode(venueID uint, code string) (*models.Product, error)
	FindByCategoryID(categoryID uint) ([]models.Product, error)
	// CreateWithInventory persiste el producto y su fila de inventario (stock 0)
	// en una sola transacción.
	CreateWithInventory(p *models.Product, stockMinimo int) error
	// UpdateWithMinimum actualiza el producto y, si se indica, el stock mínimo.
	UpdateWithMinimum(p *models.Product, stockMinimo *int) error
	Update(p *models.Product) error
	Delete(id uint) error
}

type productRepository struct {
	db *gorm.DB
}

func NewProductRepository(db *gorm.DB) ProductRepository {
	return &productRepository{db: db}
}

// FindByName busca un producto activo por nombre dentro de la tienda (HU016:
// ignora inactivos para permitir reutilizar nombres tras la eliminación lógica).
func (r *productRepository) FindByName(venueID uint, name string) (*models.Product, error) {
	var product models.Product
	return &product, r.db.Where("sede_id = ? AND nombre = ? AND activo = ?", venueID, name, true).First(&product).Error
}

// FindByBarcode busca cualquier producto (activo o no) con ese código en la
// tienda. La unicidad del código aplica también a productos inactivos porque
// el índice único de la base de datos no distingue el estado.
func (r *productRepository) FindByBarcode(venueID uint, code string) (*models.Product, error) {
	var product models.Product
	return &product, r.db.Preload("Categoria").
		Where("sede_id = ? AND codigo_barras = ?", venueID, code).
		First(&product).Error
}

// FindAll retorna solo productos activos (HU016) con sus existencias.
func (r *productRepository) FindAll(venueID *uint) ([]ProductWithStock, error) {
	var products []models.Product
	q := r.db.Preload("Categoria").Preload("Sede").Where("activo = ?", true).Order("nombre ASC")
	if venueID != nil {
		q = q.Where("sede_id = ?", *venueID)
	}
	if err := q.Find(&products).Error; err != nil {
		return nil, err
	}

	ids := make([]uint, len(products))
	for i, p := range products {
		ids[i] = p.ID
	}
	var invs []models.Inventory
	if len(ids) > 0 {
		if err := r.db.Where("producto_id IN ?", ids).Find(&invs).Error; err != nil {
			return nil, err
		}
	}
	// Como cada producto pertenece a una sola tienda, hay a lo sumo una fila
	// de inventario relevante por producto (la de su propia tienda).
	byProduct := make(map[uint]models.Inventory, len(invs))
	for _, inv := range invs {
		byProduct[inv.ProductoID] = inv
	}

	out := make([]ProductWithStock, len(products))
	for i, p := range products {
		out[i] = ProductWithStock{Product: p}
		if inv, ok := byProduct[p.ID]; ok && inv.SedeID == p.SedeID {
			out[i].InventarioID = inv.ID
			out[i].StockActual = inv.StockActual
			out[i].StockMinimo = inv.StockMinimo
		}
	}
	return out, nil
}

// FindByID retorna cualquier producto (activo o inactivo) para preservar
// integridad de reportes históricos (HU016).
func (r *productRepository) FindByID(id uint) (*models.Product, error) {
	var product models.Product
	return &product, r.db.Preload("Categoria").First(&product, id).Error
}

// FindByCategoryID retorna solo productos activos de la categoría (HU016).
func (r *productRepository) FindByCategoryID(categoryID uint) ([]models.Product, error) {
	var products []models.Product
	return products, r.db.Where("categoria_id = ? AND activo = ?", categoryID, true).Find(&products).Error
}

func (r *productRepository) CreateWithInventory(p *models.Product, stockMinimo int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(p).Error; err != nil {
			return err
		}
		inv := models.Inventory{SedeID: p.SedeID, ProductoID: p.ID, StockActual: 0, StockMinimo: stockMinimo}
		return tx.Create(&inv).Error
	})
}

func (r *productRepository) UpdateWithMinimum(p *models.Product, stockMinimo *int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("Categoria", "Sede").Save(p).Error; err != nil {
			return err
		}
		if stockMinimo == nil {
			return nil
		}
		res := tx.Model(&models.Inventory{}).
			Where("sede_id = ? AND producto_id = ?", p.SedeID, p.ID).
			Update("stock_minimo", *stockMinimo)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			inv := models.Inventory{SedeID: p.SedeID, ProductoID: p.ID, StockMinimo: *stockMinimo}
			return tx.Create(&inv).Error
		}
		return nil
	})
}

func (r *productRepository) Update(p *models.Product) error {
	return r.db.Omit("Categoria", "Sede").Save(p).Error
}

// Delete realiza eliminación lógica marcando activo = false (HU016).
// Preserva integridad referencial con reportes históricos de ventas.
func (r *productRepository) Delete(id uint) error {
	return r.db.Model(&models.Product{}).Where("id = ?", id).Update("activo", false).Error
}
