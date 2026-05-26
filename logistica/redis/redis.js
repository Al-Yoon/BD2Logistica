import "dotenv/config";
import { createClient } from "redis";

function prefix() {
  const p = String(process.env.REDIS_KEY_PREFIX || "logistica").trim();
  return p || "logistica";
}

export function k(...parts) {
  const base = prefix();
  const tail = parts.filter((p) => p !== undefined && p !== null).map((p) => String(p));
  return [base, ...tail].join(":");
}

/**
 * @returns {{ client: import("redis").RedisClientType, prefix: string }}
 */
export async function conectarRedis() {
  const url = process.env.REDIS_URL?.trim();

  const host = process.env.REDIS_HOST?.trim();
  const portRaw = process.env.REDIS_PORT?.trim();
  const username = process.env.REDIS_USER?.trim();
  const password = process.env.REDIS_PASSWORD;
  const dbRaw = process.env.REDIS_DB?.trim();

  /** @type {import("redis").RedisClientOptions} */
  const opts = {};

  if (url) {
    opts.url = url;
    opts.socket = {
      reconnectStrategy: (retries) => {
        if (retries > 3) {
          return new Error("Conexión a Redis falló tras 3 intentos.");
        }
        return Math.min(retries * 100, 1000);
      }
    };
  } else {
    // Por defecto asumimos Redis local si no se configuró host/url.
    const resolvedHost = host || "localhost";
    const port = portRaw ? Number(portRaw) : 6379;
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error("REDIS_PORT inválido (use un número > 0).");
    }
    opts.socket = {
      host: resolvedHost,
      port,
      reconnectStrategy: (retries) => {
        if (retries > 3) {
          return new Error("Conexión a Redis falló tras 3 intentos.");
        }
        return Math.min(retries * 100, 1000);
      }
    };
    if (username) opts.username = username;
    if (password !== undefined && String(password) !== "") opts.password = String(password);
    if (dbRaw) {
      const db = Number(dbRaw);
      if (!Number.isFinite(db) || db < 0) throw new Error("REDIS_DB inválido (use 0..N).");
      opts.database = db;
    }
  }

  const client = createClient(opts);

  client.on("error", () => {
    // el caller maneja los errores en connect/commands; evitamos spam de stacktraces
  });

  await client.connect();

  const p = prefix();
  return { client, prefix: p };
}

