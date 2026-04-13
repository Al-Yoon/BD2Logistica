# BD2Logistica

Proyecto de TP de Base de Datos 2 orientado a **logística**, con scripts en Node.js para:

- Probar conexión a **MongoDB ATLAS** y/o **Neo4j AURA**
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

- **Ejecutar consultas MongoDB (set por defecto)**:

```bash
npm run mongo
