package controllers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/services"
)

// UserController maneja usuarios y la información del personal (RF-02 / RF-10).
type UserController struct {
	service services.UserService
}

func NewUserController(service services.UserService) *UserController {
	return &UserController{service: service}
}

// createUserRequest es el DTO de entrada para registrar personal.
type createUserRequest struct {
	Username     string `json:"username"      binding:"required,min=3,max=50"`
	FullName     string `json:"full_name"     binding:"required,min=2,max=150"`
	Password     string `json:"password"      binding:"required,min=8"`
	Role         string `json:"role"          binding:"required"`
	SedeID       *uint  `json:"sede_id"`
	Email        string `json:"email"`
	Documento    string `json:"documento"     binding:"max=20"`
	Telefono     string `json:"telefono"      binding:"max=30"`
	FechaIngreso string `json:"fecha_ingreso"`
}

// updateUserRequest permite actualizar datos del usuario. Los campos vacíos
// no se modifican; Password vacío conserva la contraseña actual.
type updateUserRequest struct {
	Nombre       string  `json:"nombre"`
	Role         string  `json:"role"`
	Rol          string  `json:"rol"`
	Activo       *bool   `json:"activo"`
	Password     string  `json:"password"`
	SedeID       *uint   `json:"sede_id"`
	Email        *string `json:"email"`
	Documento    *string `json:"documento"`
	Telefono     *string `json:"telefono"`
	FechaIngreso *string `json:"fecha_ingreso"`
}

// roleFromRequest acepta el valor ENUM o el alias en inglés de la interfaz.
func roleFromRequest(role string) models.RolUsuario {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin", "administrator", "general admin":
		return models.RolAdmin
	case "admin_tienda", "store admin", "store administrator":
		return models.RolAdminTienda
	case "cajero", "cashier":
		return models.RolCajero
	case "auxiliar_bodega", "warehouse assistant":
		return models.RolAuxiliarBodega
	default:
		return ""
	}
}

func parseOptionalDate(s string) (*time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	t, err := time.ParseInLocation("2006-01-02", s, time.Local)
	if err != nil {
		return nil, services.ErrInvalidDate
	}
	return &t, nil
}

// List retorna el personal de la tienda activa (admin general sin tienda: todos).
// Query `sort_by`: "username" (QuickSort) o "nombre"/"name" (MergeSort).
func (uc *UserController) List(c *gin.Context) {
	users, err := uc.service.List(storeScope(c), c.Query("sort_by"))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, users)
}

func (uc *UserController) GetByID(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	user, err := uc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	if user.SedeID != nil && !ensureStoreAccess(c, *user.SedeID) {
		return
	}
	c.JSON(http.StatusOK, user)
}

// Create registra un usuario. El admin general crea cualquier rol (incluido el
// admin de tienda); el admin de tienda solo crea cajeros y auxiliares de bodega
// en su propia tienda.
func (uc *UserController) Create(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "usuario (3+), nombre completo y contraseña (8+ caracteres) son obligatorios"})
		return
	}

	rol := roleFromRequest(req.Role)
	if rol == "" {
		respondError(c, services.ErrInvalidRole)
		return
	}
	fecha, err := parseOptionalDate(req.FechaIngreso)
	if err != nil {
		respondError(c, err)
		return
	}

	user := &models.User{
		Username:     strings.TrimSpace(req.Username),
		Nombre:       strings.TrimSpace(req.FullName),
		Rol:          rol,
		SedeID:       req.SedeID,
		Documento:    strings.TrimSpace(req.Documento),
		Telefono:     strings.TrimSpace(req.Telefono),
		FechaIngreso: fecha,
		Activo:       true,
	}
	if rol == models.RolAdmin {
		user.SedeID = nil
	}
	if e := strings.TrimSpace(req.Email); e != "" {
		user.Email = &e
	}

	if err := uc.service.Create(claims, user, req.Password); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, user.ID)
	middleware.SetAuditDetail(c, "Usuario creado: "+user.Username+" ("+string(user.Rol)+")")
	c.JSON(http.StatusCreated, gin.H{"message": "Usuario creado correctamente", "user": user})
}

// Update modifica rol, tienda, estado y datos del personal.
func (uc *UserController) Update(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	user, err := uc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	previous := *user

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if n := strings.TrimSpace(req.Nombre); n != "" {
		user.Nombre = n
	}
	if req.Activo != nil {
		user.Activo = *req.Activo
	}
	if req.Email != nil {
		if e := strings.TrimSpace(*req.Email); e != "" {
			user.Email = &e
		} else {
			user.Email = nil
		}
	}
	if req.Documento != nil {
		user.Documento = strings.TrimSpace(*req.Documento)
	}
	if req.Telefono != nil {
		user.Telefono = strings.TrimSpace(*req.Telefono)
	}
	if req.FechaIngreso != nil {
		fecha, err := parseOptionalDate(*req.FechaIngreso)
		if err != nil {
			respondError(c, err)
			return
		}
		user.FechaIngreso = fecha
	}

	roleStr := req.Role
	if roleStr == "" {
		roleStr = req.Rol
	}
	if roleStr != "" {
		parsed := roleFromRequest(roleStr)
		if parsed == "" {
			respondError(c, services.ErrInvalidRole)
			return
		}
		user.Rol = parsed
	}
	if user.Rol == models.RolAdmin {
		user.SedeID = nil
	} else if req.SedeID != nil {
		user.SedeID = req.SedeID
	}
	user.Sede = nil

	if err := uc.service.Update(claims, previous, user, req.Password); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, "Usuario actualizado: "+user.Username+" (rol "+string(user.Rol)+")")
	c.JSON(http.StatusOK, gin.H{"message": "Usuario actualizado correctamente", "user": user})
}

// Deactivate implementa HU011 — inactivación lógica (RN-12).
func (uc *UserController) Deactivate(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if id == claims.UserID {
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "no puede inactivar su propia cuenta"})
		return
	}
	if err := uc.service.Deactivate(claims, id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Usuario inactivado correctamente"})
}

func (uc *UserController) Delete(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := uc.service.Delete(id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
