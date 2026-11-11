package database

import (
	"fmt"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"supermercado-inventory-api/config"
	"supermercado-inventory-api/internal/models"
)

func Connect(cfg *config.Config) *gorm.DB {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Error conectando a la base de datos: %v", err)
	}

	log.Println("Database connection established successfully.")
	return db
}

func AutoMigrate(db *gorm.DB) {
	migrateLegacyProducts(db)

	err := db.AutoMigrate(
		&models.Venue{},
		&models.User{},
		&models.Category{},
		&models.Product{},
		&models.Inventory{},
		&models.InventoryMovement{},
		&models.Shift{},
		&models.Order{},
		&models.OrderItem{},
		&models.Payment{},
		&models.AuditLog{},
	)
	if err != nil {
		log.Fatalf("Error en AutoMigrate: %v", err)
	}

	migrateEnums(db)
	log.Println("AutoMigrate completado")
}

// migrateLegacyProducts adapta una tabla `productos` creada con el esquema
// anterior (catálogo global sin tienda ni código de barras) antes de que
// AutoMigrate imponga las columnas NOT NULL y el índice único (sede, código).
// Cada producto queda asignado a la primera tienda donde tenía inventario y
// recibe un código provisional único que el admin de tienda puede corregir.
func migrateLegacyProducts(db *gorm.DB) {
	m := db.Migrator()
	if !m.HasTable("productos") || m.HasColumn(&models.Product{}, "SedeID") {
		return
	}
	log.Println("Migración: adaptando productos al catálogo por tienda")
	stmts := []string{
		"ALTER TABLE productos ADD COLUMN sede_id BIGINT UNSIGNED NULL, ADD COLUMN codigo_barras VARCHAR(50) NULL",
		"UPDATE productos p SET sede_id = (SELECT MIN(i.sede_id) FROM inventario i WHERE i.producto_id = p.id)",
		"UPDATE productos SET sede_id = (SELECT MIN(id) FROM sedes) WHERE sede_id IS NULL",
		"UPDATE productos SET codigo_barras = CONCAT('LEGACY-', id) WHERE codigo_barras IS NULL",
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			log.Fatalf("Error migrando productos legacy: %v", err)
		}
	}
}

// migrateEnums sincroniza explícitamente las columnas ENUM. GORM AutoMigrate
// no detecta cambios en la lista de valores de un ENUM existente, así que sin
// este paso una base creada con una versión anterior rechazaría los valores
// nuevos (p. ej. el rol admin_tienda o el estado anulado).
func migrateEnums(db *gorm.DB) {
	stmts := []string{
		"ALTER TABLE usuarios MODIFY rol " + models.RolEnumSQL + " NOT NULL",
		"ALTER TABLE movimientos_inventario MODIFY tipo " + models.TipoMovimientoEnumSQL + " NOT NULL",
		"ALTER TABLE pedidos MODIFY estado " + models.EstadoPedidoEnumSQL + " NOT NULL DEFAULT 'abierto'",
		"ALTER TABLE turnos MODIFY estado " + models.TurnoEstadoEnumSQL + " NOT NULL DEFAULT 'programado'",
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			log.Fatalf("Error sincronizando ENUMs: %v", err)
		}
	}
}

// ============================================================================
// Seed — datos iniciales de demostración. Cada bloque solo se ejecuta si su
// tabla está vacía, por lo que es seguro en cada arranque.
// ============================================================================

func Seed(db *gorm.DB) {
	seedSedes(db)
	seedUsuarios(db)
	seedCategorias(db)
	seedProductos(db)
	seedTurnos(db)
}

func seedSedes(db *gorm.DB) {
	var count int64
	db.Model(&models.Venue{}).Count(&count)
	if count > 0 {
		// Bases creadas antes de existir el color de tienda: asignar colores distintos.
		db.Model(&models.Venue{}).Where("nombre = ?", "Restrepo").Where("color = ?", "#4ADE80").Update("color", "#60A5FA")
		db.Model(&models.Venue{}).Where("nombre = ?", "Zona T").Where("color = ?", "#4ADE80").Update("color", "#F472B6")
		return
	}

	sedes := []models.Venue{
		{Nombre: "Galerías", Direccion: "Calle 53 # 27-40, Bogotá", Telefono: "601 345 1020", Color: "#4ADE80", Activa: true},
		{Nombre: "Restrepo", Direccion: "Carrera 19 # 17-25 Sur, Bogotá", Telefono: "601 345 1030", Color: "#60A5FA", Activa: true},
		{Nombre: "Zona T", Direccion: "Calle 82 # 12-15, Bogotá", Telefono: "601 345 1040", Color: "#F472B6", Activa: true},
	}

	if err := db.Create(&sedes).Error; err != nil {
		log.Printf("Error en seed de tiendas: %v", err)
		return
	}
	log.Println("Seed: tiendas insertadas")
}

// sedeIDs retorna un mapa nombre → id de las tiendas existentes.
func sedeIDs(db *gorm.DB) map[string]uint {
	var sedes []models.Venue
	db.Find(&sedes)
	ids := map[string]uint{}
	for _, s := range sedes {
		ids[s.Nombre] = s.ID
	}
	return ids
}

func seedUsuarios(db *gorm.DB) {
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return // ya tiene usuarios, no vuelve a insertar
	}

	sedeID := sedeIDs(db)
	if len(sedeID) < 3 {
		log.Println("Seed usuarios: no se encontraron las 3 tiendas, abortando")
		return
	}

	type usuarioSeed struct {
		Username  string
		Nombre    string
		Password  string
		Rol       models.RolUsuario
		Sede      string
		Documento string
	}

	seeds := []usuarioSeed{
		// Administrador general (sin tienda)
		{"admin", "Administrador General", "admin123", models.RolAdmin, "", "1010000001"},

		// Galerías
		{"tienda.galerias", "Sofía Galerías", "tienda123", models.RolAdminTienda, "Galerías", "1010000011"},
		{"cajero.galerias", "Carlos Galerías", "cajero123", models.RolCajero, "Galerías", "1010000012"},
		{"bodega.galerias", "María Galerías", "bodega123", models.RolAuxiliarBodega, "Galerías", "1010000013"},

		// Restrepo
		{"tienda.restrepo", "Andrés Restrepo", "tienda123", models.RolAdminTienda, "Restrepo", "1010000021"},
		{"cajero.restrepo", "Luis Restrepo", "cajero123", models.RolCajero, "Restrepo", "1010000022"},
		{"bodega.restrepo", "Ana Restrepo", "bodega123", models.RolAuxiliarBodega, "Restrepo", "1010000023"},

		// Zona T
		{"tienda.zonat", "Valentina Zona T", "tienda123", models.RolAdminTienda, "Zona T", "1010000031"},
		{"cajero.zonat", "Pedro Zona T", "cajero123", models.RolCajero, "Zona T", "1010000032"},
		{"bodega.zonat", "Laura Zona T", "bodega123", models.RolAuxiliarBodega, "Zona T", "1010000033"},
	}

	ingreso := time.Date(2026, 1, 15, 0, 0, 0, 0, time.Local)
	for _, s := range seeds {
		hash, err := bcrypt.GenerateFromPassword([]byte(s.Password), 12)
		if err != nil {
			log.Printf("Seed usuarios: error hasheando password para %s: %v", s.Username, err)
			continue
		}

		email := s.Username + "@supermercado.com"
		fecha := ingreso
		u := models.User{
			Username:     s.Username,
			Email:        &email,
			Nombre:       s.Nombre,
			Documento:    s.Documento,
			Telefono:     "300 000 " + s.Documento[len(s.Documento)-4:],
			FechaIngreso: &fecha,
			PasswordHash: string(hash),
			Rol:          s.Rol,
			Activo:       true,
		}

		if s.Sede != "" {
			id := sedeID[s.Sede]
			u.SedeID = &id
		}

		if err := db.Create(&u).Error; err != nil {
			log.Printf("Seed usuarios: error creando %s: %v", s.Username, err)
		}
	}

	log.Println("Seed: usuarios insertados")
}

// seedCategorias inserta las categorías base de un supermercado si la tabla está vacía.
func seedCategorias(db *gorm.DB) {
	var count int64
	db.Model(&models.Category{}).Count(&count)
	if count > 0 {
		return
	}

	categorias := []models.Category{
		{Nombre: "Frutas y Verduras", Descripcion: "Productos frescos de origen vegetal"},
		{Nombre: "Lácteos y Huevos", Descripcion: "Leche, quesos, yogures, mantequilla y huevos"},
		{Nombre: "Carnes y Pescados", Descripcion: "Carnes rojas, pollo, cerdo y productos de mar"},
		{Nombre: "Panadería", Descripcion: "Pan, tortas y productos de panadería"},
		{Nombre: "Despensa", Descripcion: "Granos, arroz, aceites, enlatados y abarrotes"},
		{Nombre: "Bebidas", Descripcion: "Agua, jugos, gaseosas y bebidas en general"},
		{Nombre: "Aseo del Hogar", Descripcion: "Detergentes, limpiadores y desinfectantes"},
		{Nombre: "Cuidado Personal", Descripcion: "Higiene personal y cosméticos"},
		{Nombre: "Congelados", Descripcion: "Alimentos congelados y helados"},
		{Nombre: "Snacks y Dulces", Descripcion: "Pasabocas, galletas, chocolates y confitería"},
	}

	if err := db.Create(&categorias).Error; err != nil {
		log.Printf("Error en seed de categorías: %v", err)
		return
	}
	log.Println("Seed: categorías insertadas")
}

// seedProductos crea un catálogo de demostración en cada tienda con stock
// inicial registrado como entrada de mercancía (trazable). Incluye a propósito
// productos con stock bajo, uno vencido y uno próximo a vencer para que las
// alertas (RN-11 / RF-09) tengan datos desde el primer arranque.
func seedProductos(db *gorm.DB) {
	var count int64
	db.Model(&models.Product{}).Count(&count)
	if count > 0 {
		return
	}

	cat := map[string]uint{}
	var cats []models.Category
	db.Find(&cats)
	for _, c := range cats {
		cat[c.Nombre] = c.ID
	}

	today := time.Now()
	day := func(offset int) *time.Time {
		y, m, d := today.Date()
		t := time.Date(y, m, d, 0, 0, 0, 0, time.Local).AddDate(0, 0, offset)
		return &t
	}

	type prodSeed struct {
		Codigo    string
		Nombre    string
		Categoria string
		Unidad    models.UnidadMedida
		Costo     float64
		Precio    float64
		Stock     int
		Minimo    int
		Vence     *time.Time
	}
	catalogo := []prodSeed{
		{"7702001000011", "Arroz Diana 1 kg", "Despensa", models.UnidadPaquete, 3200, 4500, 80, 20, day(300)},
		{"7702001000028", "Aceite Premier 1 L", "Despensa", models.UnidadUnidad, 9800, 12900, 40, 10, day(240)},
		{"7702001000035", "Leche Alquería entera 1 L", "Lácteos y Huevos", models.UnidadUnidad, 3100, 4200, 60, 24, day(10)},
		{"7702001000042", "Huevos AA x 30", "Lácteos y Huevos", models.UnidadPaquete, 14500, 18900, 6, 8, day(3)},
		{"7702001000059", "Yogur Alpina fresa 1 L", "Lácteos y Huevos", models.UnidadUnidad, 6200, 8500, 18, 6, day(-2)},
		{"7702001000066", "Pan tajado Bimbo", "Panadería", models.UnidadPaquete, 5200, 7200, 25, 10, day(5)},
		{"7702001000073", "Banano", "Frutas y Verduras", models.UnidadKg, 1800, 2900, 50, 15, day(6)},
		{"7702001000080", "Pechuga de pollo", "Carnes y Pescados", models.UnidadKg, 13500, 18500, 12, 10, day(4)},
		{"7702001000097", "Gaseosa Postobón 1.5 L", "Bebidas", models.UnidadUnidad, 3600, 5200, 48, 12, day(120)},
		{"7702001000103", "Agua Cristal 600 ml", "Bebidas", models.UnidadUnidad, 900, 1600, 100, 24, day(365)},
		{"7702001000110", "Detergente Ariel 2 kg", "Aseo del Hogar", models.UnidadUnidad, 21000, 27900, 15, 5, nil},
		{"7702001000127", "Crema dental Colgate 100 ml", "Cuidado Personal", models.UnidadUnidad, 4300, 6500, 3, 6, day(500)},
		{"7702001000134", "Papas Margarita 105 g", "Snacks y Dulces", models.UnidadPaquete, 3300, 4800, 36, 12, day(90)},
		{"7702001000141", "Helado Crem Helado 1 L", "Congelados", models.UnidadUnidad, 9500, 13900, 10, 4, day(150)},
	}

	var sedes []models.Venue
	db.Find(&sedes)
	for _, sede := range sedes {
		// Usuario de bodega que figura como responsable de las entradas iniciales.
		var bodega models.User
		if err := db.Where("sede_id = ? AND rol = ?", sede.ID, models.RolAuxiliarBodega).First(&bodega).Error; err != nil {
			db.Where("rol = ?", models.RolAdmin).First(&bodega)
		}

		err := db.Transaction(func(tx *gorm.DB) error {
			for _, ps := range catalogo {
				p := models.Product{
					SedeID:           sede.ID,
					CodigoBarras:     ps.Codigo,
					CategoriaID:      cat[ps.Categoria],
					Nombre:           ps.Nombre,
					UnidadMedida:     ps.Unidad,
					CostoCompra:      ps.Costo,
					Precio:           ps.Precio,
					FechaVencimiento: ps.Vence,
					Activo:           true,
				}
				if err := tx.Create(&p).Error; err != nil {
					return err
				}
				inv := models.Inventory{SedeID: sede.ID, ProductoID: p.ID, StockActual: ps.Stock, StockMinimo: ps.Minimo}
				if err := tx.Create(&inv).Error; err != nil {
					return err
				}
				mov := models.InventoryMovement{
					InventarioID: inv.ID,
					UsuarioID:    bodega.ID,
					Tipo:         models.TipoEntrada,
					Cantidad:     ps.Stock,
					StockFinal:   ps.Stock,
					Motivo:       "Inventario inicial",
				}
				if err := tx.Create(&mov).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			log.Printf("Seed productos (%s): %v", sede.Nombre, err)
		}
	}
	log.Println("Seed: productos e inventario inicial insertados")
}

// seedTurnos programa turnos para los próximos 30 días a cajeros y auxiliares
// de bodega, asignados por el admin de su tienda, para poder operar el punto de
// venta desde el primer arranque (CU-01 exige un turno abierto).
func seedTurnos(db *gorm.DB) {
	var count int64
	db.Model(&models.Shift{}).Count(&count)
	if count > 0 {
		return
	}

	var staff []models.User
	db.Where("rol IN ?", []models.RolUsuario{models.RolCajero, models.RolAuxiliarBodega}).Find(&staff)

	var shifts []models.Shift
	y, m, d := time.Now().Date()
	start := time.Date(y, m, d, 0, 0, 0, 0, time.Local)
	for _, u := range staff {
		if u.SedeID == nil {
			continue
		}
		var adminTienda models.User
		if err := db.Where("sede_id = ? AND rol = ?", *u.SedeID, models.RolAdminTienda).First(&adminTienda).Error; err != nil {
			db.Where("rol = ?", models.RolAdmin).First(&adminTienda)
		}
		for i := 0; i < 30; i++ {
			shifts = append(shifts, models.Shift{
				SedeID:        *u.SedeID,
				UsuarioID:     u.ID,
				Fecha:         start.AddDate(0, 0, i),
				HoraInicio:    "06:00",
				HoraFin:       "22:00",
				Estado:        models.TurnoProgramado,
				AsignadoPorID: adminTienda.ID,
			})
		}
	}
	if len(shifts) == 0 {
		return
	}
	if err := db.CreateInBatches(&shifts, 200).Error; err != nil {
		log.Printf("Seed turnos: %v", err)
		return
	}
	log.Println("Seed: turnos programados (30 días)")
}
