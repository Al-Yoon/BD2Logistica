/**
 * Menú interactivo — Capa de persistencia poliglota (TP sección 4).
 *
 * Uso:
 *   node logistica/cli/ejecutar-consultas.js
 *   node logistica/cli/ejecutar-consultas.js --op 1
 *   node logistica/cli/ejecutar-consultas.js --op 2 --codigo ENV-001 --zona zona_norte
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { conectarMongo } from "../mongo/mongo.js";
import { conectarNeo4j, nombreBaseNeo4j } from "../neo4j/neo4j.js";
import { conectarRedis } from "../redis/redis.js";
import {
  dashboardOperativo,
  asignacionInteligenteEnvio,
  seguimientoTiempoRealEnvio,
  redistribucionDepositoInoperativo,
  cierreTurnoConsolidacion,
  liberarReserva,
} from "../poliglota/operaciones.js";
import {
  bannerLine,
  section,
  printObject,
  success,
  warn,
  errorLine,
  paint,
  ansi,
} from "../shared/terminal-ui.js";

async function pausa(rl, msg = "\nEnter para continuar…") {
  await rl.question(paint(msg, ansi.dim));
}

function tituloPrincipal() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.cyan + ansi.bold) +
      paint("TP Logística — Persistencia poliglota", ansi.bold + ansi.white) +
      paint("  ═══", ansi.cyan + ansi.bold),
  );
}

function lineasMenuPoliglota() {
  return [
    paint("1", ansi.yellow + ansi.bold) + "  OP-1  Dashboard operativo en tiempo real (*)",
    paint("2", ansi.yellow + ansi.bold) + "  OP-2  Asignación inteligente de envío (*)",
    paint("3", ansi.yellow + ansi.bold) + "  OP-3  Seguimiento en tiempo real de un envío",
    paint("4", ansi.yellow + ansi.bold) + "  OP-4  Redistribución ante depósito inoperativo",
    paint("5", ansi.yellow + ansi.bold) + "  OP-5  Cierre de turno y consolidación (*)",
    paint("6", ansi.yellow + ansi.bold) + "  Liberar reserva Redis de un repartidor",
    paint("0", ansi.yellow + ansi.bold) + "  Salir",
  ];
}

/**
 * @returns {Promise<{ db: import("mongodb").Db, session: import("neo4j-driver").Session, redis: import("redis").RedisClientType, cleanup: () => Promise<void> }>}
 */
async function conectarLosTresMotores() {
  const [{ client: mongoClient, db }, { driver }, { client: redisClient }] = await Promise.all([
    conectarMongo(),
    conectarNeo4j(),
    conectarRedis(),
  ]);
  const session = driver.session({ database: nombreBaseNeo4j() });
  const cleanup = async () => {
    await session.close();
    await mongoClient.close();
    await driver.close();
    await redisClient.quit();
  };
  return { db, session, redis: redisClient, cleanup };
}

async function ejecutarOpDesdeCli(op, ctx, rl) {
  switch (op) {
    case "1": {
      section("OP-1 — Dashboard operativo");
      printObject(await dashboardOperativo(ctx));
      break;
    }
    case "2": {
      const codigo = (await rl.question("Código de seguimiento del envío: ")).trim();
      const zona = (await rl.question("Zona Redis (ej: zona_norte): ")).trim() || "zona_norte";
      section("OP-2 — Asignación inteligente");
      printObject(await asignacionInteligenteEnvio(ctx, { codigoSeguimiento: codigo, zona }));
      break;
    }
    case "3": {
      const codigo = (await rl.question("Código de seguimiento: ")).trim();
      section("OP-3 — Seguimiento en tiempo real");
      printObject(await seguimientoTiempoRealEnvio(ctx, codigo));
      break;
    }
    case "4": {
      const dep = (await rl.question("Nombre del depósito inoperativo: ")).trim();
      section("OP-4 — Redistribución");
      printObject(await redistribucionDepositoInoperativo(ctx, dep));
      break;
    }
    case "5": {
      const horasStr = (await rl.question("Horas del turno [8]: ")).trim() || "8";
      section("OP-5 — Cierre de turno");
      printObject(await cierreTurnoConsolidacion(ctx, { horasTurno: Number(horasStr) }));
      break;
    }
    case "6": {
      const rid = (await rl.question("ID repartidor (ej: R001): ")).trim();
      await liberarReserva(ctx.redis, rid);
      success(`Reserva liberada para ${rid}`);
      break;
    }
    default:
      errorLine("Opción no reconocida.");
  }
}

function parseArgs(argv) {
  const out = { op: null, codigo: null, zona: null, deposito: null, horas: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--op" || a === "-o") out.op = argv[++i];
    else if (a === "--codigo" || a === "-c") out.codigo = argv[++i];
    else if (a === "--zona" || a === "-z") out.zona = argv[++i];
    else if (a === "--deposito" || a === "-d") out.deposito = argv[++i];
    else if (a === "--horas") out.horas = argv[++i];
  }
  return out;
}

async function ejecutarOpNoInteractiva(op, ctx, args) {
  switch (op) {
    case "1":
      printObject(await dashboardOperativo(ctx));
      break;
    case "2":
      if (!args.codigo) throw new Error("OP-2 requiere --codigo");
      printObject(
        await asignacionInteligenteEnvio(ctx, {
          codigoSeguimiento: args.codigo,
          zona: args.zona ?? "zona_norte",
        }),
      );
      break;
    case "3":
      if (!args.codigo) throw new Error("OP-3 requiere --codigo");
      printObject(await seguimientoTiempoRealEnvio(ctx, args.codigo));
      break;
    case "4":
      if (!args.deposito) throw new Error("OP-4 requiere --deposito");
      printObject(await redistribucionDepositoInoperativo(ctx, args.deposito));
      break;
    case "5":
      printObject(
        await cierreTurnoConsolidacion(ctx, {
          horasTurno: args.horas ? Number(args.horas) : 8,
        }),
      );
      break;
    default:
      throw new Error(`Operación --op ${op} no válida (use 1-5).`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const opCli = args.op;

  if (opCli) {
    let ctx;
    try {
      ctx = await conectarLosTresMotores();
      await ejecutarOpNoInteractiva(String(opCli), ctx, args);
    } catch (err) {
      errorLine(err?.message ?? String(err));
      process.exitCode = 1;
    } finally {
      if (ctx) await ctx.cleanup();
    }
    return;
  }

  const rl = readline.createInterface({ input, output });
  let ctx = null;

  try {
    while (true) {
      console.clear();
      tituloPrincipal();
      console.log(
        paint("  MongoDB + Neo4j + Redis", ansi.dim) +
          paint(" · operaciones de negocio integradas", ansi.dim),
      );
      console.log();
      for (const line of lineasMenuPoliglota()) {
        console.log("   " + line);
      }
      console.log();
      const op = (await rl.question(paint("Opción: ", ansi.bold + ansi.green))).trim();

      if (op === "0") break;

      try {
        if (!ctx) {
          console.log();
          console.log("  " + bannerLine(56));
          console.log(paint("  Conectando a los tres motores…", ansi.dim));
          ctx = await conectarLosTresMotores();
          success(
            `Conectado · MongoDB + Neo4j (${nombreBaseNeo4j()}) + Redis`,
          );
          console.log("  " + bannerLine(56));
        }
        await ejecutarOpDesdeCli(op, ctx, rl);
      } catch (err) {
        console.log();
        errorLine(err?.message ?? String(err));
      }

      await pausa(rl);
    }
  } finally {
    rl.close();
    if (ctx) await ctx.cleanup();
  }
}

main().catch((e) => {
  errorLine(e?.message ?? String(e));
  process.exit(1);
});
