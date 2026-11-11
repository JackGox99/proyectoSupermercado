package main

import (
	"log"

	"supermercado-inventory-api/config"
	"supermercado-inventory-api/internal/database"
	"supermercado-inventory-api/internal/server"
)

// main es el punto de entrada. Su única responsabilidad es:
// 1. Cargar configuración.
// 2. Conectar la BD y ejecutar migraciones.
// 3. Delegar el resto al Server (SRP).
func main() {
	cfg := config.Load()

	db := database.Connect(cfg)
	database.AutoMigrate(db)
	database.Seed(db)

	srv := server.New(cfg, db)
	if err := srv.Run(); err != nil {
		log.Fatal(err)
	}
}
