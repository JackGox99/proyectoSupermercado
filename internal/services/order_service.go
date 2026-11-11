package services

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
)

// SaleResult es el resultado de cobrar una venta: el pago registrado y las
// alertas de stock mínimo que generó (CU-01, paso 8).
type SaleResult struct {
	Payment *models.Payment            `json:"payment"`
	Alerts  []repository.LowStockAlert `json:"alerts"`
}

// OrderService define la lógica de negocio del registro de ventas (CU-01).
//
// Flujo: el cajero, con su turno abierto, abre la venta → agrega productos
// (se valida existencia y vigencia, RN-01/RN-03) → cobra. Al cobrar se
// descuentan las existencias en la misma transacción del pago (RN-02,
// RF-07, RNF-07) y la venta queda asociada al cajero y a su turno (RN-09).
type OrderService interface {
	List(f repository.OrderFilter) ([]models.Order, error)
	GetByID(id uint) (*models.Order, error)
	// Create abre una venta para el cajero; requiere un turno abierto.
	Create(actor *TokenClaims) (*models.Order, error)
	// Cancel elimina una venta abierta del propio cajero (no afecta inventario).
	Cancel(actor *TokenClaims, orderID uint) error
	// AddItem agrega un producto por ID o por código de barras. Si el producto
	// ya está en la venta, suma la cantidad a la línea existente.
	AddItem(actor *TokenClaims, orderID, productID uint, barcode string, quantity int) (*models.OrderItem, error)
	RemoveItem(actor *TokenClaims, orderID, itemID uint) error
	// Finalize cobra la venta: pago + descuento de stock en una transacción.
	Finalize(actor *TokenClaims, orderID uint, metodo models.MetodoPago) (*SaleResult, error)
	// Annul anula una venta pagada con movimientos inversos trazables (RN-10).
	Annul(actor *TokenClaims, orderID uint, motivo string) error
}

type orderService struct {
	repo          repository.OrderRepository
	inventoryRepo repository.InventoryRepository
	productRepo   repository.ProductRepository
	shiftRepo     repository.ShiftRepository
}

func NewOrderService(
	repo repository.OrderRepository,
	inventoryRepo repository.InventoryRepository,
	productRepo repository.ProductRepository,
	shiftRepo repository.ShiftRepository,
) OrderService {
	return &orderService{repo: repo, inventoryRepo: inventoryRepo, productRepo: productRepo, shiftRepo: shiftRepo}
}

func (s *orderService) List(f repository.OrderFilter) ([]models.Order, error) {
	return s.repo.FindAll(f)
}

func (s *orderService) GetByID(id uint) (*models.Order, error) {
	return s.repo.FindByID(id)
}

// openShift retorna el turno abierto del cajero en su tienda (RN-09).
func (s *orderService) openShift(actor *TokenClaims) (*models.Shift, error) {
	if actor.Rol != models.RolCajero || actor.SedeID == nil {
		return nil, ErrForbiddenRole
	}
	shift, err := s.shiftRepo.FindOpenByUser(actor.UserID)
	if err != nil {
		return nil, err
	}
	if shift == nil || shift.SedeID != *actor.SedeID {
		return nil, ErrNoOpenShift
	}
	return shift, nil
}

// ownOpenOrder carga una venta abierta que pertenezca al cajero.
func (s *orderService) ownOpenOrder(actor *TokenClaims, orderID uint) (*models.Order, error) {
	order, err := s.repo.FindByID(orderID)
	if err != nil {
		return nil, err
	}
	if order.UsuarioID != actor.UserID {
		return nil, ErrOrderNotOwner
	}
	if order.Estado != models.EstadoAbierto {
		return nil, ErrOrderNotOpen
	}
	return order, nil
}

func (s *orderService) Create(actor *TokenClaims) (*models.Order, error) {
	shift, err := s.openShift(actor)
	if err != nil {
		return nil, err
	}
	order := &models.Order{
		SedeID:    *actor.SedeID,
		UsuarioID: actor.UserID,
		TurnoID:   &shift.ID,
		Estado:    models.EstadoAbierto,
	}
	if err := s.repo.Create(order); err != nil {
		return nil, err
	}
	return s.repo.FindByID(order.ID)
}

func (s *orderService) Cancel(actor *TokenClaims, orderID uint) error {
	if _, err := s.ownOpenOrder(actor, orderID); err != nil {
		return err
	}
	return s.repo.Delete(orderID)
}

func (s *orderService) AddItem(actor *TokenClaims, orderID, productID uint, barcode string, quantity int) (*models.OrderItem, error) {
	if quantity <= 0 {
		return nil, ErrInvalidItemQuantity
	}
	order, err := s.ownOpenOrder(actor, orderID)
	if err != nil {
		return nil, err
	}

	// Resolver el producto: por código de barras (lector) o por ID.
	var product *models.Product
	if code := strings.TrimSpace(barcode); code != "" {
		product, err = s.productRepo.FindByBarcode(order.SedeID, code)
	} else {
		product, err = s.productRepo.FindByID(productID)
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrProductNotFound
		}
		return nil, err
	}
	if !product.Activo || product.SedeID != order.SedeID {
		return nil, ErrProductNotFound
	}

	// RN-03: un producto vencido no puede venderse (A2).
	if product.IsExpired(time.Now()) {
		return nil, &ErrProductExpired{Producto: product.Nombre}
	}

	// Si el producto ya está en la venta, se acumula sobre la misma línea.
	var line *models.OrderItem
	for i := range order.Items {
		if order.Items[i].ProductoID == product.ID {
			line = &order.Items[i]
			break
		}
	}
	newQty := quantity
	if line != nil {
		newQty += line.Cantidad
	}

	// RN-01: no se puede vender más de lo disponible (A1). El descuento real
	// ocurre al pagar (RN-02); aquí solo se valida.
	inv, err := s.inventoryRepo.FindByVenueAndProduct(order.SedeID, product.ID)
	if err != nil {
		return nil, err
	}
	avail := 0
	if inv != nil {
		avail = inv.StockActual
	}
	if avail < newQty {
		alreadyInSale := newQty - quantity
		return nil, &ErrInsufficientStock{Producto: product.Nombre, Available: avail - alreadyInSale}
	}

	if line == nil {
		line = &models.OrderItem{
			PedidoID:       orderID,
			ProductoID:     product.ID,
			PrecioUnitario: product.Precio, // snapshot del precio vigente
		}
	}
	line.Cantidad = newQty
	if err := s.repo.SaveItem(line); err != nil {
		return nil, err
	}
	line.Producto = *product
	return line, nil
}

func (s *orderService) RemoveItem(actor *TokenClaims, orderID, itemID uint) error {
	if _, err := s.ownOpenOrder(actor, orderID); err != nil {
		return err
	}
	// RN-02: el stock no se tocó al agregar, así que no hay nada que restaurar.
	return s.repo.RemoveItem(orderID, itemID)
}

func (s *orderService) Finalize(actor *TokenClaims, orderID uint, metodo models.MetodoPago) (*SaleResult, error) {
	switch metodo {
	case models.MetodoEfectivo, models.MetodoTarjetaDebito, models.MetodoTarjetaCredito:
	default:
		return nil, ErrInvalidPaymentMethod
	}

	shift, err := s.openShift(actor)
	if err != nil {
		return nil, err
	}
	order, err := s.repo.FindByID(orderID)
	if err != nil {
		return nil, err
	}
	if order.UsuarioID != actor.UserID {
		return nil, ErrOrderNotOwner
	}

	payment := &models.Payment{UsuarioID: actor.UserID, MetodoPago: metodo}
	alerts, err := s.repo.FinalizeSale(orderID, payment, shift.ID, time.Now())
	if err != nil {
		var stockErr *repository.InsufficientStockError
		var expErr *repository.ExpiredProductError
		switch {
		case errors.Is(err, repository.ErrOrderAlreadyClosed):
			return nil, ErrOrderNotOpen
		case errors.Is(err, repository.ErrEmptyOrder):
			return nil, ErrEmptyOrder
		case errors.As(err, &stockErr):
			return nil, &ErrInsufficientStock{Producto: stockErr.Producto, Available: stockErr.Available}
		case errors.As(err, &expErr):
			return nil, &ErrProductExpired{Producto: expErr.Producto}
		}
		return nil, err
	}
	if alerts == nil {
		alerts = []repository.LowStockAlert{}
	}
	return &SaleResult{Payment: payment, Alerts: alerts}, nil
}

func (s *orderService) Annul(actor *TokenClaims, orderID uint, motivo string) error {
	motivo = strings.TrimSpace(motivo)
	if motivo == "" {
		return ErrVoidReasonRequired
	}
	order, err := s.repo.FindByID(orderID)
	if err != nil {
		return err
	}
	switch actor.Rol {
	case models.RolAdmin:
	case models.RolAdminTienda:
		if actor.SedeID == nil || *actor.SedeID != order.SedeID {
			return ErrForbiddenStore
		}
	default:
		return ErrForbiddenRole
	}

	err = s.repo.AnnulSale(orderID, actor.UserID, motivo)
	if errors.Is(err, repository.ErrOrderNotPaid) {
		return ErrOrderNotPaid
	}
	return err
}
