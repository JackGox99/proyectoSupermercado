package middleware

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/models"
)

// Claves de contexto usadas para describir la operación auditada.
const (
	ctxAuditAction   = "audit_action"
	ctxAuditEntity   = "audit_entity"
	ctxAuditEntityID = "audit_entity_id"
	ctxAuditDetail   = "audit_detail"
	ctxAuditActor    = "audit_actor"
)

// Auditor es la dependencia mínima que necesita el middleware para persistir
// entradas de bitácora (la implementa services.AuditService).
type Auditor interface {
	Record(entry *models.AuditLog)
}

// Audited marca una ruta como operación crítica a registrar en la bitácora
// (RF-13). Debe colocarse ANTES de RequireRole para que también queden
// registrados los intentos rechazados por falta de permisos (RN-06).
func Audited(accion, entidad string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(ctxAuditAction, accion)
		c.Set(ctxAuditEntity, entidad)
		c.Next()
	}
}

// SetAuditDetail agrega un detalle legible a la entrada de bitácora.
func SetAuditDetail(c *gin.Context, detail string) { c.Set(ctxAuditDetail, detail) }

// SetAuditEntityID indica el ID de la entidad afectada (útil en creaciones,
// donde el ID no viene en la URL).
func SetAuditEntityID(c *gin.Context, id uint) { c.Set(ctxAuditEntityID, id) }

// SetAuditActor identifica al usuario en rutas públicas (inicio de sesión),
// donde todavía no hay claims JWT en el contexto.
func SetAuditActor(c *gin.Context, u *models.User) { c.Set(ctxAuditActor, u) }

// AuditTrail registra, después de ejecutar la petición:
//   - Toda operación marcada con Audited (éxito, denegada o fallida).
//   - Todo acceso denegado (403) aunque la ruta no esté marcada.
func AuditTrail(a Auditor) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		status := c.Writer.Status()
		accion := c.GetString(ctxAuditAction)
		if accion == "" {
			if status != http.StatusForbidden {
				return
			}
			accion = "acceso.denegado"
		}

		entry := &models.AuditLog{
			Accion:  accion,
			Entidad: c.GetString(ctxAuditEntity),
			Detalle: c.GetString(ctxAuditDetail),
			Metodo:  c.Request.Method,
			Ruta:    c.Request.URL.Path,
			IP:      c.ClientIP(),
		}

		switch {
		case status < 400:
			entry.Resultado = models.AuditoriaExito
		case status == http.StatusForbidden:
			entry.Resultado = models.AuditoriaDenegado
		default:
			entry.Resultado = models.AuditoriaFallido
		}
		if entry.Detalle == "" && status >= 400 {
			entry.Detalle = "HTTP " + strconv.Itoa(status)
		}

		// Usuario: claims del JWT o, en el login, el usuario identificado.
		if claims, ok := ClaimsFrom(c); ok {
			uid := claims.UserID
			entry.UsuarioID = &uid
			entry.Username = claims.Username
			entry.Rol = string(claims.Rol)
			entry.SedeID = claims.SedeID
		} else if v, ok := c.Get(ctxAuditActor); ok {
			if u, ok := v.(*models.User); ok && u != nil {
				uid := u.ID
				entry.UsuarioID = &uid
				entry.Username = u.Username
				entry.Rol = string(u.Rol)
				entry.SedeID = u.SedeID
			}
		}
		// Tienda sobre la que se operó (para el admin general, la elegida).
		if store := StoreFrom(c); store != nil {
			entry.SedeID = store
		}

		// Entidad afectada: explícita o tomada del parámetro :id de la ruta.
		if v, ok := c.Get(ctxAuditEntityID); ok {
			if id, ok := v.(uint); ok {
				entry.EntidadID = &id
			}
		} else if p := c.Param("id"); p != "" {
			if id, err := strconv.ParseUint(p, 10, 64); err == nil {
				v := uint(id)
				entry.EntidadID = &v
			}
		}

		a.Record(entry)
	}
}
