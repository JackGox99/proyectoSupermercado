package repository

import (
	"time"

	"gorm.io/gorm"
)

// Tipos de alerta generados por el sistema (RN-11 / RF-09).
const (
	AlertStockMinimo = "stock_minimo" // existencia en o por debajo del mínimo
	AlertAgotado     = "agotado"      // existencia en cero
	AlertVencido     = "vencido"      // fecha de vencimiento ya pasó: retirar (RN-03)
	AlertPorVencer   = "por_vencer"   // vence dentro de la ventana configurada
)

// Alert es una alerta de inventario de un producto en una tienda.
type Alert struct {
	Tipo             string     `json:"tipo"`
	ProductoID       uint       `json:"producto_id"`
	Producto         string     `json:"producto"`
	CodigoBarras     string     `json:"codigo_barras"`
	SedeID           uint       `json:"sede_id"`
	Sede             string     `json:"sede"`
	StockActual      int        `json:"stock_actual"`
	StockMinimo      int        `json:"stock_minimo"`
	FechaVencimiento *time.Time `json:"fecha_vencimiento"`
	DiasRestantes    *int       `json:"dias_restantes"`
}

// AlertRepository consulta los productos que requieren atención.
type AlertRepository interface {
	// Find retorna las alertas vigentes; venueID nil = todas las tiendas.
	// days es la ventana (en días) para considerar un producto "por vencer".
	Find(venueID *uint, days int) ([]Alert, error)
}

type alertRepository struct {
	db *gorm.DB
}

func NewAlertRepository(db *gorm.DB) AlertRepository {
	return &alertRepository{db: db}
}

type alertRow struct {
	ProductoID       uint
	Producto         string
	CodigoBarras     string
	SedeID           uint
	Sede             string
	StockActual      int
	StockMinimo      int
	FechaVencimiento *time.Time
	DiasRestantes    *int
}

func (r *alertRepository) Find(venueID *uint, days int) ([]Alert, error) {
	where := " WHERE p.activo = 1"
	var args []interface{}
	if venueID != nil {
		where += " AND p.sede_id = ?"
		args = append(args, *venueID)
	}
	args = append(args, days) // ventana de "por vencer" (último placeholder)
	sql := `
SELECT p.id AS producto_id, p.nombre AS producto, p.codigo_barras, s.id AS sede_id, s.nombre AS sede,
       COALESCE(i.stock_actual, 0) AS stock_actual, COALESCE(i.stock_minimo, 0) AS stock_minimo,
       p.fecha_vencimiento,
       DATEDIFF(p.fecha_vencimiento, CURDATE()) AS dias_restantes
FROM productos p
JOIN sedes s ON s.id = p.sede_id
LEFT JOIN inventario i ON i.producto_id = p.id AND i.sede_id = p.sede_id` + where + `
  AND (
        COALESCE(i.stock_actual, 0) <= COALESCE(i.stock_minimo, 0)
     OR (p.fecha_vencimiento IS NOT NULL AND p.fecha_vencimiento <= CURDATE() + INTERVAL ? DAY)
  )
ORDER BY s.nombre, p.nombre`
	var rows []alertRow
	if err := r.db.Raw(sql, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}

	var alerts []Alert
	for _, row := range rows {
		base := Alert{
			ProductoID:       row.ProductoID,
			Producto:         row.Producto,
			CodigoBarras:     row.CodigoBarras,
			SedeID:           row.SedeID,
			Sede:             row.Sede,
			StockActual:      row.StockActual,
			StockMinimo:      row.StockMinimo,
			FechaVencimiento: row.FechaVencimiento,
			DiasRestantes:    row.DiasRestantes,
		}
		if row.DiasRestantes != nil {
			a := base
			if *row.DiasRestantes < 0 {
				a.Tipo = AlertVencido
				alerts = append(alerts, a)
			} else if *row.DiasRestantes <= days {
				a.Tipo = AlertPorVencer
				alerts = append(alerts, a)
			}
		}
		if row.StockActual <= row.StockMinimo {
			a := base
			if row.StockActual <= 0 {
				a.Tipo = AlertAgotado
			} else {
				a.Tipo = AlertStockMinimo
			}
			alerts = append(alerts, a)
		}
	}
	return alerts, nil
}
