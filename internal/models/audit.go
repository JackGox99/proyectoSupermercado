package models

import "time"

// ResultadoAuditoria indica cómo terminó la operación registrada.
type ResultadoAuditoria string

const (
	AuditoriaExito    ResultadoAuditoria = "exito"
	AuditoriaDenegado ResultadoAuditoria = "denegado"
	AuditoriaFallido  ResultadoAuditoria = "fallido"
)

// AuditLog es una entrada de la bitácora de auditoría (RF-13).
// Registra usuario, acción y fecha de las operaciones críticas, además de los
// intentos de acceso no autorizados (RN-06). Es de solo inserción.
//
// Username y Rol se guardan como snapshot para que la bitácora siga siendo
// legible aunque el usuario cambie o se inactive.
type AuditLog struct {
	ID        uint               `gorm:"primaryKey"                                        json:"id"`
	UsuarioID *uint              `gorm:"index"                                             json:"usuario_id"`
	Username  string             `gorm:"size:50"                                           json:"username"`
	Rol       string             `gorm:"size:20"                                           json:"rol"`
	SedeID    *uint              `gorm:"index"                                             json:"sede_id"`
	Accion    string             `gorm:"size:60;not null;index"                            json:"accion"`
	Entidad   string             `gorm:"size:40"                                           json:"entidad"`
	EntidadID *uint              `                                                         json:"entidad_id"`
	Resultado ResultadoAuditoria `gorm:"type:enum('exito','denegado','fallido');not null"   json:"resultado"`
	Detalle   string             `gorm:"type:text"                                         json:"detalle"`
	Metodo    string             `gorm:"size:10"                                           json:"metodo"`
	Ruta      string             `gorm:"size:255"                                          json:"ruta"`
	IP        string             `gorm:"size:45"                                           json:"ip"`
	Fecha     time.Time          `gorm:"autoCreateTime;index"                              json:"fecha"`
}

func (AuditLog) TableName() string { return "auditoria" }
