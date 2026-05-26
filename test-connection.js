import "dotenv/config";
import { MongoClient } from "mongodb";
import neo4j from "neo4j-driver";
import { conectarRedis } from "./logistica/redis/redis.js";

const {
  MONGODB_URI,
  MONGODB_DATABASE,
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  REDIS_URL,
  REDIS_HOST,
} = process.env;

function missing(vars) {
  return vars.filter(([k, v]) => !v || String(v).trim() === "").map(([k]) => k);
}

async function testMongo() {
  const absent = missing([
    ["MONGODB_URI", MONGODB_URI],
    ["MONGODB_DATABASE", MONGODB_DATABASE],
  ]);
  if (absent.length) {
    console.log("MongoDB: omitido (faltan variables:", absent.join(", "), ")");
    return;
  }

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const dbName = String(MONGODB_DATABASE || "logistica")
      .trim()
      .toLowerCase();
    await client.db(dbName).command({ ping: 1 });
    console.log("MongoDB: OK — base:", dbName);
  } finally {
    await client.close();
  }
}

async function testNeo4j() {
  const absent = missing([
    ["NEO4J_URI", NEO4J_URI],
    ["NEO4J_USER", NEO4J_USER],
    ["NEO4J_PASSWORD", NEO4J_PASSWORD],
  ]);
  if (absent.length) {
    console.log("Neo4j: omitido (faltan variables:", absent.join(", "), ")");
    return;
  }

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
  );
  try {
    await driver.verifyConnectivity();
    console.log("Neo4j: OK");
  } finally {
    await driver.close();
  }
}

async function testRedis() {
  // Si no hay ni URL ni HOST configurado, asumimos que el TP todavía no cargó Redis.
  const hasConfig =
    (REDIS_URL && String(REDIS_URL).trim() !== "") ||
    (REDIS_HOST && String(REDIS_HOST).trim() !== "");
  if (!hasConfig) {
    console.log("Redis: omitido (faltan REDIS_URL o REDIS_HOST en el entorno)");
    return;
  }

  const { client, prefix } = await conectarRedis();
  try {
    const pong = await client.ping();
    console.log("Redis: OK base:", prefix);
  } finally {
    await client.quit();
  }
}

async function main() {
  console.log("Probando conexiones…\n");
  try {
    await testMongo();
  } catch (e) {
    console.error("MongoDB: error —", e.message ?? e);
  }
  try {
    await testNeo4j();
  } catch (e) {
    console.error("Neo4j: error —", e.message ?? e);
  }
  try {
    await testRedis();
  } catch (e) {
    console.error("Redis: error —", e.message ?? e);
  }
}

main();
