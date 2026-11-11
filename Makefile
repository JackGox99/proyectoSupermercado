.PHONY: up down reset api web build vet

## Levanta todo el stack con Docker (web :3000, API :8080, MySQL :3309)
up:
	docker compose up --build -d

## Detiene el stack conservando los datos
down:
	docker compose down

## Detiene el stack y BORRA la base de datos (vuelve a cargar los datos de demostración)
reset:
	docker compose down -v

## API en local (requiere MySQL y las variables de .env.example)
api:
	go run ./cmd/api

## Frontend en modo desarrollo (http://localhost:3000)
web:
	cd frontend && npm run dev

build:
	go build ./... && cd frontend && npm run build

vet:
	go vet ./...
