package models

import "time"

// Venue representa una tienda (sucursal) del supermercado (RF-01 / CU-09).
// Solo el administrador general puede crearlas, configurarlas o inactivarlas (RN-06).
//
// Color es el color de marca de la tienda: el cliente web lo usa como color
// principal cuando se opera dentro de esa tienda, para distinguirla visualmente.
type Venue struct {
	ID        uint      `gorm:"primaryKey"                    json:"id"`
	Nombre    string    `gorm:"size:100;uniqueIndex;not null"  json:"nombre"`
	Direccion string    `gorm:"size:255;not null"             json:"direccion"`
	Telefono  string    `gorm:"size:30"                       json:"telefono"`
	Color     string    `gorm:"size:7;not null;default:'#4ADE80'" json:"color"`
	Activa    bool      `gorm:"not null;default:1"            json:"activa"`
	CreatedAt time.Time `gorm:"autoCreateTime"                json:"created_at"`
}

func (Venue) TableName() string { return "sedes" }
