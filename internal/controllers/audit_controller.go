package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// AuditController expone la consulta de la bitácora de auditoría (RF-13).
type AuditController struct {
	service services.AuditService
}

func NewAuditController(service services.AuditService) *AuditController {
	return &AuditController{service: service}
}

// List retorna la bitácora de la tienda activa (admin general sin tienda: toda).
// Filtros: ?from=&to=&accion=&usuario=&resultado=.
func (ac *AuditController) List(c *gin.Context) {
	from, to := parseDateRange(c)
	logs, err := ac.service.List(repository.AuditFilter{
		VenueID:   storeScope(c),
		From:      from,
		To:        to,
		Accion:    c.Query("accion"),
		Username:  c.Query("usuario"),
		Resultado: c.Query("resultado"),
	})
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, logs)
}
