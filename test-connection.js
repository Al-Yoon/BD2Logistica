import "dotenv/config";
import { MongoClient } from "mongodb";
import neo4j from "neo4j-driver";

const { MONGODB_URI, MONGODB_DATABASE, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD } =
  process.env;

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
    await client.db(MONGODB_DATABASE).command({ ping: 1 });
    console.log("MongoDB: OK — base:", MONGODB_DATABASE);
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
}

main();
