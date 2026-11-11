package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/services"
)

// CtxStoreID guarda en el contexto la tienda sobre la que opera la petición
// (*uint; nil = vista consolidada de todas las tiendas, solo admin general).
const CtxStoreID = "store_id"

// StoreHeader es el header con el que el cliente web indica la tienda activa.
const StoreHeader = "X-Store-ID"

// StoreScope resuelve la tienda de cada petición (RN-04):
//
//   - Administrador general: opera sobre la tienda que eligió en el selector
//     (header X-Store-ID o query ?venue_id=). Sin tienda → vista consolidada.
//   - Resto de roles: siempre su tienda asignada (claim del JWT). Si la
//     petición intenta apuntar a otra tienda se rechaza con 403, y el 403
//     queda registrado en la bitácora como acceso denegado.
//
// Debe usarse después de AuthRequired.
func StoreScope() gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, ok := ClaimsFrom(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "autenticación requerida"})
			return
		}

		requested := c.GetHeader(StoreHeader)
		if requested == "" {
			requested = c.Query("venue_id")
		}
		var requestedID *uint
		if requested != "" {
			id, err := strconv.ParseUint(requested, 10, 64)
			if err != nil || id == 0 {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "identificador de tienda inválido"})
				return
			}
			v := uint(id)
			requestedID = &v
		}

		if claims.Rol == models.RolAdmin {
			c.Set(CtxStoreID, requestedID)
			c.Next()
			return
		}

		if claims.SedeID == nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "el usuario no tiene tienda asignada"})
			return
		}
		if requestedID != nil && *requestedID != *claims.SedeID {
			SetAuditDetail(c, "RN-04: intento de operar una tienda no asignada")
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": services.ErrForbiddenStore.Error()})
			return
		}
		c.Set(CtxStoreID, claims.SedeID)
		c.Next()
	}
}

// StoreFrom retorna la tienda resuelta por StoreScope (nil = todas).
func StoreFrom(c *gin.Context) *uint {
	if v, ok := c.Get(CtxStoreID); ok {
		if id, ok := v.(*uint); ok {
			return id
		}
	}
	return nil
}

// ClaimsFrom retorna los claims del usuario autenticado.
func ClaimsFrom(c *gin.Context) (*services.TokenClaims, bool) {
	raw, exists := c.Get(CtxClaims)
	if !exists {
		return nil, false
	}
	claims, ok := raw.(*services.TokenClaims)
	return claims, ok
}
