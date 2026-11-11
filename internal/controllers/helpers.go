package controllers

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"supermercado-inventory-api/internal/middleware"
	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/services"
)

// extractClaims extrae los JWT claims del contexto Gin y responde 401 si faltan.
func extractClaims(c *gin.Context) (*services.TokenClaims, bool) {
	claims, ok := middleware.ClaimsFrom(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "autenticación requerida"})
		return nil, false
	}
	return claims, true
}

// storeScope retorna la tienda de la petición (nil = consolidado, solo admin general).
func storeScope(c *gin.Context) *uint {
	return middleware.StoreFrom(c)
}

// requireStore exige que la petición opere sobre una tienda concreta.
func requireStore(c *gin.Context) (uint, bool) {
	store := storeScope(c)
	if store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrStoreRequired.Error()})
		return 0, false
	}
	return *store, true
}

// ensureStoreAccess aplica RN-04 sobre un recurso ya cargado: los roles de
// tienda solo acceden a recursos de su tienda. El admin general accede a todo.
func ensureStoreAccess(c *gin.Context, sedeID uint) bool {
	claims, ok := middleware.ClaimsFrom(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "autenticación requerida"})
		return false
	}
	if claims.Rol == models.RolAdmin {
		return true
	}
	if claims.SedeID == nil || *claims.SedeID != sedeID {
		middleware.SetAuditDetail(c, "RN-04: recurso de otra tienda")
		c.JSON(http.StatusForbidden, gin.H{"error": services.ErrForbiddenStore.Error()})
		return false
	}
	return true
}

// parseID lee un parámetro numérico de la ruta y responde 400 si es inválido.
func parseID(c *gin.Context, name string) (uint, bool) {
	id, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "identificador inválido: " + name})
		return 0, false
	}
	return uint(id), true
}

// parseDateRange lee los query params from/to (YYYY-MM-DD). `to` incluye el día completo.
func parseDateRange(c *gin.Context) (from, to *time.Time) {
	if v := c.Query("from"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			from = &t
		}
	}
	if v := c.Query("to"); v != "" {
		if t, err := time.ParseInLocation("2006-01-02", v, time.Local); err == nil {
			end := t.Add(24*time.Hour - time.Second)
			to = &end
		}
	}
	return from, to
}

var (
	conflictErrors = []error{
		services.ErrUsernameTaken, services.ErrVenueNameTaken, services.ErrProductNameTaken,
		services.ErrCategoryNameTaken, services.ErrOrderNotOpen, services.ErrOrderNotPaid,
		services.ErrShiftAlreadyOpen, services.ErrShiftHasOpenOrders, services.ErrShiftExists,
		services.ErrShiftNotOpen, services.ErrShiftNotScheduled, services.ErrNegativeStock,
		services.ErrNoOpenShift,
	}
	forbiddenErrors = []error{
		services.ErrForbiddenStore, services.ErrForbiddenRole, services.ErrOrderNotOwner,
	}
	validationErrors = []error{
		services.ErrVenueNameRequired, services.ErrVenueAddrRequired, services.ErrInvalidColor,
		services.ErrSedeRequired, services.ErrSedeNotAllowed, services.ErrSedeNotFound,
		services.ErrInvalidRole, services.ErrPasswordRequired, services.ErrPasswordTooShort,
		services.ErrPasswordMismatch, services.ErrInvalidDate, services.ErrCategoryNameRequired,
		services.ErrProductNameRequired, services.ErrCategoryNotFound, services.ErrBarcodeRequired,
		services.ErrInvalidUnit, services.ErrInvalidStockMinimum, services.ErrInvalidPrice,
		services.ErrInvalidPurchaseCost, services.ErrPurchaseExceedsSale, services.ErrInvalidQuantity,
		services.ErrInvalidAdjustment, services.ErrReasonRequired, services.ErrInvalidItemQuantity,
		services.ErrInvalidPaymentMethod, services.ErrEmptyOrder, services.ErrVoidReasonRequired,
		services.ErrShiftNotToday, services.ErrInvalidShiftTime, services.ErrShiftInPast,
		services.ErrShiftUserInvalid,
	}
)

func isAny(err error, list []error) bool {
	for _, e := range list {
		if errors.Is(err, e) {
			return true
		}
	}
	return false
}

// respondError traduce los errores de negocio a códigos HTTP. Los errores no
// previstos se registran en el log del servidor y se responden con un mensaje
// genérico, sin exponer información sensible del sistema.
func respondError(c *gin.Context, err error) {
	var (
		stockErr   *services.ErrInsufficientStock
		expiredErr *services.ErrProductExpired
		barcodeErr *services.BarcodeTakenError
	)
	middleware.SetAuditDetail(c, err.Error())

	switch {
	case errors.As(err, &barcodeErr):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "existing_product_id": barcodeErr.ExistingID})
	case errors.As(err, &stockErr):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "available": stockErr.Available})
	case errors.As(err, &expiredErr):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "expired": true})
	case errors.Is(err, services.ErrStoreRequired):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, services.ErrProductNotFound), errors.Is(err, gorm.ErrRecordNotFound):
		msg := "no encontrado"
		if errors.Is(err, services.ErrProductNotFound) {
			msg = err.Error()
		}
		c.JSON(http.StatusNotFound, gin.H{"error": msg})
	case isAny(err, forbiddenErrors):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case isAny(err, conflictErrors):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
	case isAny(err, validationErrors):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	default:
		log.Printf("error interno en %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no fue posible completar la operación, intente de nuevo"})
	}
}
