package services

import (
	"regexp"
	"time"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
)

// Horario de operación del supermercado (RNF-03): 06:00 a 22:00.
const (
	OpeningTime = "06:00"
	ClosingTime = "22:00"
)

var hhmm = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)

// ShiftService gestiona los turnos del personal (RF-11 / CU-07).
//
// El administrador de tienda (o el general) asigna turnos; cada empleado
// inicia y cierra su propio turno. Las ventas del cajero se asocian a su turno
// abierto (RN-09) y al cerrarlo se calcula el resumen de caja.
type ShiftService interface {
	List(f repository.ShiftFilter) ([]models.Shift, error)
	Assign(actor *TokenClaims, userID uint, fecha, inicio, fin string) (*models.Shift, error)
	Delete(actor *TokenClaims, id uint) error
	// Current retorna el turno abierto del usuario, o nil si no tiene.
	Current(userID uint) (*models.Shift, error)
	Open(actor *TokenClaims, id uint) (*models.Shift, error)
	Close(actor *TokenClaims, id uint) (*models.Shift, error)
}

type shiftService struct {
	repo      repository.ShiftRepository
	userRepo  repository.UserRepository
	orderRepo repository.OrderRepository
}

func NewShiftService(repo repository.ShiftRepository, userRepo repository.UserRepository, orderRepo repository.OrderRepository) ShiftService {
	return &shiftService{repo: repo, userRepo: userRepo, orderRepo: orderRepo}
}

func today() time.Time {
	y, m, d := time.Now().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.Local)
}

// canManageStore indica si el actor administra la tienda indicada.
func canManageStore(actor *TokenClaims, sedeID uint) bool {
	switch actor.Rol {
	case models.RolAdmin:
		return true
	case models.RolAdminTienda:
		return actor.SedeID != nil && *actor.SedeID == sedeID
	}
	return false
}

func (s *shiftService) List(f repository.ShiftFilter) ([]models.Shift, error) {
	return s.repo.FindAll(f)
}

func (s *shiftService) Assign(actor *TokenClaims, userID uint, fecha, inicio, fin string) (*models.Shift, error) {
	user, err := s.userRepo.FindByID(userID)
	if err != nil {
		return nil, ErrShiftUserInvalid
	}
	if !user.Activo || !user.Rol.IsOperational() || user.SedeID == nil {
		return nil, ErrShiftUserInvalid
	}
	if !canManageStore(actor, *user.SedeID) {
		return nil, ErrForbiddenStore
	}

	day, err := time.ParseInLocation("2006-01-02", fecha, time.Local)
	if err != nil {
		return nil, ErrInvalidDate
	}
	if day.Before(today()) {
		return nil, ErrShiftInPast
	}
	// Las horas HH:MM con cero a la izquierda se comparan correctamente como texto.
	if !hhmm.MatchString(inicio) || !hhmm.MatchString(fin) ||
		inicio >= fin || inicio < OpeningTime || fin > ClosingTime {
		return nil, ErrInvalidShiftTime
	}
	exists, err := s.repo.ExistsForUserOnDate(userID, day)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrShiftExists
	}

	shift := &models.Shift{
		SedeID:        *user.SedeID,
		UsuarioID:     userID,
		Fecha:         day,
		HoraInicio:    inicio,
		HoraFin:       fin,
		Estado:        models.TurnoProgramado,
		AsignadoPorID: actor.UserID,
	}
	if err := s.repo.Create(shift); err != nil {
		return nil, err
	}
	return s.repo.FindByID(shift.ID)
}

func (s *shiftService) Delete(actor *TokenClaims, id uint) error {
	shift, err := s.repo.FindByID(id)
	if err != nil {
		return err
	}
	if !canManageStore(actor, shift.SedeID) {
		return ErrForbiddenStore
	}
	if shift.Estado != models.TurnoProgramado {
		return ErrShiftNotScheduled
	}
	return s.repo.Delete(id)
}

func (s *shiftService) Current(userID uint) (*models.Shift, error) {
	return s.repo.FindOpenByUser(userID)
}

func (s *shiftService) Open(actor *TokenClaims, id uint) (*models.Shift, error) {
	shift, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if shift.UsuarioID != actor.UserID {
		return nil, ErrForbiddenRole
	}
	if shift.Estado != models.TurnoProgramado {
		return nil, ErrShiftNotScheduled
	}
	if shift.Fecha.Format("2006-01-02") != today().Format("2006-01-02") {
		return nil, ErrShiftNotToday
	}
	open, err := s.repo.FindOpenByUser(actor.UserID)
	if err != nil {
		return nil, err
	}
	if open != nil {
		return nil, ErrShiftAlreadyOpen
	}

	now := time.Now()
	shift.Estado = models.TurnoAbierto
	shift.AbiertoAt = &now
	if err := s.repo.Update(shift); err != nil {
		return nil, err
	}
	return shift, nil
}

// Close cierra el turno y guarda el resumen de caja. Lo puede cerrar el propio
// empleado o un administrador de su tienda (p. ej. si el cajero olvidó cerrarlo).
func (s *shiftService) Close(actor *TokenClaims, id uint) (*models.Shift, error) {
	shift, err := s.repo.FindByID(id)
	if err != nil {
		return nil, err
	}
	if shift.UsuarioID != actor.UserID && !canManageStore(actor, shift.SedeID) {
		return nil, ErrForbiddenRole
	}
	if shift.Estado != models.TurnoAbierto {
		return nil, ErrShiftNotOpen
	}
	openOrders, err := s.orderRepo.CountOpenByShift(id)
	if err != nil {
		return nil, err
	}
	if openOrders > 0 {
		return nil, ErrShiftHasOpenOrders
	}

	summary, err := s.repo.SalesSummary(id)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	shift.Estado = models.TurnoCerrado
	shift.CerradoAt = &now
	shift.NumVentas = summary.NumVentas
	shift.TotalVentas = summary.TotalVentas
	shift.TotalEfectivo = summary.TotalEfectivo
	shift.TotalDebito = summary.TotalDebito
	shift.TotalCredito = summary.TotalCredito
	if err := s.repo.Update(shift); err != nil {
		return nil, err
	}
	return shift, nil
}
