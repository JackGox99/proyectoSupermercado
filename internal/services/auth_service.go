package services

import (
	"errors"
	"fmt"
	"time"

	"supermercado-inventory-api/config"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// TokenClaims contiene la información extraída de un JWT válido.
// Son los claims custom que el middleware usa para autorizar requests.
type TokenClaims struct {
	UserID   uint              `json:"user_id"`
	Username string            `json:"username"`
	Rol      models.RolUsuario `json:"rol"`
	SedeID   *uint             `json:"sede_id,omitempty"`
}

// jwtClaims combina los claims custom con los claims estándar de JWT (exp, iat, etc.).
type jwtClaims struct {
	TokenClaims
	jwt.RegisteredClaims
}

// LoginResponse es la respuesta que recibe el cliente tras autenticarse con éxito.
// Incluye el rol y la tienda para que el frontend pueda enrutar correctamente (HU006).
type LoginResponse struct {
	UserID   uint              `json:"user_id"`
	Token    string            `json:"token"`
	Username string            `json:"username"`
	Nombre   string            `json:"nombre"`
	Rol      models.RolUsuario `json:"rol"`
	SedeID   *uint             `json:"sede_id"`
	Sede     *models.Venue     `json:"sede,omitempty"`
}

// AuthService define el contrato de autenticación y autorización.
type AuthService interface {
	// Login autentica al usuario. Si las credenciales identifican a un usuario
	// existente, también lo retorna (aunque falle) para registrar el intento
	// en la bitácora de auditoría.
	Login(username, password string) (*LoginResponse, *models.User, error)
	ValidateToken(token string) (*TokenClaims, error)
}

type authService struct {
	userRepo repository.UserRepository
	cfg      *config.Config
}

// NewAuthService construye el servicio inyectando sus dependencias por interfaz (DIP).
func NewAuthService(userRepo repository.UserRepository, cfg *config.Config) AuthService {
	return &authService{userRepo: userRepo, cfg: cfg}
}

// Login autentica un usuario por username verificando bcrypt (HU005) y emite un
// JWT firmado con HS256 (HU008). Siempre devuelve el mismo error genérico para
// evitar enumeración de usuarios.
func (s *authService) Login(username, password string) (*LoginResponse, *models.User, error) {
	user, err := s.userRepo.FindByUsername(username)
	if err != nil {
		return nil, nil, errors.New("usuario o contraseña incorrectos")
	}

	// RN-12: el estado se verifica ANTES que la contraseña, de modo que la
	// respuesta para un usuario inactivo no revela si la contraseña era correcta.
	if !user.Activo {
		return nil, user, ErrUserInactive
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, user, errors.New("usuario o contraseña incorrectos")
	}

	// Una tienda inactivada por el administrador general deja de operar.
	if user.Sede != nil && !user.Sede.Activa {
		return nil, user, ErrStoreInactive
	}

	token, err := s.signJWT(user)
	if err != nil {
		return nil, user, fmt.Errorf("could not generate token: %w", err)
	}

	return &LoginResponse{
		UserID:   user.ID,
		Token:    token,
		Username: user.Username,
		Nombre:   user.Nombre,
		Rol:      user.Rol,
		SedeID:   user.SedeID,
		Sede:     user.Sede,
	}, user, nil
}

// ValidateToken verifica la firma y vigencia de un JWT y extrae sus claims.
func (s *authService) ValidateToken(tokenStr string) (*TokenClaims, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &jwtClaims{}, func(t *jwt.Token) (interface{}, error) {
		// Garantiza que el algoritmo de firma sea el esperado (HS256) para prevenir
		// ataques de "alg: none" o downgrade a algoritmos asimétricos.
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := parsed.Claims.(*jwtClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}

	return &claims.TokenClaims, nil
}

// signJWT genera un token HS256 con claims del usuario y expiración configurable.
func (s *authService) signJWT(user *models.User) (string, error) {
	expiry := time.Duration(s.cfg.JWTExpiryHours) * time.Hour
	now := time.Now()

	claims := jwtClaims{
		TokenClaims: TokenClaims{
			UserID:   user.ID,
			Username: user.Username,
			Rol:      user.Rol,
			SedeID:   user.SedeID,
		},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "supermercado-inventory-api",
			Subject:   fmt.Sprintf("%d", user.ID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(expiry)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
