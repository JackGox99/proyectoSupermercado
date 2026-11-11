package models

import "time"

// EstadoTurno representa el ciclo de vida de un turno del personal (RF-11 / CU-07).
//
//	programado (lo asigna el admin de tienda) → abierto (lo inicia el empleado) → cerrado
type EstadoTurno string

const (
	TurnoProgramado EstadoTurno = "programado"
	TurnoAbierto    EstadoTurno = "abierto"
	TurnoCerrado    EstadoTurno = "cerrado"
)

// TurnoEstadoEnumSQL es la definición SQL del ENUM de estados del turno.
const TurnoEstadoEnumSQL = "enum('programado','abierto','cerrado')"

// Shift es un turno asignado a un empleado en una tienda.
//
// RN-09: toda venta queda asociada al turno abierto del cajero que la registra.
// Al cerrar el turno se guarda el resumen de caja (cierre de turno del cajero).
type Shift struct {
	ID            uint        `gorm:"primaryKey"                                                        json:"id"`
	SedeID        uint        `gorm:"not null;index"                                                    json:"sede_id"`
	Sede          *Venue      `gorm:"foreignKey:SedeID"                                                 json:"sede,omitempty"`
	UsuarioID     uint        `gorm:"not null;index"                                                    json:"usuario_id"`
	Usuario       *User       `gorm:"foreignKey:UsuarioID"                                              json:"usuario,omitempty"`
	Fecha         time.Time   `gorm:"type:date;not null;index"                                          json:"fecha"`
	HoraInicio    string      `gorm:"size:5;not null"                                                   json:"hora_inicio"`
	HoraFin       string      `gorm:"size:5;not null"                                                   json:"hora_fin"`
	Estado        EstadoTurno `gorm:"type:enum('programado','abierto','cerrado');not null;default:'programado'" json:"estado"`
	AsignadoPorID uint        `gorm:"not null"                                                          json:"asignado_por_id"`
	AbiertoAt     *time.Time  `                                                                         json:"abierto_at"`
	CerradoAt     *time.Time  `                                                                         json:"cerrado_at"`
	// Resumen del cierre (solo se llena al cerrar).
	NumVentas     int       `gorm:"not null;default:0"                    json:"num_ventas"`
	TotalVentas   float64   `gorm:"type:decimal(12,2);not null;default:0" json:"total_ventas"`
	TotalEfectivo float64   `gorm:"type:decimal(12,2);not null;default:0" json:"total_efectivo"`
	TotalDebito   float64   `gorm:"type:decimal(12,2);not null;default:0" json:"total_debito"`
	TotalCredito  float64   `gorm:"type:decimal(12,2);not null;default:0" json:"total_credito"`
	CreatedAt     time.Time `gorm:"autoCreateTime"                        json:"created_at"`
}

func (Shift) TableName() string { return "turnos" }
