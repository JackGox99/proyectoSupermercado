package controllers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/services"
)

// AuthController maneja las peticiones HTTP de autenticación (CU-10).
type AuthController struct {
	service services.AuthService
}

func NewAuthController(service services.AuthService) *AuthController {
	return &AuthController{service: service}
}

type loginRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

// Login autentica al usuario y retorna el JWT con su rol y tienda (HU006/HU008).
// Tanto los inicios de sesión exitosos como los fallidos quedan en la bitácora.
func (ac *AuthController) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usuario y contraseña son obligatorios"})
		return
	}

	identifier := req.Username
	if identifier == "" {
		identifier = req.Email
	}
	if identifier == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el usuario es obligatorio"})
		return
	}

	resp, user, err := ac.service.Login(identifier, req.Password)
	if user != nil {
		middleware.SetAuditActor(c, user)
	}
	if err != nil {
		detail := "Credenciales inválidas para " + identifier
		switch {
		case errors.Is(err, services.ErrUserInactive):
			detail = "RN-12: intento de acceso de usuario inactivo " + identifier
		case errors.Is(err, services.ErrStoreInactive):
			detail = "Intento de acceso a tienda inactiva: " + identifier
		}
		middleware.SetAuditDetail(c, detail)
		status := http.StatusUnauthorized
		if errors.Is(err, services.ErrUserInactive) || errors.Is(err, services.ErrStoreInactive) {
			status = http.StatusForbidden
		}
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}

	middleware.SetAuditDetail(c, "Inicio de sesión")
	c.JSON(http.StatusOK, resp)
}

// Logout: con JWT stateless el cliente descarta el token localmente.
func (ac *AuthController) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "sesión cerrada"})
}
