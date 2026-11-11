-- ============================================================
-- Supermercado — Esquema MySQL de referencia
-- Sistema de información para la gestión de inventario, ventas
-- y personal de un supermercado (UNIMINUTO · Arquitectura de Software)
--
-- La API crea y actualiza este esquema automáticamente al iniciar
-- (GORM AutoMigrate + internal/database/db.go). Este archivo es la
-- referencia DDL generada a partir de esa migración.
-- ============================================================

CREATE DATABASE IF NOT EXISTS proyectosupermercado
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE proyectosupermercado;

CREATE TABLE `auditoria` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` bigint unsigned DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `rol` varchar(20) DEFAULT NULL,
  `sede_id` bigint unsigned DEFAULT NULL,
  `accion` varchar(60) NOT NULL,
  `entidad` varchar(40) DEFAULT NULL,
  `entidad_id` bigint unsigned DEFAULT NULL,
  `resultado` enum('exito','denegado','fallido') NOT NULL,
  `detalle` text,
  `metodo` varchar(10) DEFAULT NULL,
  `ruta` varchar(255) DEFAULT NULL,
  `ip` varchar(45) DEFAULT NULL,
  `fecha` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auditoria_usuario_id` (`usuario_id`),
  KEY `idx_auditoria_sede_id` (`sede_id`),
  KEY `idx_auditoria_accion` (`accion`),
  KEY `idx_auditoria_fecha` (`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `categorias` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_categorias_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `inventario` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` bigint unsigned NOT NULL,
  `producto_id` bigint unsigned NOT NULL,
  `stock_actual` bigint NOT NULL DEFAULT '0',
  `stock_minimo` bigint NOT NULL DEFAULT '0',
  `updated_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inv_sede_producto` (`sede_id`,`producto_id`),
  KEY `fk_inventario_producto` (`producto_id`),
  CONSTRAINT `fk_inventario_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `fk_inventario_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `movimientos_inventario` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inventario_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `tipo` enum('entrada','descuento_venta','anulacion_venta','ajuste_averia','ajuste_devolucion','ajuste_vencimiento','ajuste_manual') NOT NULL,
  `cantidad` bigint NOT NULL,
  `stock_final` bigint NOT NULL DEFAULT '0',
  `pedido_id` bigint unsigned DEFAULT NULL,
  `motivo` text,
  `fecha` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_movimientos_inventario_inventario_id` (`inventario_id`),
  KEY `idx_movimientos_inventario_pedido_id` (`pedido_id`),
  KEY `idx_movimientos_inventario_fecha` (`fecha`),
  KEY `fk_movimientos_inventario_usuario` (`usuario_id`),
  CONSTRAINT `fk_movimientos_inventario_inventario` FOREIGN KEY (`inventario_id`) REFERENCES `inventario` (`id`),
  CONSTRAINT `fk_movimientos_inventario_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `pagos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta_credito','tarjeta_debito') NOT NULL,
  `fecha` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pagos_pedido_id` (`pedido_id`),
  KEY `fk_pagos_usuario` (`usuario_id`),
  CONSTRAINT `fk_pagos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pedidos_pago` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `pedido_detalle` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pedido_id` bigint unsigned NOT NULL,
  `producto_id` bigint unsigned NOT NULL,
  `cantidad` bigint NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `notas` text,
  PRIMARY KEY (`id`),
  KEY `idx_pedido_detalle_pedido_id` (`pedido_id`),
  KEY `fk_pedido_detalle_producto` (`producto_id`),
  CONSTRAINT `fk_pedido_detalle_producto` FOREIGN KEY (`producto_id`) REFERENCES `productos` (`id`),
  CONSTRAINT `fk_pedidos_items` FOREIGN KEY (`pedido_id`) REFERENCES `pedidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `pedidos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `turno_id` bigint unsigned DEFAULT NULL,
  `estado` enum('abierto','pagado','anulado') NOT NULL DEFAULT 'abierto',
  `created_at` datetime(3) DEFAULT NULL,
  `cerrado_at` datetime(3) DEFAULT NULL,
  `anulado_por_id` bigint unsigned DEFAULT NULL,
  `anulado_at` datetime(3) DEFAULT NULL,
  `motivo_anulacion` text,
  PRIMARY KEY (`id`),
  KEY `idx_pedidos_sede_id` (`sede_id`),
  KEY `idx_pedidos_turno_id` (`turno_id`),
  KEY `fk_pedidos_usuario` (`usuario_id`),
  KEY `fk_pedidos_anulado_por` (`anulado_por_id`),
  CONSTRAINT `fk_pedidos_anulado_por` FOREIGN KEY (`anulado_por_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_pedidos_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`),
  CONSTRAINT `fk_pedidos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `productos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` bigint unsigned NOT NULL,
  `codigo_barras` varchar(50) NOT NULL,
  `categoria_id` bigint unsigned NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `descripcion` text,
  `unidad_medida` enum('unidad','kg','g','l','ml','paquete') NOT NULL DEFAULT 'unidad',
  `costo_compra` decimal(10,2) NOT NULL DEFAULT '0.00',
  `precio` decimal(10,2) NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_producto_sede_codigo` (`sede_id`,`codigo_barras`),
  KEY `fk_productos_categoria` (`categoria_id`),
  CONSTRAINT `fk_productos_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`),
  CONSTRAINT `fk_productos_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `sedes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(255) NOT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `color` varchar(7) NOT NULL DEFAULT '#16A34A',
  `activa` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_sedes_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `turnos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` bigint unsigned NOT NULL,
  `usuario_id` bigint unsigned NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicio` varchar(5) NOT NULL,
  `hora_fin` varchar(5) NOT NULL,
  `estado` enum('programado','abierto','cerrado') NOT NULL DEFAULT 'programado',
  `asignado_por_id` bigint unsigned NOT NULL,
  `abierto_at` datetime(3) DEFAULT NULL,
  `cerrado_at` datetime(3) DEFAULT NULL,
  `num_ventas` bigint NOT NULL DEFAULT '0',
  `total_ventas` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_efectivo` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_debito` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_credito` decimal(12,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_turnos_sede_id` (`sede_id`),
  KEY `idx_turnos_usuario_id` (`usuario_id`),
  KEY `idx_turnos_fecha` (`fecha`),
  CONSTRAINT `fk_turnos_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`),
  CONSTRAINT `fk_turnos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `usuarios` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` bigint unsigned DEFAULT NULL,
  `username` varchar(50) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `documento` varchar(20) DEFAULT NULL,
  `telefono` varchar(30) DEFAULT NULL,
  `fecha_ingreso` date DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('admin','admin_tienda','cajero','auxiliar_bodega') NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_usuarios_username` (`username`),
  KEY `idx_usuarios_sede_id` (`sede_id`),
  CONSTRAINT `fk_usuarios_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

