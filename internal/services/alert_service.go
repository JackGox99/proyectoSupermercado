package services

import (
	"supermercado-inventory-api/internal/repository"
)

// AlertService evalúa niveles de stock y fechas de vencimiento para generar
// las alertas del panel de inventario (RN-11 / RF-09 / Servicio de Alertas).
//
// Las alertas se calculan sobre el estado actual de la base de datos, por lo
// que siempre reflejan las existencias reales: una alerta desaparece en cuanto
// el auxiliar de bodega repone el producto o lo retira.
type AlertService interface {
	// List retorna las alertas vigentes; venueID nil = todas las tiendas.
	List(venueID *uint) ([]repository.Alert, error)
}

type alertService struct {
	repo repository.AlertRepository
}

func NewAlertService(repo repository.AlertRepository) AlertService {
	return &alertService{repo: repo}
}

func (s *alertService) List(venueID *uint) ([]repository.Alert, error) {
	alerts, err := s.repo.Find(venueID, ExpiryWarningDays)
	if alerts == nil {
		alerts = []repository.Alert{}
	}
	return alerts, err
}
