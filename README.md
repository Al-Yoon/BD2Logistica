# BD2Logistica

Proyecto de TP de Base de Datos 2 orientado a **logística**, con scripts en Node.js para:

- Probar conexión a **MongoDB Atlas**, **Neo4j Aura** y **Redis Cloud**
- Ejecutar las **5 operaciones de persistencia poliglota** (MongoDB + Neo4j + Redis)
- Ejecutar las **consultas de la 1.ª entrega** (MongoDB + Neo4j)
- Cargar **datos de prueba** con volúmenes del TP (`npm run seed`)

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

**Cargar datos de prueba (dataset demo coherente entre los tres motores):**

```bash
npm run seed
```

**Menú poliglota (interactivo):**

```bash
npm run consultas
```

**Consultas TP1 (1.ª entrega):**

```bash
npm run consultas:tp1
# Ejemplo no interactivo:
node logistica/cli/consultas-tp1.js --mongo --consulta a --codigo TRK-TEST-001
node logistica/cli/consultas-tp1.js --neo4j --consulta d
```

**Operaciones políglotas por CLI:**

```bash
node logistica/cli/ejecutar-consultas.js --op 1
node logistica/cli/ejecutar-consultas.js --op 2 --codigo TRK-TEST-001 --zona zona_norte
node logistica/cli/ejecutar-consultas.js --op 3 --codigo TRK-TEST-002
node logistica/cli/ejecutar-consultas.js --op 4 --deposito "Depósito Central Pompeya"
node logistica/cli/ejecutar-consultas.js --op 5 --horas 8
```

## Operaciones políglotas (TP sección 4.2)

| Op | Descripción | Motores |
|----|-------------|---------|
| OP-1 | Dashboard operativo en tiempo real | MongoDB + Neo4j + Redis |
| OP-2 | Asignación inteligente de envío | MongoDB + Neo4j + Redis |
| OP-3 | Seguimiento en tiempo real de un envío | MongoDB + Redis |
| OP-4 | Redistribución ante depósito inoperativo | MongoDB + Neo4j |
| OP-5 | Cierre de turno y consolidación de métricas | MongoDB + Neo4j + Redis |

## Informes

- [1.ª entrega](docs/informe-entrega-1.md) — MongoDB, Neo4j, consultas TP1
- [2.ª entrega](docs/informe-entrega-2.md) — Redis, capa poliglota, OP-1…OP-5

## Estructura `logistica/`

- `mongo/` — conexión y consultas MongoDB
- `neo4j/` — consultas Cypher
- `redis/` — operaciones en tiempo real (GEO, ZSET, SETNX, STREAM)
- `poliglota/` — orquestación OP-1 … OP-5
- `cli/` — menús interactivos
- `shared/` — utilidades de terminal

## Datos esperados

`npm run seed` carga el dataset demo (`TRK-TEST-*`, 5 clientes, 5 repartidores, 5 depósitos) en los servicios configurados en `.env`.

Para OP-2 y OP-3, el envío debe tener coordenadas en `direccion_entrega.coordenadas`.
