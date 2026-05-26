# BD2Logistica

Proyecto de TP de Base de Datos 2 orientado a **logística**, con scripts en Node.js para:

- Probar conexión a **MongoDB ATLAS** y/o **Neo4j AURA**
- Ejecutar consultas en MongoDB y Neo4j (menú interactivo)
- (TP2) Operación en tiempo real con **Redis** + operaciones poliglotas (MongoDB + Neo4j + Redis)

## Requisitos

- Node.js (recomendado: LTS)
- Acceso a una instancia de **MongoDB** (Atlas o compatible) y/o **Neo4j** (Aura o compatible)

## Instalación

```bash
npm install
```

## Configuración

1. Copiá `.env.example` a `.env`
2. Completá las variables según corresponda:

- **MongoDB**
  - `MONGODB_URI`
  - `MONGODB_DATABASE`
- **Neo4j**
  - `NEO4J_URI`
  - `NEO4J_USER`
  - `NEO4J_PASSWORD`
- **Redis**
  - `REDIS_URL` 
  - `REDIS_USER`
  - `REDIS_PASSWORD`
  - `REDIS_KEY_PREFIX` 

## Comandos

- **Probar conexiones (MongoDB/Neo4j)**:

```bash
npm run test:db
```

- **Menú de consultas (MongoDB / Neo4j)**:

```bash
npm run consultas
```

```bash
node logistica/cli/ejecutar-consultas.js --todas
node logistica/cli/ejecutar-consultas.js --todas-neo4j
```

## Estructura `logistica/`

- `mongo/` — conexión (`mongo.js`) y consultas (`consultas.js`)
- `neo4j/` — conexión (`neo4j.js`), consultas Cypher (`consultas.js`), datos de ejemplo en `neo4j/seed/`
- `shared/` — utilidades de terminal compartidas (`terminal-ui.js`)
- `cli/` — punto de entrada del menú (`ejecutar-consultas.js`)
