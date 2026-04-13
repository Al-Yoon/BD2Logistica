# BD2Logistica

Proyecto de TP de Base de Datos 2 orientado a **logística**, con scripts en Node.js para:

- Probar conexión a **MongoDB** y/o **Neo4j**
- Cargar datos en MongoDB (semilla)
- Ejecutar consultas en MongoDB

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
  - `MONGODB_DATABASE` (por defecto: `logistica`)
- **Neo4j**
  - `NEO4J_URI`
  - `NEO4J_USER`
  - `NEO4J_PASSWORD`

## Comandos

- **Probar conexiones (MongoDB/Neo4j)**:

```bash
npm run test:db
```

- **Cargar datos en MongoDB**:

```bash
npm run seed:mongo
```

- **Resetear (limpiar) y recargar datos en MongoDB**:

```bash
npm run seed:mongo:reset
```

- **Ejecutar consultas MongoDB (set por defecto)**:

```bash
npm run test:mongo-queries
```

- **Ejecutar todas las consultas MongoDB**:

```bash
npm run test:mongo-queries:all
```
