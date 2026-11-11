package services

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/algorithms"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
)

// Tipos de ajuste de inventario aceptados por la API (CU-03).
const (
	AjusteAveria     = "averia"      // producto dañado: retira unidades
	AjusteVencimient = "vencimiento" // producto vencido: retira unidades
	AjusteDevolucion = "devolucion"  // devolución: suma (cliente) o resta (a proveedor)
	AjusteCorreccion = "correccion"  // corrección de conteo físico: suma o resta
)

// InventoryService define el contrato de lógica de negocio para inventario.
// Las operaciones de escritura (entradas y ajustes) solo las ejecuta el
// auxiliar de bodega (RN-05); la restricción se aplica en las rutas.
type InventoryService interface {
	// List retorna el inventario; venueID nil = todas las tiendas (HU017).
	List(venueID *uint) ([]models.Inventory, error)
	// AddStock registra una entrada de mercancía (CU-02 / HU018).
	AddStock(venueID, productID uint, quantity int, motivo string, userID uint) (*models.Inventory, error)
	// Adjust corrige existencias por avería, devolución, vencimiento o
	// corrección de conteo (CU-03). quantity lleva signo para devolución y
	// corrección; para avería y vencimiento es la cantidad a retirar.
	Adjust(venueID, productID uint, tipo string, quantity int, motivo string, userID uint) (*models.Inventory, error)
	// ListMovements retorna el historial de movimientos (HU020 / trazabilidad).
	ListMovements(f repository.MovementFilter) ([]models.InventoryMovement, error)
	// SearchByProductName busca un ítem de inventario por nombre exacto de producto
	// usando MergeSort + BinarySearch (ver algorithms/mergesort.go y binarysearch.go).
	// El parámetro algo selecciona la variante: "iterative" o "recursive".
	// Retorna gorm.ErrRecordNotFound si no existe ningún ítem con ese nombre en la tienda.
	SearchByProductName(venueID uint, name string, algo string) (*models.Inventory, error)
}

// Constantes para las variantes de binary search expuestas a controllers / API.
const (
	AlgoIterative = "iterative"
	AlgoRecursive = "recursive"
)

type inventoryService struct {
	repo repository.InventoryRepository
}

func NewInventoryService(repo repository.InventoryRepository) InventoryService {
	return &inventoryService{repo: repo}
}

func (s *inventoryService) List(venueID *uint) ([]models.Inventory, error) {
	return s.repo.FindAll(venueID)
}

func (s *inventoryService) ListMovements(f repository.MovementFilter) ([]models.InventoryMovement, error) {
	return s.repo.FindMovements(f)
}

// SearchByProductName busca un ítem de inventario por nombre de producto usando
// MergeSort + BinarySearch (variante seleccionable):
//  1. Obtiene todo el inventario de la tienda (O(n) en BD).
//  2. Ordena el slice por nombre de producto con MergeSort (O(n log n)).
//  3. Aplica binary search sobre el slice ordenado (O(log n)).
func (s *inventoryService) SearchByProductName(venueID uint, name string, algo string) (*models.Inventory, error) {
	items, err := s.repo.FindAll(&venueID)
	if err != nil {
		return nil, err
	}

	sorted := algorithms.MergeSort(items, func(a, b models.Inventory) bool {
		return strings.ToLower(a.Producto.Nombre) < strings.ToLower(b.Producto.Nombre)
	})

	keyFn := func(inv models.Inventory) string { return inv.Producto.Nombre }
	var idx int
	if algo == AlgoIterative {
		idx = algorithms.BinarySearchIterative(sorted, name, keyFn)
	} else {
		idx = algorithms.BinarySearchRecursive(sorted, name, keyFn)
	}
	if idx == -1 {
		return nil, gorm.ErrRecordNotFound
	}
	return &sorted[idx], nil
}

// AddStock valida los campos y delega al repositorio la suma atómica.
func (s *inventoryService) AddStock(venueID, productID uint, quantity int, motivo string, userID uint) (*models.Inventory, error) {
	if venueID == 0 {
		return nil, ErrStoreRequired
	}
	if productID == 0 {
		return nil, ErrProductNotFound
	}
	if quantity <= 0 {
		return nil, ErrInvalidQuantity
	}
	motivo = strings.TrimSpace(motivo)
	if motivo == "" {
		motivo = "Entrada de mercancía"
	}
	return mapInventoryErr(s.repo.ApplyMovement(venueID, productID, quantity, models.TipoEntrada, motivo, userID))
}

func (s *inventoryService) Adjust(venueID, productID uint, tipo string, quantity int, motivo string, userID uint) (*models.Inventory, error) {
	if venueID == 0 {
		return nil, ErrStoreRequired
	}
	if productID == 0 {
		return nil, ErrProductNotFound
	}
	if quantity == 0 {
		return nil, ErrInvalidQuantity
	}
	motivo = strings.TrimSpace(motivo)
	if motivo == "" {
		return nil, ErrReasonRequired
	}

	var (
		delta int
		mt    models.TipoMovimiento
	)
	switch tipo {
	case AjusteAveria, AjusteVencimient:
		// Siempre retiran unidades: se acepta la cantidad en valor absoluto.
		if quantity < 0 {
			quantity = -quantity
		}
		delta = -quantity
		mt = models.TipoAjusteAveria
		if tipo == AjusteVencimient {
			mt = models.TipoAjusteVencimiento
		}
	case AjusteDevolucion:
		delta, mt = quantity, models.TipoAjusteDevolucion
	case AjusteCorreccion:
		delta, mt = quantity, models.TipoAjusteManual
	default:
		return nil, ErrInvalidAdjustment
	}

	return mapInventoryErr(s.repo.ApplyMovement(venueID, productID, delta, mt, motivo, userID))
}

func mapInventoryErr(inv *models.Inventory, err error) (*models.Inventory, error) {
	switch {
	case err == nil:
		return inv, nil
	case errors.Is(err, repository.ErrProductNotFound):
		return nil, ErrProductNotFound
	case errors.Is(err, repository.ErrNegativeStock):
		return nil, ErrNegativeStock
	default:
		return nil, err
	}
}
