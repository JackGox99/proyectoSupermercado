package repository

import (
	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
)

// VenueRepository define el acceso a datos de tiendas (RF-01 / CU-09).
type VenueRepository interface {
	// FindAll retorna las tiendas; includeInactive=false filtra solo las activas.
	FindAll(includeInactive bool) ([]models.Venue, error)
	FindByID(id uint) (*models.Venue, error)
	FindByName(name string) (*models.Venue, error)
	Create(v *models.Venue) error
	Update(v *models.Venue) error
}

type venueRepository struct {
	db *gorm.DB
}

func NewVenueRepository(db *gorm.DB) VenueRepository {
	return &venueRepository{db: db}
}

func (r *venueRepository) FindAll(includeInactive bool) ([]models.Venue, error) {
	var venues []models.Venue
	q := r.db.Order("nombre ASC")
	if !includeInactive {
		q = q.Where("activa = ?", true)
	}
	return venues, q.Find(&venues).Error
}

func (r *venueRepository) FindByID(id uint) (*models.Venue, error) {
	var venue models.Venue
	return &venue, r.db.First(&venue, id).Error
}

func (r *venueRepository) FindByName(name string) (*models.Venue, error) {
	var venue models.Venue
	return &venue, r.db.Where("nombre = ?", name).First(&venue).Error
}

func (r *venueRepository) Create(v *models.Venue) error {
	return r.db.Create(v).Error
}

func (r *venueRepository) Update(v *models.Venue) error {
	return r.db.Save(v).Error
}
