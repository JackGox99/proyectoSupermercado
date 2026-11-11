package models

import "time"

// EstadoPedido representa el ciclo de vida de una venta.
//
//	abierto → pagado → (anulado)
//
// RN-02: el stock solo se descuenta al pasar a "pagado".
// RN-10: una venta pagada es inmutable; solo puede anularse con una operación
// registrada que genera movimientos inversos de inventario.
type EstadoPedido string

const (
	EstadoAbierto EstadoPedido = "abierto"
	EstadoPagado  EstadoPedido = "pagado"
	EstadoAnulado EstadoPedido = "anulado"
)

// EstadoPedidoEnumSQL es la definición SQL del ENUM de estados del pedido.
const EstadoPedidoEnumSQL = "enum('abierto','pagado','anulado')"

// Order es una venta registrada por un cajero en una tienda (CU-01).
// TurnoID asocia la venta al turno vigente del cajero (RN-09).
type Order struct {
	ID              uint         `gorm:"primaryKey"                                                    json:"id"`
	SedeID          uint         `gorm:"not null;index"                                                json:"sede_id"`
	Sede            Venue        `gorm:"foreignKey:SedeID"                                             json:"sede,omitempty"`
	UsuarioID       uint         `gorm:"not null"                                                      json:"usuario_id"`
	Usuario         User         `gorm:"foreignKey:UsuarioID"                                          json:"usuario,omitempty"`
	TurnoID         *uint        `gorm:"index"                                                         json:"turno_id"`
	Estado          EstadoPedido `gorm:"type:enum('abierto','pagado','anulado');not null;default:'abierto'" json:"estado"`
	Items           []OrderItem  `gorm:"foreignKey:PedidoID"                                           json:"items,omitempty"`
	Pago            *Payment     `gorm:"foreignKey:PedidoID"                                           json:"pago,omitempty"`
	CreatedAt       time.Time    `gorm:"autoCreateTime"                                                json:"created_at"`
	CerradoAt       *time.Time   `                                                                     json:"cerrado_at"`
	AnuladoPorID    *uint        `                                                                     json:"anulado_por_id,omitempty"`
	AnuladoPor      *User        `gorm:"foreignKey:AnuladoPorID"                                       json:"anulado_por,omitempty"`
	AnuladoAt       *time.Time   `                                                                     json:"anulado_at,omitempty"`
	MotivoAnulacion string       `gorm:"type:text"                                                     json:"motivo_anulacion,omitempty"`
}

func (Order) TableName() string { return "pedidos" }
