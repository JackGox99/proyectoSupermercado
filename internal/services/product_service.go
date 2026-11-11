package services

import (
	"errors"
	"regexp"
	"strings"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"

	"gorm.io/gorm"
)

var barcodePattern = regexp.MustCompile(`^[0-9A-Za-z\-]{4,50}$`)

// ProductService define el contrato de lógica de negocio del catálogo de
// productos de cada tienda (RF-05 / CU-05).
type ProductService interface {
	// List retorna el catálogo con existencias; venueID nil = todas las tiendas.
	List(venueID *uint) ([]repository.ProductWithStock, error)
	GetByID(id uint) (*models.Product, error)
	// FindByBarcode busca un producto activo de la tienda por código (CU-01 / CU-04).
	FindByBarcode(venueID uint, code string) (*models.Product, error)
	ListByCategory(categoryID uint) ([]models.Product, error)
	// Create registra el producto en la tienda y crea su fila de inventario con
	// stock 0. Las existencias solo las carga el auxiliar de bodega (RN-05).
	Create(p *models.Product, stockMinimo int) error
	// Update modifica el producto; stockMinimo nil = no cambiar el mínimo.
	Update(p *models.Product, stockMinimo *int) error
	UpdatePrice(id uint, price float64) error // HU014
	Delete(id uint) error
}

type productService struct {
	repo         repository.ProductRepository
	categoryRepo repository.CategoryRepository
}

func NewProductService(
	repo repository.ProductRepository,
	categoryRepo repository.CategoryRepository,
) ProductService {
	return &productService{repo: repo, categoryRepo: categoryRepo}
}

func (s *productService) List(venueID *uint) ([]repository.ProductWithStock, error) {
	return s.repo.FindAll(venueID)
}

func (s *productService) GetByID(id uint) (*models.Product, error) {
	return s.repo.FindByID(id)
}

func (s *productService) FindByBarcode(venueID uint, code string) (*models.Product, error) {
	p, err := s.repo.FindByBarcode(venueID, strings.TrimSpace(code))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	if !p.Activo {
		return nil, ErrProductNotFound
	}
	return p, nil
}

func (s *productService) ListByCategory(categoryID uint) ([]models.Product, error) {
	return s.repo.FindByCategoryID(categoryID)
}

// validatePricing aplica las reglas de negocio sobre los precios del producto:
//   - RN-07: el precio de venta debe ser mayor que cero (entero en pesos).
//   - El costo de compra es un entero positivo y menor al precio de venta
//     (el supermercado no vende a pérdida).
func validatePricing(costoCompra, precioVenta float64) error {
	if precioVenta <= 0 || precioVenta != float64(int(precioVenta)) {
		return ErrInvalidPrice
	}
	if costoCompra <= 0 || costoCompra != float64(int(costoCompra)) {
		return ErrInvalidPurchaseCost
	}
	if costoCompra >= precioVenta {
		return ErrPurchaseExceedsSale
	}
	return nil
}

// validate aplica las validaciones comunes a creación y edición.
func (s *productService) validate(p *models.Product) error {
	p.Nombre = strings.TrimSpace(p.Nombre)
	p.CodigoBarras = strings.TrimSpace(p.CodigoBarras)
	if p.Nombre == "" {
		return ErrProductNameRequired
	}
	if !barcodePattern.MatchString(p.CodigoBarras) {
		return ErrBarcodeRequired
	}
	if p.UnidadMedida == "" {
		p.UnidadMedida = models.UnidadUnidad
	}
	if !models.ValidUnidad(p.UnidadMedida) {
		return ErrInvalidUnit
	}
	if err := validatePricing(p.CostoCompra, p.Precio); err != nil {
		return err
	}

	if _, err := s.categoryRepo.FindByID(p.CategoriaID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrCategoryNotFound
		}
		return err
	}

	// RN-08: código de barras único dentro de la misma tienda.
	if existing, err := s.repo.FindByBarcode(p.SedeID, p.CodigoBarras); err == nil && existing.ID != p.ID {
		return &BarcodeTakenError{ExistingID: existing.ID}
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	// Nombre único entre los productos activos de la tienda.
	if existing, err := s.repo.FindByName(p.SedeID, p.Nombre); err == nil && existing.ID != p.ID {
		return ErrProductNameTaken
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return nil
}

func (s *productService) Create(p *models.Product, stockMinimo int) error {
	if p.SedeID == 0 {
		return ErrStoreRequired
	}
	if stockMinimo < 0 {
		return ErrInvalidStockMinimum
	}
	p.ID = 0
	p.Activo = true
	if err := s.validate(p); err != nil {
		return err
	}
	return s.repo.CreateWithInventory(p, stockMinimo)
}

func (s *productService) Update(p *models.Product, stockMinimo *int) error {
	if stockMinimo != nil && *stockMinimo < 0 {
		return ErrInvalidStockMinimum
	}
	if err := s.validate(p); err != nil {
		return err
	}
	return s.repo.UpdateWithMinimum(p, stockMinimo)
}

// UpdatePrice actualiza únicamente el precio de venta de un producto (HU014).
// RN-07: el precio debe ser mayor que cero; además debe superar el costo.
func (s *productService) UpdatePrice(id uint, price float64) error {
	if price <= 0 || price != float64(int(price)) {
		return ErrInvalidPrice
	}

	product, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}

	if product.CostoCompra > 0 && price <= product.CostoCompra {
		return ErrPurchaseExceedsSale
	}

	product.Precio = price
	return s.repo.Update(product)
}

func (s *productService) Delete(id uint) error {
	return s.repo.Delete(id)
}
