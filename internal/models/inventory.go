package models

import "time"

// Inventory guarda las existencias de un producto en una tienda.
// Restricción de datos: stock_actual nunca puede ser negativo (las operaciones
// de descuento usan UPDATE condicionales que lo garantizan).
type Inventory struct {
	ID          uint      `gorm:"primaryKey"                                      json:"id"`
	SedeID      uint      `gorm:"uniqueIndex:uq_inv_sede_producto;not null"        json:"sede_id"`
	Sede        Venue     `gorm:"foreignKey:SedeID"                               json:"sede,omitempty"`
	ProductoID  uint      `gorm:"uniqueIndex:uq_inv_sede_producto;not null"        json:"producto_id"`
	Producto    Product   `gorm:"foreignKey:ProductoID"                           json:"producto,omitempty"`
	StockActual int       `gorm:"not null;default:0"                              json:"stock_actual"`
	StockMinimo int       `gorm:"not null;default:0"                              json:"stock_minimo"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime"                                  json:"updated_at"`
}

func (Inventory) TableName() string { return "inventario" }

// ----------------------------------------------------------------

// TipoMovimiento clasifica cada cambio de existencias para la trazabilidad.
// La cantidad del movimiento lleva signo: positiva suma stock, negativa resta.
type TipoMovimiento string

const (
	// TipoEntrada: entrada de mercancía de un proveedor (CU-02).
	TipoEntrada TipoMovimiento = "entrada"
	// TipoDescuentoVenta: descuento automático al pagar una venta (RN-02).
	TipoDescuentoVenta TipoMovimiento = "descuento_venta"
	// TipoAnulacionVenta: movimiento inverso al anular una venta (RN-10).
	TipoAnulacionVenta TipoMovimiento = "anulacion_venta"
	// Ajustes de inventario (CU-03).
	TipoAjusteAveria      TipoMovimiento = "ajuste_averia"
	TipoAjusteDevolucion  TipoMovimiento = "ajuste_devolucion"
	TipoAjusteVencimiento TipoMovimiento = "ajuste_vencimiento"
	TipoAjusteManual      TipoMovimiento = "ajuste_manual"
)

// TipoMovimientoEnumSQL es la definición SQL del ENUM de tipos de movimiento.
const TipoMovimientoEnumSQL = "enum('entrada','descuento_venta','anulacion_venta','ajuste_averia','ajuste_devolucion','ajuste_vencimiento','ajuste_manual')"

type InventoryMovement struct {
	ID           uint           `gorm:"primaryKey"                                                                                                                 json:"id"`
	InventarioID uint           `gorm:"not null;index"                                                                                                             json:"inventario_id"`
	Inventario   Inventory      `gorm:"foreignKey:InventarioID"                                                                                                    json:"inventario,omitempty"`
	UsuarioID    uint           `gorm:"not null"                                                                                                                   json:"usuario_id"`
	Usuario      User           `gorm:"foreignKey:UsuarioID"                                                                                                       json:"usuario,omitempty"`
	Tipo         TipoMovimiento `gorm:"type:enum('entrada','descuento_venta','anulacion_venta','ajuste_averia','ajuste_devolucion','ajuste_vencimiento','ajuste_manual');not null" json:"tipo"`
	Cantidad     int            `gorm:"not null"                                                                                                                   json:"cantidad"`
	StockFinal   int            `gorm:"not null;default:0"                                                                                                         json:"stock_final"`
	PedidoID     *uint          `gorm:"index"                                                                                                                      json:"pedido_id,omitempty"`
	Motivo       string         `gorm:"type:text"                                                                                                                  json:"motivo"`
	Fecha        time.Time      `gorm:"autoCreateTime;index"                                                                                                       json:"fecha"`
}

func (InventoryMovement) TableName() string { return "movimientos_inventario" }
