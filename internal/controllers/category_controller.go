package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"supermercado-inventory-api/internal/models"
	"supermercado-inventory-api/internal/repository"
	"supermercado-inventory-api/internal/services"
)

// CategoryController maneja las peticiones HTTP de categorías (HU012).
type CategoryController struct {
	service services.CategoryService
}

func NewCategoryController(service services.CategoryService) *CategoryController {
	return &CategoryController{service: service}
}

// categoryRequest es el DTO de entrada para crear/actualizar una categoría.
type categoryRequest struct {
	Name        string `json:"name"        binding:"required,min=1,max=100"`
	Description string `json:"description"`
}

// List retorna todas las categorías existentes.
func (cc *CategoryController) List(c *gin.Context) {
	categories, err := cc.service.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, categories)
}

// GetByID retorna una categoría por su ID.
func (cc *CategoryController) GetByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "identificador inválido"})
		return
	}
	category, err := cc.service.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "categoría no encontrada"})
		return
	}
	c.JSON(http.StatusOK, category)
}

// Create crea una nueva categoría validando nombre único (HU012).
func (cc *CategoryController) Create(c *gin.Context) {
	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category := &models.Category{
		Nombre:      req.Name,
		Descripcion: req.Description,
	}

	if err := cc.service.Create(category); err != nil {
		cc.mapError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Categoría guardada correctamente",
		"category": category,
	})
}

// Update actualiza una categoría existente.
func (cc *CategoryController) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "identificador inválido"})
		return
	}

	category, err := cc.service.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "categoría no encontrada"})
		return
	}

	var req categoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	category.Nombre = req.Name
	category.Descripcion = req.Description

	if err := cc.service.Update(category); err != nil {
		cc.mapError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Categoría actualizada correctamente",
		"category": category,
	})
}

// Delete elimina una categoría por su ID.
func (cc *CategoryController) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "identificador inválido"})
		return
	}
	if err := cc.service.Delete(uint(id)); err != nil {
		if errors.Is(err, repository.ErrCategoryInUse) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Categoría eliminada correctamente"})
}

// mapError traduce errores tipados del servicio a códigos HTTP.
func (cc *CategoryController) mapError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, services.ErrCategoryNameRequired),
		errors.Is(err, services.ErrCategoryNameTaken):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
