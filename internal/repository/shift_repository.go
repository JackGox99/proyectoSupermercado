package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
)

// ShiftFilter filtra el listado de turnos.
type ShiftFilter struct {
	VenueID   *uint
	UsuarioID *uint
	From      *time.Time
	To        *time.Time
	Estado    string
}

// ShiftSalesSummary resume las ventas pagadas de un turno (cierre de caja).
type ShiftSalesSummary struct {
	NumVentas     int     `json:"num_ventas"`
	TotalVentas   float64 `json:"total_ventas"`
	TotalEfectivo float64 `json:"total_efectivo"`
	TotalDebito   float64 `json:"total_debito"`
	TotalCredito  float64 `json:"total_credito"`
}

// ShiftRepository define el acceso a datos de turnos del personal (RF-11).
type ShiftRepository interface {
	FindAll(f ShiftFilter) ([]models.Shift, error)
	FindByID(id uint) (*models.Shift, error)
	// FindOpenByUser retorna el turno abierto del usuario, o (nil, nil) si no tiene.
	FindOpenByUser(userID uint) (*models.Shift, error)
	ExistsForUserOnDate(userID uint, fecha time.Time) (bool, error)
	Create(s *models.Shift) error
	Update(s *models.Shift) error
	Delete(id uint) error
	// SalesSummary totaliza las ventas pagadas asociadas al turno (RN-09).
	SalesSummary(turnoID uint) (ShiftSalesSummary, error)
}

type shiftRepository struct {
	db *gorm.DB
}

func NewShiftRepository(db *gorm.DB) ShiftRepository {
	return &shiftRepository{db: db}
}

func (r *shiftRepository) FindAll(f ShiftFilter) ([]models.Shift, error) {
	var shifts []models.Shift
	q := r.db.Preload("Usuario").Preload("Sede").Order("fecha ASC, hora_inicio ASC, id ASC").Limit(1000)
	if f.VenueID != nil {
		q = q.Where("sede_id = ?", *f.VenueID)
	}
	if f.UsuarioID != nil {
		q = q.Where("usuario_id = ?", *f.UsuarioID)
	}
	if f.From != nil {
		q = q.Where("fecha >= ?", f.From.Format("2006-01-02"))
	}
	if f.To != nil {
		q = q.Where("fecha <= ?", f.To.Format("2006-01-02"))
	}
	if f.Estado != "" {
		q = q.Where("estado = ?", f.Estado)
	}
	return shifts, q.Find(&shifts).Error
}

func (r *shiftRepository) FindByID(id uint) (*models.Shift, error) {
	var s models.Shift
	return &s, r.db.Preload("Usuario").Preload("Sede").First(&s, id).Error
}

func (r *shiftRepository) FindOpenByUser(userID uint) (*models.Shift, error) {
	var s models.Shift
	err := r.db.Preload("Sede").Where("usuario_id = ? AND estado = ?", userID, models.TurnoAbierto).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &s, err
}

func (r *shiftRepository) ExistsForUserOnDate(userID uint, fecha time.Time) (bool, error) {
	var n int64
	err := r.db.Model(&models.Shift{}).
		Where("usuario_id = ? AND fecha = ?", userID, fecha.Format("2006-01-02")).
		Count(&n).Error
	return n > 0, err
}

func (r *shiftRepository) Create(s *models.Shift) error {
	return r.db.Omit("Usuario", "Sede").Create(s).Error
}

func (r *shiftRepository) Update(s *models.Shift) error {
	return r.db.Omit("Usuario", "Sede").Save(s).Error
}

func (r *shiftRepository) Delete(id uint) error {
	return r.db.Delete(&models.Shift{}, id).Error
}

func (r *shiftRepository) SalesSummary(turnoID uint) (ShiftSalesSummary, error) {
	var s ShiftSalesSummary
	err := r.db.Raw(`
SELECT
    COUNT(pg.id)                                                                AS num_ventas,
    COALESCE(SUM(pg.total), 0)                                                  AS total_ventas,
    COALESCE(SUM(CASE WHEN pg.metodo_pago = 'efectivo'        THEN pg.total END), 0) AS total_efectivo,
    COALESCE(SUM(CASE WHEN pg.metodo_pago = 'tarjeta_debito'  THEN pg.total END), 0) AS total_debito,
    COALESCE(SUM(CASE WHEN pg.metodo_pago = 'tarjeta_credito' THEN pg.total END), 0) AS total_credito
FROM pedidos p
JOIN pagos pg ON pg.pedido_id = p.id
WHERE p.turno_id = ? AND p.estado = 'pagado'`, turnoID).Scan(&s).Error
	return s, err
}
