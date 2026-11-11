package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/services"
)

// AlertController expone las alertas de stock mínimo y vencimiento (RF-09).
type AlertController struct {
	service services.AlertService
}

func NewAlertController(service services.AlertService) *AlertController {
	return &AlertController{service: service}
}

// List retorna las alertas vigentes de la tienda activa.
func (ac *AlertController) List(c *gin.Context) {
	alerts, err := ac.service.List(storeScope(c))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"alerts": alerts, "expiry_window_days": services.ExpiryWarningDays})
}
