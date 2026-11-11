package models

import "time"

// User representa al personal del supermercado (RF-02 / RF-10).
//
// El cargo del empleado es su rol; el estado es Activo. Documento, Teléfono y
// FechaIngreso completan los "datos básicos" que exige RF-10.
//
// HU008: el identificador de login es `Username` (único). `Email` queda como
// dato de contacto opcional.
type User struct {
	ID           uint       `gorm:"primaryKey"                                                          json:"id"`
	SedeID       *uint      `gorm:"index"                                                               json:"sede_id"`
	Sede         *Venue     `gorm:"foreignKey:SedeID"                                                   json:"sede,omitempty"`
	Username     string     `gorm:"size:50;uniqueIndex;not null"                                        json:"username"`
	Nombre       string     `gorm:"size:150;not null"                                                   json:"nombre"`
	Email        *string    `gorm:"size:150"                                                            json:"email,omitempty"`
	Documento    string     `gorm:"size:20"                                                             json:"documento"`
	Telefono     string     `gorm:"size:30"                                                             json:"telefono"`
	FechaIngreso *time.Time `gorm:"type:date"                                                           json:"fecha_ingreso"`
	PasswordHash string     `gorm:"size:255;not null"                                                   json:"-"`
	Rol          RolUsuario `gorm:"type:enum('admin','admin_tienda','cajero','auxiliar_bodega');not null" json:"rol"`
	Activo       bool       `gorm:"not null;default:1"                                                  json:"activo"`
	CreatedAt    time.Time  `gorm:"autoCreateTime"                                                      json:"created_at"`
}

func (User) TableName() string { return "usuarios" }
