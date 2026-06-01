import "dotenv/config";
import neo4j from "neo4j-driver";

/**
 * @returns {{ driver: import("neo4j-driver").Driver }}
 */
export async function conectarNeo4j() {
  const uri = process.env.NEO4J_URI;
  const user = process.env.NEO4J_USER;
  const password = process.env.NEO4J_PASSWORD;
  if (!uri?.trim() || !user?.trim() || password === undefined || String(password) === "") {
    throw new Error("Faltan NEO4J_URI, NEO4J_USER o NEO4J_PASSWORD en el entorno (.env)");
  }
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, String(password)));
  await driver.verifyConnectivity();
  return { driver };
}

/** Base lógica (Aura suele usar `neo4j`). */
export function nombreBaseNeo4j() {
  return String(process.env.NEO4J_DATABASE || "neo4j").trim() || "neo4j";
}
