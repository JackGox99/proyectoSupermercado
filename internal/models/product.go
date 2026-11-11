package models

import "time"

// UnidadMedida es la unidad en que se vende un producto (sección 6.2 del documento).
type UnidadMedida string

const (
	UnidadUnidad  UnidadMedida = "unidad"
	UnidadKg      UnidadMedida = "kg"
	UnidadGramo   UnidadMedida = "g"
	UnidadLitro   UnidadMedida = "l"
	UnidadMl      UnidadMedida = "ml"
	UnidadPaquete UnidadMedida = "paquete"
)

// ValidUnidad indica si la unidad de medida es uno de los valores permitidos.
func ValidUnidad(u UnidadMedida) bool {
	switch u {
	case UnidadUnidad, UnidadKg, UnidadGramo, UnidadLitro, UnidadMl, UnidadPaquete:
		return true
	}
	return false
}

// Product es un producto del catálogo maestro de una tienda (RF-05 / CU-05).
//
// RN-08: el código de barras es único dentro de la misma tienda; se refuerza
// con el índice único compuesto uq_producto_sede_codigo.
// RN-07: el precio de venta debe ser mayor que cero (validado en el servicio).
// RN-03: un producto con FechaVencimiento anterior a hoy no puede venderse.
type Product struct {
	ID               uint         `gorm:"primaryKey"                                                             json:"id"`
	SedeID           uint         `gorm:"not null;uniqueIndex:uq_producto_sede_codigo,priority:1"                json:"sede_id"`
	Sede             *Venue       `gorm:"foreignKey:SedeID"                                                      json:"sede,omitempty"`
	CodigoBarras     string       `gorm:"size:50;not null;uniqueIndex:uq_producto_sede_codigo,priority:2"        json:"codigo_barras"`
	CategoriaID      uint         `gorm:"not null"                                                               json:"categoria_id"`
	Categoria        Category     `gorm:"foreignKey:CategoriaID"                                                 json:"categoria,omitempty"`
	Nombre           string       `gorm:"size:150;not null"                                                      json:"nombre"`
	Descripcion      string       `gorm:"type:text"                                                              json:"descripcion"`
	UnidadMedida     UnidadMedida `gorm:"type:enum('unidad','kg','g','l','ml','paquete');not null;default:'unidad'" json:"unidad_medida"`
	CostoCompra      float64      `gorm:"type:decimal(10,2);not null;default:0"                                  json:"costo_compra"`
	Precio           float64      `gorm:"type:decimal(10,2);not null"                                            json:"precio"`
	FechaVencimiento *time.Time   `gorm:"type:date"                                                              json:"fecha_vencimiento"`
	Activo           bool         `gorm:"not null;default:1"                                                     json:"activo"`
	CreatedAt        time.Time    `gorm:"autoCreateTime"                                                         json:"created_at"`
}

func (Product) TableName() string { return "productos" }

// IsExpired indica si el producto está vencido respecto a la fecha `today`
// (RN-03). Se compara por fecha calendario: vence al terminar el día indicado.
func (p *Product) IsExpired(today time.Time) bool {
	if p.FechaVencimiento == nil {
		return false
	}
	y, m, d := today.Date()
	startOfToday := time.Date(y, m, d, 0, 0, 0, 0, today.Location())
	vy, vm, vd := p.FechaVencimiento.Date()
	venc := time.Date(vy, vm, vd, 0, 0, 0, 0, today.Location())
	return venc.Before(startOfToday)
}
