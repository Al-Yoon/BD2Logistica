# BD2Logistica

Proyecto de TP de Base de Datos 2 orientado a **logística**, con scripts en Node.js para:

- Probar conexión a **MongoDB Atlas**, **Neo4j Aura** y **Redis**
- Ejecutar las **5 operaciones de persistencia poliglota** (MongoDB + Neo4j + Redis)

## Requisitos

- Node.js (recomendado: LTS)
- Acceso a MongoDB, Neo4j y Redis configurados en `.env`

## Instalación

```bash
npm install
```

## Configuración

1. Copiá `.env.example` a `.env`
2. Completá las variables según corresponda:

- **MongoDB**: `MONGODB_URI`, `MONGODB_DATABASE`
- **Neo4j**: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- **Redis**: `REDIS_URL` (o `REDIS_HOST` / `REDIS_PORT`), `REDIS_KEY_PREFIX`

## Comandos

**Probar conexiones:**

```bash
npm run test:db
```

**Menú poliglota (interactivo):**

```bash
npm run consultas
```

## Operaciones políglotas (TP sección 4.2)

| Op | Descripción | Motores |
|----|-------------|---------|
| OP-1 | Dashboard operativo en tiempo real | MongoDB + Neo4j + Redis |
| OP-2 | Asignación inteligente de envío | MongoDB + Neo4j + Redis |
| OP-3 | Seguimiento en tiempo real de un envío | MongoDB + Redis |
| OP-4 | Redistribución ante depósito inoperativo | MongoDB + Neo4j |
| OP-5 | Cierre de turno y consolidación de métricas | MongoDB + Neo4j + Redis |

## Estructura `logistica/`

- `mongo/` — conexión y consultas para la capa poliglota
- `neo4j/` — consultas Cypher para la capa poliglota
- `redis/` — operaciones en tiempo real (GEO, ZSET, SETNX, etc.)
- `poliglota/` — orquestación OP-1 … OP-5
- `cli/` — menú interactivo (`ejecutar-consultas.js`)
- `shared/` — utilidades de terminal

## Datos esperados

Las operaciones asumen el modelo de la 1.ª entrega (colecciones `envios`, `eventos_tracking`, `clientes`, `depositos`, grafo `Deposito`/`CONECTADO_A` en Neo4j) y datos operativos cargados en Redis (posiciones GEO, SET `disponibles:zona_*`, colas `cola:despacho:*`).

Para OP-2 y OP-3, el envío debe tener coordenadas en `direccion_entrega` (o campos equivalentes documentados en `mongo/consultas.js` → `coordenadasEntrega`).
