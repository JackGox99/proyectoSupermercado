// Package services errores tipados compartidos entre servicios.
// Los controllers mapean cada error a un código HTTP específico,
// manteniendo la capa de servicios libre de dependencias con net/http (SRP).
package services

import (
	"errors"
	"fmt"
)

// Errores de autorización y alcance por tienda.
var (
	// ErrForbiddenStore: la operación pertenece a una tienda distinta a la del usuario (RN-04).
	ErrForbiddenStore = errors.New("acceso denegado: solo puede operar la tienda que tiene asignada (RN-04)")
	// ErrForbiddenRole: el rol del usuario no permite la operación.
	ErrForbiddenRole = errors.New("acceso denegado: su rol no permite esta operación")
	// ErrStoreRequired: la operación requiere una tienda seleccionada.
	ErrStoreRequired = errors.New("seleccione una tienda para realizar esta operación")
)

// Errores de tiendas (RF-01 / CU-09).
var (
	ErrVenueNameRequired = errors.New("el nombre de la tienda es obligatorio")
	ErrVenueAddrRequired = errors.New("la dirección de la tienda es obligatoria")
	ErrVenueNameTaken    = errors.New("ya existe una tienda con ese nombre")
	ErrInvalidColor      = errors.New("el color debe ser hexadecimal, por ejemplo #16A34A")
	ErrStoreInactive     = errors.New("la tienda asignada a este usuario está inactiva")
)

// Errores de negocio relacionados con usuarios (HU008 / RF-02 / RF-10).
var (
	// ErrUsernameTaken indica que el username ya está registrado.
	ErrUsernameTaken = errors.New("el nombre de usuario ya está registrado")

	// ErrSedeRequired indica que el rol exige una tienda y no se proporcionó.
	ErrSedeRequired = errors.New("el administrador de tienda, el cajero y el auxiliar de bodega requieren una tienda")

	// ErrSedeNotAllowed indica que el administrador general no debe tener tienda.
	ErrSedeNotAllowed = errors.New("el administrador general no debe tener tienda asignada")

	// ErrSedeNotFound indica que la tienda referenciada no existe en BD.
	ErrSedeNotFound = errors.New("tienda no encontrada")

	// ErrInvalidRole indica que el rol enviado no es uno de los valores permitidos.
	ErrInvalidRole = errors.New("rol inválido")

	// ErrPasswordRequired indica que no se proporcionó contraseña al crear.
	ErrPasswordRequired = errors.New("la contraseña es obligatoria")

	// ErrPasswordTooShort indica que la contraseña no cumple el mínimo de caracteres (HU010).
	ErrPasswordTooShort = errors.New("la contraseña debe tener al menos 8 caracteres")

	// ErrPasswordMismatch indica que las contraseñas no coinciden (HU010).
	ErrPasswordMismatch = errors.New("las contraseñas no coinciden")

	// ErrUserInactive indica que el usuario está inactivo y no puede iniciar sesión (RN-12).
	ErrUserInactive = errors.New("el usuario está inactivo y no puede iniciar sesión (RN-12)")

	// ErrInvalidDate indica una fecha con formato inválido (se espera YYYY-MM-DD).
	ErrInvalidDate = errors.New("fecha inválida, se espera AAAA-MM-DD")
)

// Errores de catálogo (HU012 / HU013 / RF-05).
var (
	ErrCategoryNameRequired = errors.New("el nombre de la categoría es obligatorio")
	ErrCategoryNameTaken    = errors.New("ya existe una categoría con ese nombre")
	ErrProductNameRequired  = errors.New("el nombre del producto es obligatorio")
	ErrProductNameTaken     = errors.New("ya existe un producto con ese nombre en esta tienda")
	ErrCategoryNotFound     = errors.New("categoría no encontrada")
	ErrBarcodeRequired      = errors.New("el código de barras es obligatorio (4 a 50 letras o dígitos)")
	ErrInvalidUnit          = errors.New("unidad de medida inválida")
	ErrInvalidStockMinimum  = errors.New("el stock mínimo debe ser cero o un entero positivo")

	// ErrInvalidPrice: RN-07, el precio debe ser mayor que cero.
	ErrInvalidPrice = errors.New("el precio debe ser mayor que cero; valor mínimo permitido: 1 (RN-07)")

	// ErrInvalidPurchaseCost indica que el costo de compra no es un entero positivo.
	ErrInvalidPurchaseCost = errors.New("el costo de compra debe ser un entero positivo")

	// ErrPurchaseExceedsSale indica que el costo de compra es mayor o igual al precio de venta.
	ErrPurchaseExceedsSale = errors.New("el costo de compra debe ser menor que el precio de venta")
)

// BarcodeTakenError: RN-08, ya existe un producto con ese código en la tienda.
// Lleva el ID del producto existente para que el cliente ofrezca editarlo.
type BarcodeTakenError struct {
	ExistingID uint
}

func (e *BarcodeTakenError) Error() string {
	return "ya existe un producto con este código de barras en la tienda (RN-08)"
}

// Errores de inventario (CU-02 / CU-03 / RN-05).
var (
	ErrInvalidQuantity   = errors.New("la cantidad debe ser un entero positivo")
	ErrProductNotFound   = errors.New("producto no encontrado en esta tienda")
	ErrNegativeStock     = errors.New("la operación dejaría el stock por debajo de cero")
	ErrInvalidAdjustment = errors.New("el tipo de ajuste debe ser avería, devolución, vencimiento o corrección")
	ErrReasonRequired    = errors.New("el motivo es obligatorio en los ajustes de inventario")
)

// Errores de ventas (CU-01).
var (
	ErrOrderNotOpen         = errors.New("la venta no está abierta")
	ErrOrderNotOwner        = errors.New("solo puede modificar sus propias ventas abiertas")
	ErrInvalidItemQuantity  = errors.New("la cantidad debe ser mayor que cero")
	ErrInvalidPaymentMethod = errors.New("el medio de pago debe ser efectivo, tarjeta débito o tarjeta crédito")
	ErrEmptyOrder           = errors.New("agregue al menos un producto antes de cobrar")
	ErrOrderNotPaid         = errors.New("solo se pueden anular ventas pagadas")
	ErrVoidReasonRequired   = errors.New("el motivo de anulación es obligatorio")
)

// ErrInsufficientStock: RN-01, el stock disponible es menor al solicitado.
type ErrInsufficientStock struct {
	Producto  string
	Available int
}

func (e *ErrInsufficientStock) Error() string {
	if e.Available <= 0 {
		return fmt.Sprintf("%s no tiene existencias en esta tienda (RN-01)", e.Producto)
	}
	return fmt.Sprintf("solo hay %d unidad(es) disponibles de %s (RN-01)", e.Available, e.Producto)
}

// ErrProductExpired: RN-03, el producto está vencido y debe retirarse.
type ErrProductExpired struct {
	Producto string
}

func (e *ErrProductExpired) Error() string {
	return fmt.Sprintf("%s está vencido y no puede venderse; debe retirarse (RN-03)", e.Producto)
}

// Errores de turnos (RF-11 / CU-07 / RN-09).
var (
	ErrNoOpenShift        = errors.New("necesita un turno abierto para registrar ventas; inicie su turno (RN-09)")
	ErrShiftNotToday      = errors.New("solo se puede iniciar el turno del día de hoy")
	ErrShiftAlreadyOpen   = errors.New("ya tiene un turno abierto")
	ErrShiftNotOpen       = errors.New("el turno no está abierto")
	ErrShiftNotScheduled  = errors.New("solo los turnos programados pueden iniciarse o eliminarse")
	ErrShiftHasOpenOrders = errors.New("cobre o cancele sus ventas abiertas antes de cerrar el turno")
	ErrShiftExists        = errors.New("el empleado ya tiene un turno asignado en esa fecha")
	ErrInvalidShiftTime   = errors.New("el horario debe ser HH:MM dentro de 06:00-22:00 y el inicio antes del fin (RNF-03)")
	ErrShiftInPast        = errors.New("no se pueden programar turnos en fechas pasadas")
	ErrShiftUserInvalid   = errors.New("los turnos solo se asignan a cajeros o auxiliares de bodega activos de la tienda")
)
