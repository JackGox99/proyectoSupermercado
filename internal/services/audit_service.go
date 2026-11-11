package services

import (
	"log"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
)

// AuditService registra y consulta la bitácora de auditoría (RF-13).
type AuditService interface {
	// Record inserta una entrada. Un fallo al auditar se registra en el log del
	// servidor pero no interrumpe la operación del usuario.
	Record(entry *models.AuditLog)
	List(f repository.AuditFilter) ([]models.AuditLog, error)
}

type auditService struct {
	repo repository.AuditRepository
}

func NewAuditService(repo repository.AuditRepository) AuditService {
	return &auditService{repo: repo}
}

func (s *auditService) Record(entry *models.AuditLog) {
	if err := s.repo.Create(entry); err != nil {
		log.Printf("audit: no se pudo registrar %q: %v", entry.Accion, err)
	}
}

func (s *auditService) List(f repository.AuditFilter) ([]models.AuditLog, error) {
	logs, err := s.repo.Find(f)
	if logs == nil {
		logs = []models.AuditLog{}
	}
	return logs, err
}
