package models

// RolUsuario representa los roles posibles de un usuario (Tabla 1 del documento).
// Se almacena como ENUM en la tabla usuarios, no como tabla separada.
type RolUsuario string

const (
	// RolAdmin es el administrador general: gestiona tiendas, categorías y
	// parámetros globales, designa administradores de tienda y consulta el
	// consolidado de todas las tiendas. No tiene tienda asignada.
	RolAdmin RolUsuario = "admin"
	// RolAdminTienda administra únicamente la tienda asignada: usuarios
	// operativos, productos y precios, turnos y reportes de su tienda.
	RolAdminTienda RolUsuario = "admin_tienda"
	// RolCajero registra la venta y procesa el pago (CU-01).
	RolCajero RolUsuario = "cajero"
	// RolAuxiliarBodega es el único rol autorizado para registrar entradas y
	// ajustes de inventario (RN-05).
	RolAuxiliarBodega RolUsuario = "auxiliar_bodega"
)

// RolEnumSQL es la definición SQL del ENUM de roles; se reutiliza en la
// migración explícita de columnas ENUM (ver database.migrateEnums).
const RolEnumSQL = "enum('admin','admin_tienda','cajero','auxiliar_bodega')"

// RequiresStore indica si el rol debe tener una tienda asignada.
func (r RolUsuario) RequiresStore() bool {
	return r == RolAdminTienda || r == RolCajero || r == RolAuxiliarBodega
}

// IsOperational indica si el rol es operativo (lo puede crear un admin de tienda).
func (r RolUsuario) IsOperational() bool {
	return r == RolCajero || r == RolAuxiliarBodega
}
