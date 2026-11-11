package repository

import (
	"errors"

	"gorm.io/gorm"

	"supermercado-inventory-api/internal/models"
)

// ErrCategoryInUse indica que la categoría tiene productos asociados.
var ErrCategoryInUse = errors.New("no se puede eliminar: la categoría tiene productos asociados")

// CategoryRepository define el contrato de acceso a datos para categorías.
type CategoryRepository interface {
	FindAll() ([]models.Category, error)
	FindByID(id uint) (*models.Category, error)
	FindByName(name string) (*models.Category, error)
	Create(c *models.Category) error
	Update(c *models.Category) error
	Delete(id uint) error
}

type categoryRepository struct {
	db *gorm.DB
}

func NewCategoryRepository(db *gorm.DB) CategoryRepository {
	return &categoryRepository{db: db}
}

func (r *categoryRepository) FindAll() ([]models.Category, error) {
	var categories []models.Category
	return categories, r.db.Find(&categories).Error
}

func (r *categoryRepository) FindByID(id uint) (*models.Category, error) {
	var category models.Category
	return &category, r.db.First(&category, id).Error
}

func (r *categoryRepository) FindByName(name string) (*models.Category, error) {
	var category models.Category
	return &category, r.db.Where("nombre = ?", name).First(&category).Error
}

func (r *categoryRepository) Create(c *models.Category) error {
	return r.db.Create(c).Error
}

func (r *categoryRepository) Update(c *models.Category) error {
	return r.db.Save(c).Error
}

// Delete elimina la categoría solo si ningún producto (activo o histórico) la
// referencia; así se preserva la integridad de los reportes.
func (r *categoryRepository) Delete(id uint) error {
	var n int64
	if err := r.db.Model(&models.Product{}).Where("categoria_id = ?", id).Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return ErrCategoryInUse
	}
	return r.db.Delete(&models.Category{}, id).Error
}
