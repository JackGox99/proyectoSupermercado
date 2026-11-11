package repository

import (
	"time"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
)

// AuditFilter filtra la consulta de la bitácora de auditoría.
type AuditFilter struct {
	VenueID   *uint
	From      *time.Time
	To        *time.Time
	Accion    string
	Username  string
	Resultado string
}

// AuditRepository persiste y consulta la bitácora (RF-13). Es de solo
// inserción: no expone operaciones de modificación ni de borrado.
type AuditRepository interface {
	Create(entry *models.AuditLog) error
	Find(f AuditFilter) ([]models.AuditLog, error)
}

type auditRepository struct {
	db *gorm.DB
}

func NewAuditRepository(db *gorm.DB) AuditRepository {
	return &auditRepository{db: db}
}

func (r *auditRepository) Create(entry *models.AuditLog) error {
	return r.db.Create(entry).Error
}

func (r *auditRepository) Find(f AuditFilter) ([]models.AuditLog, error) {
	var logs []models.AuditLog
	q := r.db.Order("fecha DESC, id DESC").Limit(1000)
	if f.VenueID != nil {
		q = q.Where("sede_id = ?", *f.VenueID)
	}
	if f.From != nil {
		q = q.Where("fecha >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("fecha <= ?", *f.To)
	}
	if f.Accion != "" {
		q = q.Where("accion LIKE ?", f.Accion+"%")
	}
	if f.Username != "" {
		q = q.Where("username LIKE ?", "%"+f.Username+"%")
	}
	if f.Resultado != "" {
		q = q.Where("resultado = ?", f.Resultado)
	}
	return logs, q.Find(&logs).Error
}
