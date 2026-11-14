package repository

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"supermercado-inventory-api/internal/models"
)

var (
	// ErrOrderAlreadyClosed se retorna cuando se intenta pagar una venta que ya
	// no está abierta. Protege contra reintentos duplicados (CU-01, A4).
	ErrOrderAlreadyClosed = errors.New("order is already closed")
	// ErrEmptyOrder se retorna al intentar pagar una venta sin productos.
	ErrEmptyOrder = errors.New("order has no items")
	// ErrOrderNotPaid se retorna al intentar anular una venta que no está pagada.
	ErrOrderNotPaid = errors.New("only paid sales can be voided")
)

// InsufficientStockError indica que, al momento del pago, un producto ya no
// tiene existencias suficientes (RN-01 / CU-01 A1 y A5).
type InsufficientStockError struct {
	Producto  string
	Available int
}

func (e *InsufficientStockError) Error() string {
	return fmt.Sprintf("insufficient stock for %s: only %d unit(s) available", e.Producto, e.Available)
}

// ExpiredProductError indica que un producto de la venta está vencido (RN-03).
type ExpiredProductError struct {
	Producto string
}

func (e *ExpiredProductError) Error() string {
	return fmt.Sprintf("%s is expired and cannot be sold; it must be withdrawn from the shelf", e.Producto)
}

// LowStockAlert describe un producto que quedó en o por debajo de su stock
// mínimo tras una venta (RN-11).
type LowStockAlert struct {
	ProductoID  uint   `json:"producto_id"`
	Producto    string `json:"producto"`
	StockActual int    `json:"stock_actual"`
	StockMinimo int    `json:"stock_minimo"`
}

// OrderFilter filtra el listado de ventas.
type OrderFilter struct {
	VenueID   *uint
	UsuarioID *uint
	Estado    string
}

// OrderRepository define el contrato de acceso a datos para ventas.
type OrderRepository interface {
	FindAll(f OrderFilter) ([]models.Order, error)
	FindByID(id uint) (*models.Order, error)
	Create(o *models.Order) error
	Delete(id uint) error
	// SaveItem crea o actualiza una línea de venta.
	SaveItem(item *models.OrderItem) error
	RemoveItem(orderID, itemID uint) error
	// CountOpenByShift cuenta las ventas abiertas asociadas a un turno.
	CountOpenByShift(turnoID uint) (int64, error)
	// FinalizeSale registra el pago y descuenta las existencias en una única
	// transacción ACID (RF-07 / RNF-07). Si cualquier paso falla no queda
	// ningún cambio parcial. Retorna las alertas de stock mínimo generadas.
	// turnoID es nil cuando cobra el administrador general (no tiene turnos).
	FinalizeSale(orderID uint, payment *models.Payment, turnoID *uint, today time.Time) ([]LowStockAlert, error)
	// AnnulSale anula una venta pagada generando movimientos inversos de
	// inventario trazables (RN-10).
	AnnulSale(orderID, userID uint, motivo string) error
}

type orderRepository struct {
	db *gorm.DB
}

func NewOrderRepository(db *gorm.DB) OrderRepository {
	return &orderRepository{db: db}
}

func (r *orderRepository) FindAll(f OrderFilter) ([]models.Order, error) {
	var orders []models.Order
	q := r.db.Preload("Sede").Preload("Usuario").Preload("Pago").Preload("Items").
		Order("created_at DESC").Limit(300)
	if f.VenueID != nil {
		q = q.Where("sede_id = ?", *f.VenueID)
	}
	if f.UsuarioID != nil {
		q = q.Where("usuario_id = ?", *f.UsuarioID)
	}
	if f.Estado != "" {
		q = q.Where("estado = ?", f.Estado)
	}
	return orders, q.Find(&orders).Error
}

func (r *orderRepository) FindByID(id uint) (*models.Order, error) {
	var order models.Order
	return &order, r.db.
		Preload("Sede").
		Preload("Usuario").
		Preload("Items.Producto").
		Preload("Pago").
		Preload("AnuladoPor").
		First(&order, id).Error
}

func (r *orderRepository) Create(o *models.Order) error {
	return r.db.Create(o).Error
}

// Delete elimina una venta abierta (cancelación antes del pago). Las líneas se
// borran explícitamente para no depender de ON DELETE CASCADE.
func (r *orderRepository) Delete(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("pedido_id = ?", id).Delete(&models.OrderItem{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Order{}, id).Error
	})
}

func (r *orderRepository) SaveItem(item *models.OrderItem) error {
	return r.db.Omit("Producto").Save(item).Error
}

func (r *orderRepository) RemoveItem(orderID, itemID uint) error {
	result := r.db.Where("id = ? AND pedido_id = ?", itemID, orderID).Delete(&models.OrderItem{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *orderRepository) CountOpenByShift(turnoID uint) (int64, error) {
	var n int64
	return n, r.db.Model(&models.Order{}).
		Where("turno_id = ? AND estado = ?", turnoID, models.EstadoAbierto).
		Count(&n).Error
}

func (r *orderRepository) FinalizeSale(orderID uint, payment *models.Payment, turnoID *uint, today time.Time) ([]LowStockAlert, error) {
	var alerts []LowStockAlert

	err := r.db.Transaction(func(tx *gorm.DB) error {
		// Bloquear la venta: un segundo intento concurrente o un reintento por
		// error de red espera aquí y luego encuentra el estado "pagado".
		var order models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, orderID).Error; err != nil {
			return err
		}
		if order.Estado != models.EstadoAbierto {
			return ErrOrderAlreadyClosed
		}

		var items []models.OrderItem
		if err := tx.Preload("Producto").Where("pedido_id = ?", orderID).Find(&items).Error; err != nil {
			return err
		}
		if len(items) == 0 {
			return ErrEmptyOrder
		}

		var total float64
		for _, item := range items {
			// RN-03: revalidar el vencimiento en el momento del pago.
			if item.Producto.IsExpired(today) {
				return &ExpiredProductError{Producto: item.Producto.Nombre}
			}

			// RN-01 / RN-02 / A5: descuento condicional. Si otra caja vendió
			// las últimas unidades, la condición falla y no se afecta nada.
			res := tx.Exec(
				"UPDATE inventario SET stock_actual = stock_actual - ? WHERE sede_id = ? AND producto_id = ? AND stock_actual >= ?",
				item.Cantidad, order.SedeID, item.ProductoID, item.Cantidad,
			)
			if res.Error != nil {
				return res.Error
			}
			var inv models.Inventory
			if err := tx.Where("sede_id = ? AND producto_id = ?", order.SedeID, item.ProductoID).
				First(&inv).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if res.RowsAffected == 0 {
				return &InsufficientStockError{Producto: item.Producto.Nombre, Available: inv.StockActual}
			}

			pid := orderID
			mov := models.InventoryMovement{
				InventarioID: inv.ID,
				UsuarioID:    payment.UsuarioID,
				Tipo:         models.TipoDescuentoVenta,
				Cantidad:     -item.Cantidad,
				StockFinal:   inv.StockActual,
				PedidoID:     &pid,
				Motivo:       fmt.Sprintf("Venta #%d", orderID),
			}
			if err := tx.Create(&mov).Error; err != nil {
				return err
			}

			// RN-11: alerta cuando la existencia resultante alcanza el mínimo.
			if inv.StockActual <= inv.StockMinimo {
				alerts = append(alerts, LowStockAlert{
					ProductoID:  item.ProductoID,
					Producto:    item.Producto.Nombre,
					StockActual: inv.StockActual,
					StockMinimo: inv.StockMinimo,
				})
			}
			total += item.PrecioUnitario * float64(item.Cantidad)
		}

		payment.PedidoID = orderID
		payment.Total = total
		if err := tx.Create(payment).Error; err != nil {
			return err
		}

		now := time.Now()
		return tx.Model(&models.Order{}).Where("id = ?", orderID).Updates(map[string]interface{}{
			"estado":     models.EstadoPagado,
			"cerrado_at": now,
			"turno_id":   turnoID,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return alerts, nil
}

func (r *orderRepository) AnnulSale(orderID, userID uint, motivo string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var order models.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, orderID).Error; err != nil {
			return err
		}
		if order.Estado != models.EstadoPagado {
			return ErrOrderNotPaid
		}

		var items []models.OrderItem
		if err := tx.Where("pedido_id = ?", orderID).Find(&items).Error; err != nil {
			return err
		}

		for _, item := range items {
			var inv models.Inventory
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("sede_id = ? AND producto_id = ?", order.SedeID, item.ProductoID).
				First(&inv).Error; err != nil {
				return err
			}
			inv.StockActual += item.Cantidad
			if err := tx.Model(&models.Inventory{}).Where("id = ?", inv.ID).
				Update("stock_actual", inv.StockActual).Error; err != nil {
				return err
			}
			pid := orderID
			mov := models.InventoryMovement{
				InventarioID: inv.ID,
				UsuarioID:    userID,
				Tipo:         models.TipoAnulacionVenta,
				Cantidad:     item.Cantidad,
				StockFinal:   inv.StockActual,
				PedidoID:     &pid,
				Motivo:       fmt.Sprintf("Anulación venta #%d: %s", orderID, motivo),
			}
			if err := tx.Create(&mov).Error; err != nil {
				return err
			}
		}

		now := time.Now()
		return tx.Model(&models.Order{}).Where("id = ?", orderID).Updates(map[string]interface{}{
			"estado":           models.EstadoAnulado,
			"anulado_por_id":   userID,
			"anulado_at":       now,
			"motivo_anulacion": motivo,
		}).Error
	})
}
