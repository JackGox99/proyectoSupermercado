package services

import (
	"errors"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
)

// ExpiryWarningDays es la ventana (en días) para considerar que un producto
// está próximo a vencer (RF-09). Parámetro global de la plataforma.
const ExpiryWarningDays = 7

var hexColor = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

// VenueService administra las tiendas del supermercado (RF-01 / CU-09).
// Las operaciones de escritura están restringidas al administrador general
// (RN-06); la restricción se aplica en las rutas y queda registrada en la bitácora.
type VenueService interface {
	List(includeInactive bool) ([]models.Venue, error)
	GetByID(id uint) (*models.Venue, error)
	Create(v *models.Venue) error
	Update(v *models.Venue) error
	SetActive(id uint, active bool) (*models.Venue, error)
	// Overview resume el estado de las tiendas (selector y panel de tienda).
	Overview(venueID *uint, includeInactive bool) ([]repository.StoreOverview, error)
}

type venueService struct {
	repo       repository.VenueRepository
	reportRepo repository.ReportRepository
}

func NewVenueService(repo repository.VenueRepository, reportRepo repository.ReportRepository) VenueService {
	return &venueService{repo: repo, reportRepo: reportRepo}
}

func (s *venueService) List(includeInactive bool) ([]models.Venue, error) {
	return s.repo.FindAll(includeInactive)
}

func (s *venueService) GetByID(id uint) (*models.Venue, error) {
	return s.repo.FindByID(id)
}

func (s *venueService) validate(v *models.Venue) error {
	v.Nombre = strings.TrimSpace(v.Nombre)
	v.Direccion = strings.TrimSpace(v.Direccion)
	v.Telefono = strings.TrimSpace(v.Telefono)
	if v.Nombre == "" {
		return ErrVenueNameRequired
	}
	if v.Direccion == "" {
		return ErrVenueAddrRequired
	}
	if v.Color == "" {
		v.Color = "#16A34A"
	}
	if !hexColor.MatchString(v.Color) {
		return ErrInvalidColor
	}
	v.Color = strings.ToUpper(v.Color)

	existing, err := s.repo.FindByName(v.Nombre)
	if err == nil && existing.ID != v.ID {
		return ErrVenueNameTaken
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	return nil
}

func (s *venueService) Create(v *models.Venue) error {
	v.ID = 0
	v.Activa = true
	if err := s.validate(v); err != nil {
		return err
	}
	return s.repo.Create(v)
}

func (s *venueService) Update(v *models.Venue) error {
	if err := s.validate(v); err != nil {
		return err
	}
	return s.repo.Update(v)
}

func (s *venueService) SetActive(id uint, active bool) (*models.Venue, error) {
	v, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	v.Activa = active
	return v, s.repo.Update(v)
}

func (s *venueService) Overview(venueID *uint, includeInactive bool) ([]repository.StoreOverview, error) {
	return s.reportRepo.GetStoreOverview(venueID, includeInactive, ExpiryWarningDays)
}
