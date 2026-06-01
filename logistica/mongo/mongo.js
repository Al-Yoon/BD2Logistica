import "dotenv/config";
import { MongoClient } from "mongodb";

/**
 * @returns {{ client: import("mongodb").MongoClient, db: import("mongodb").Db }}
 */
export async function conectarMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri || String(uri).trim() === "") {
    throw new Error("Falta MONGODB_URI en el entorno (.env)");
  }
  const raw = process.env.MONGODB_DATABASE || "logistica";
  const nombreBase = String(raw).trim().toLowerCase();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(nombreBase);
  return { client, db };
}

export function nombreBaseDatos() {
  const raw = process.env.MONGODB_DATABASE || "logistica";
  return String(raw).trim().toLowerCase();
}
