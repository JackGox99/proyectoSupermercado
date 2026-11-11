package controllers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// ShiftController gestiona los turnos del personal (RF-11 / CU-07).
type ShiftController struct {
	service services.ShiftService
}

func NewShiftController(service services.ShiftService) *ShiftController {
	return &ShiftController{service: service}
}

// List retorna turnos con filtros ?from=&to=&usuario_id=&estado=.
//   - Administradores: los turnos de la tienda activa.
//   - Cajero / auxiliar de bodega: solo sus propios turnos.
func (sc *ShiftController) List(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	from, to := parseDateRange(c)
	f := repository.ShiftFilter{VenueID: storeScope(c), From: from, To: to, Estado: c.Query("estado")}
	if claims.Rol.IsOperational() {
		uid := claims.UserID
		f.UsuarioID = &uid
	} else if q := c.Query("usuario_id"); q != "" {
		var uid uint
		if _, err := fmt.Sscan(q, &uid); err == nil {
			f.UsuarioID = &uid
		}
	}
	shifts, err := sc.service.List(f)
	if err != nil {
		respondError(c, err)
		return
	}
	if shifts == nil {
		shifts = []models.Shift{}
	}
	c.JSON(http.StatusOK, shifts)
}

// Current retorna el turno abierto del usuario autenticado (o null).
func (sc *ShiftController) Current(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	shift, err := sc.service.Current(claims.UserID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"shift": shift})
}

// Assign programa un turno para un empleado (admin de tienda / admin general).
func (sc *ShiftController) Assign(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	var body struct {
		UsuarioID  uint   `json:"usuario_id"  binding:"required"`
		Fecha      string `json:"fecha"       binding:"required"`
		HoraInicio string `json:"hora_inicio" binding:"required"`
		HoraFin    string `json:"hora_fin"    binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empleado, fecha, hora de inicio y hora de fin son obligatorios"})
		return
	}
	shift, err := sc.service.Assign(claims, body.UsuarioID, body.Fecha, body.HoraInicio, body.HoraFin)
	if err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, shift.ID)
	nombre := ""
	if shift.Usuario != nil {
		nombre = shift.Usuario.Nombre
	}
	middleware.SetAuditDetail(c, fmt.Sprintf("Turno asignado a %s: %s %s-%s", nombre, body.Fecha, body.HoraInicio, body.HoraFin))
	c.JSON(http.StatusCreated, shift)
}

// Delete elimina un turno programado que aún no se ha iniciado.
func (sc *ShiftController) Delete(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	if err := sc.service.Delete(claims, id); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "turno eliminado"})
}

// Open inicia el turno del día del usuario autenticado.
func (sc *ShiftController) Open(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	shift, err := sc.service.Open(claims, id)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, shift)
}

// Close cierra el turno y devuelve el resumen de caja del turno.
func (sc *ShiftController) Close(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	shift, err := sc.service.Close(claims, id)
	if err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, fmt.Sprintf("Cierre de turno: %d venta(s), total $%.0f", shift.NumVentas, shift.TotalVentas))
	c.JSON(http.StatusOK, shift)
}
