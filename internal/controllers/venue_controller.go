package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/services"
)

// VenueController gestiona las tiendas (RF-01 / CU-09) y el panel de cada una.
type VenueController struct {
	service services.VenueService
}

func NewVenueController(service services.VenueService) *VenueController {
	return &VenueController{service: service}
}

type venueRequest struct {
	Nombre    string `json:"nombre"    binding:"required,max=100"`
	Direccion string `json:"direccion" binding:"required,max=255"`
	Telefono  string `json:"telefono"  binding:"max=30"`
	Color     string `json:"color"`
}

// List devuelve las tiendas visibles para el usuario:
//   - Admin general: todas (las inactivas solo con ?all=1).
//   - Resto: únicamente su tienda asignada.
func (vc *VenueController) List(c *gin.Context) {
	claims, ok := extractClaims(c)
	if !ok {
		return
	}
	if claims.Rol != models.RolAdmin {
		v, err := vc.service.GetByID(*claims.SedeID)
		if err != nil {
			respondError(c, err)
			return
		}
		c.JSON(http.StatusOK, []models.Venue{*v})
		return
	}
	venues, err := vc.service.List(c.Query("all") == "1")
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, venues)
}

// Overview alimenta el selector de tiendas del administrador general: cada
// tienda con sus indicadores (incluye inactivas para poder reactivarlas).
func (vc *VenueController) Overview(c *gin.Context) {
	rows, err := vc.service.Overview(nil, true)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, rows)
}

// Dashboard retorna los indicadores de la tienda activa. Para el admin
// general sin tienda seleccionada retorna el consolidado de todas.
func (vc *VenueController) Dashboard(c *gin.Context) {
	store := storeScope(c)
	rows, err := vc.service.Overview(store, false)
	if err != nil {
		respondError(c, err)
		return
	}
	if store != nil {
		if len(rows) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "tienda no encontrada o inactiva"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"store": rows[0], "stores": rows})
		return
	}
	c.JSON(http.StatusOK, gin.H{"store": nil, "stores": rows})
}

// Create registra una tienda (solo admin general — RN-06).
func (vc *VenueController) Create(c *gin.Context) {
	var req venueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nombre y dirección son obligatorios"})
		return
	}
	v := &models.Venue{Nombre: req.Nombre, Direccion: req.Direccion, Telefono: req.Telefono, Color: req.Color}
	if err := vc.service.Create(v); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditEntityID(c, v.ID)
	middleware.SetAuditDetail(c, "Tienda creada: "+v.Nombre)
	c.JSON(http.StatusCreated, v)
}

// Update configura los datos de una tienda (solo admin general — RN-06).
func (vc *VenueController) Update(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	v, err := vc.service.GetByID(id)
	if err != nil {
		respondError(c, err)
		return
	}
	var req venueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nombre y dirección son obligatorios"})
		return
	}
	v.Nombre, v.Direccion, v.Telefono, v.Color = req.Nombre, req.Direccion, req.Telefono, req.Color
	if err := vc.service.Update(v); err != nil {
		respondError(c, err)
		return
	}
	middleware.SetAuditDetail(c, "Tienda configurada: "+v.Nombre)
	c.JSON(http.StatusOK, v)
}

// SetStatus activa o inactiva una tienda (solo admin general — RN-06).
// Los usuarios de una tienda inactiva no pueden iniciar sesión.
func (vc *VenueController) SetStatus(c *gin.Context) {
	id, ok := parseID(c, "id")
	if !ok {
		return
	}
	var req struct {
		Activa *bool `json:"activa" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "el campo activa es obligatorio"})
		return
	}
	v, err := vc.service.SetActive(id, *req.Activa)
	if err != nil {
		respondError(c, err)
		return
	}
	estado := "inactivada"
	if v.Activa {
		estado = "activada"
	}
	middleware.SetAuditDetail(c, "Tienda "+estado+": "+v.Nombre)
	c.JSON(http.StatusOK, v)
}
