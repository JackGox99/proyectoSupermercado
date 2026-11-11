package services

import (
	"errors"
	"strings"

	"supermercado-inventory-api/internal/algorithms"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// UserService define el contrato de lógica de negocio para usuarios y personal
// (RF-02 / RF-04 / RF-10 / CU-06).
//
// Reglas de alcance (Tabla 1):
//   - Administrador general: gestiona cualquier usuario y designa a los
//     administradores de tienda.
//   - Administrador de tienda: solo gestiona usuarios operativos (cajero,
//     auxiliar de bodega) de su propia tienda.
type UserService interface {
	// List retorna los usuarios de la tienda (nil = todas), opcionalmente ordenados.
	// sortBy: "username" → QuickSort, "nombre" → MergeSort, "" → sin ordenar.
	List(venueID *uint, sortBy string) ([]models.User, error)
	GetByID(id uint) (*models.User, error)
	// Create recibe el usuario y la contraseña en texto plano; la hashea (HU005).
	Create(actor *TokenClaims, u *models.User, plainPassword string) error
	// Update recibe newPlainPassword vacío si no se quiere cambiar la contraseña.
	// previous es el estado del usuario antes de los cambios (para validar alcance).
	Update(actor *TokenClaims, previous models.User, u *models.User, newPlainPassword string) error
	Delete(id uint) error
	// ChangePassword cambia la contraseña del usuario autenticado (HU010).
	ChangePassword(userID uint, newPassword, confirmPassword string) error
	// Deactivate desactiva la cuenta de un usuario (HU011 — eliminación lógica).
	Deactivate(actor *TokenClaims, id uint) error
}

type userService struct {
	repo     repository.UserRepository
	venueSvc VenueService
}

func NewUserService(repo repository.UserRepository, venueSvc VenueService) UserService {
	return &userService{repo: repo, venueSvc: venueSvc}
}

// List retorna los usuarios ordenados según el criterio indicado:
//   - "username" → QuickSort (in-place, O(n log n) promedio)
//   - "nombre"   → MergeSort (estable, O(n log n) garantizado)
//   - cualquier otro valor → orden por defecto de la BD
func (s *userService) List(venueID *uint, sortBy string) ([]models.User, error) {
	users, err := s.repo.FindAll(venueID)
	if err != nil {
		return nil, err
	}

	switch strings.ToLower(sortBy) {
	case "username":
		algorithms.QuickSort(users, func(a, b models.User) bool {
			return strings.ToLower(a.Username) < strings.ToLower(b.Username)
		})
	case "nombre", "name":
		users = algorithms.MergeSort(users, func(a, b models.User) bool {
			return strings.ToLower(a.Nombre) < strings.ToLower(b.Nombre)
		})
	}

	return users, nil
}

func (s *userService) GetByID(id uint) (*models.User, error) {
	return s.repo.FindByID(id)
}

// authorizeTarget verifica que el actor pueda gestionar un usuario con el rol
// y la tienda indicados.
func authorizeTarget(actor *TokenClaims, rol models.RolUsuario, sedeID *uint) error {
	switch actor.Rol {
	case models.RolAdmin:
		return nil
	case models.RolAdminTienda:
		if !rol.IsOperational() {
			return ErrForbiddenRole
		}
		if actor.SedeID == nil || sedeID == nil || *sedeID != *actor.SedeID {
			return ErrForbiddenStore
		}
		return nil
	default:
		return ErrForbiddenRole
	}
}

// Create persiste el usuario aplicando las reglas de negocio:
//  1. El username debe ser único.
//  2. Los roles de tienda requieren una tienda válida; el admin general no la tiene.
//  3. El admin de tienda solo crea usuarios operativos en su tienda.
//  4. La contraseña se hashea con bcrypt cost 12 (HU005).
func (s *userService) Create(actor *TokenClaims, u *models.User, plainPassword string) error {
	if plainPassword == "" {
		return ErrPasswordRequired
	}

	// El admin de tienda siempre crea usuarios en su propia tienda.
	if actor.Rol == models.RolAdminTienda {
		u.SedeID = actor.SedeID
	}
	if err := authorizeTarget(actor, u.Rol, u.SedeID); err != nil {
		return err
	}
	if err := s.validateRoleSede(u.Rol, u.SedeID); err != nil {
		return err
	}

	// Unicidad de username.
	if existing, err := s.repo.FindByUsername(u.Username); err == nil && existing != nil {
		return ErrUsernameTaken
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), 12)
	if err != nil {
		return err
	}
	u.PasswordHash = string(hash)

	return s.repo.Create(u)
}

// Update aplica las reglas de alcance sobre el estado previo y el nuevo, y
// rehashea la contraseña solo si se proporciona una nueva.
func (s *userService) Update(actor *TokenClaims, previous models.User, u *models.User, newPlainPassword string) error {
	if err := authorizeTarget(actor, previous.Rol, previous.SedeID); err != nil {
		return err
	}
	if err := authorizeTarget(actor, u.Rol, u.SedeID); err != nil {
		return err
	}
	if err := s.validateRoleSede(u.Rol, u.SedeID); err != nil {
		return err
	}

	if newPlainPassword != "" {
		if len(newPlainPassword) < 8 {
			return ErrPasswordTooShort
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(newPlainPassword), 12)
		if err != nil {
			return err
		}
		u.PasswordHash = string(hash)
	}
	return s.repo.Update(u)
}

func (s *userService) Delete(id uint) error {
	return s.repo.Delete(id)
}

// ChangePassword implementa HU010: permite al usuario cambiar su propia contraseña.
func (s *userService) ChangePassword(userID uint, newPassword, confirmPassword string) error {
	if newPassword != confirmPassword {
		return ErrPasswordMismatch
	}
	if len(newPassword) < 8 {
		return ErrPasswordTooShort
	}

	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12)
	if err != nil {
		return err
	}
	user.PasswordHash = string(hash)

	return s.repo.Update(user)
}

// Deactivate implementa HU011: desactivación lógica de la cuenta de un usuario.
// RN-12: un usuario inactivo no puede iniciar sesión.
func (s *userService) Deactivate(actor *TokenClaims, id uint) error {
	user, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if err := authorizeTarget(actor, user.Rol, user.SedeID); err != nil {
		return err
	}
	user.Activo = false
	return s.repo.Update(user)
}

// validateRoleSede aplica la regla rol/tienda y verifica que la tienda exista.
func (s *userService) validateRoleSede(rol models.RolUsuario, sedeID *uint) error {
	switch {
	case rol == models.RolAdmin:
		if sedeID != nil {
			return ErrSedeNotAllowed
		}
		return nil
	case rol.RequiresStore():
		if sedeID == nil {
			return ErrSedeRequired
		}
	default:
		return ErrInvalidRole
	}

	if _, err := s.venueSvc.GetByID(*sedeID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSedeNotFound
		}
		return err
	}
	return nil
}
