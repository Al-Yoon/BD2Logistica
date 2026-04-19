/**
 * Menú interactivo: elegir base (MongoDB / Neo4j) y ejecutar consultas del TP.
 *
 * Uso:
 *   node logistica/cli/ejecutar-consultas.js
 *   node logistica/cli/ejecutar-consultas.js --todas
 *   node logistica/cli/ejecutar-consultas.js --todas-neo4j
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { conectarMongo } from "../mongo/mongo.js";
import { conectarNeo4j, nombreBaseNeo4j } from "../neo4j/neo4j.js";
import {
  historialPorCodigoSeguimiento,
  enviosDemoradosNoEntregados,
  reporteMensualClienteCorporativo,
  repartidoresMejorPrimerIntentoUltimosDias,
  depositosOcupacionSuperiorA,
  buscarEnvioPorCodigo,
} from "../mongo/consultas.js";
import {
  rutaMasCorta,
  rutaMasRapida,
  enviosAfectadosDeposito,
  rutasAlternativasSinDeposito,
  depositosCriticos,
  optimizacionRutasConceptual,
  listarNombresDepositos,
} from "../neo4j/consultas.js";
import {
  bannerLine,
  section,
  printObject,
  success,
  warn,
  errorLine,
  hint,
  paint,
  ansi,
} from "../shared/terminal-ui.js";

async function codigoPorDefecto(db) {
  return (
    await db.collection("envios").findOne({}, { projection: { codigo_seguimiento: 1 } })
  )?.codigo_seguimiento;
}

async function pausa(rl, msg = "\nEnter para continuar…") {
  await rl.question(paint(msg, ansi.dim));
}

function tituloPrincipal() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.cyan + ansi.bold) +
      paint("TP Logística — Bases de datos", ansi.bold + ansi.white) +
      paint("  ═══", ansi.cyan + ansi.bold),
  );
}

function lineasMenuPrincipal() {
  return [
    paint("1", ansi.yellow + ansi.bold) + "  MongoDB — consultas documentales (aggregate, find)",
    paint("2", ansi.yellow + ansi.bold) + "  Neo4j — consultas Cypher (grafos, rutas)",
    paint("0", ansi.yellow + ansi.bold) + "  Salir",
  ];
}

function tituloMongo() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.cyan + ansi.bold) +
      paint("MongoDB — Logística", ansi.bold + ansi.white) +
      paint("  ═══", ansi.cyan + ansi.bold),
  );
}

function tituloNeo4j() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.magenta + ansi.bold) +
      paint("Neo4j — Grafo logístico", ansi.bold + ansi.white) +
      paint("  ═══", ansi.magenta + ansi.bold),
  );
}

function lineasSubmenuNeo4j() {
  return [
    paint("1", ansi.yellow + ansi.bold) + "  a) Ruta más corta (shortestPath)",
    paint("2", ansi.yellow + ansi.bold) + "  b) Ruta más rápida (suma de tiempos en aristas)",
    paint("3", ansi.yellow + ansi.bold) + "  c) Impacto depósito caído (envíos + rutas alternativas)",
    paint("4", ansi.yellow + ansi.bold) + "  d) Depósitos críticos (grado de conexiones)",
    paint("5", ansi.yellow + ansi.bold) + "  e) Optimización de rutas (ejemplo conceptual)",
    paint("6", ansi.yellow + ansi.bold) + "  Listar depósitos en el grafo",
    paint("7", ansi.yellow + ansi.bold) + "  Ejecutar todas las consultas (valores por defecto del TP)",
    paint("0", ansi.yellow + ansi.bold) + "  Volver al menú principal",
  ];
}

function lineasSubmenuConsultas() {
  return [
    paint("1", ansi.yellow + ansi.bold) + "  Historial por código de seguimiento ",
    paint("2", ansi.yellow + ansi.bold) + "  Envíos demorados y no entregados ",
    paint("3", ansi.yellow + ansi.bold) + "  Reporte mensual — cliente corporativo ",
    paint("4", ansi.yellow + ansi.bold) + "  Repartidores — mejor primer intento ",
    paint("5", ansi.yellow + ansi.bold) + "  Depósitos — ocupación superior a umbral ",
    paint("6", ansi.yellow + ansi.bold) + "  Buscar envío por código (documento completo)",
    paint("7", ansi.yellow + ansi.bold) + "  Ejecutar todas las consultas (resumen)",
    paint("0", ansi.yellow + ansi.bold) + "  Volver al menú principal",
  ];
}

async function ejecutar4a(db, rl, codigoDef) {
  let codigo = (await rl.question(`Código de seguimiento [${codigoDef ?? "-"}] `)).trim();
  if (!codigo) codigo = codigoDef;
  if (!codigo) {
    warn("No hay código por defecto en la base.");
    return;
  }
  section(`Historial: ${codigo}`);
  const hist = await historialPorCodigoSeguimiento(db, codigo);
  success(`${hist.length} evento(s).`);
  printObject(hist, { maxArrayLength: 50 });
}

async function ejecutar4b(db) {
  section("Envíos demorados (>24 h) y no entregados");
  const dem = await enviosDemoradosNoEntregados(db);
  success(`Total: ${dem.length}`);
  printObject(dem, { maxArrayLength: 12 });
}

async function ejecutar4c(db, rl) {
  const empresas = await db
    .collection("clientes")
    .find({ tipo: "empresa" }, { projection: { _id: 1, nombre: 1 } })
    .limit(15)
    .toArray();
  if (!empresas.length) {
    warn("No hay clientes tipo empresa.");
    return;
  }
  console.log();
  empresas.forEach((c, i) => {
    console.log(
      `  ${paint(String(i + 1), ansi.dim)}  ${c.nombre}  ${paint(c._id.toString(), ansi.gray)}`,
    );
  });
  const pickStr = (await rl.question("\nNúmero de cliente [1]")).trim() || "1";
  const idx = Number(pickStr) - 1;
  const empresa = empresas[idx];
  if (!empresa) {
    errorLine("Selección inválida.");
    return;
  }
  const ref = await db.collection("envios").findOne(
    { cliente_remitente_id: empresa._id },
    { projection: { fecha_estimada_entrega: 1 } },
  );
  const d = ref?.fecha_estimada_entrega ?? new Date();
  const defAnio = String(d.getUTCFullYear());
  const defMes = String(d.getUTCMonth() + 1);
  const anioStr = (await rl.question(`Año (UTC) [${defAnio}] `)).trim() || defAnio;
  const mesStr = (await rl.question(`Mes 1-12 (UTC) [${defMes}] `)).trim() || defMes;
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  if (!Number.isFinite(anio) || !Number.isFinite(mes) || mes < 1 || mes > 12) {
    errorLine("Año o mes inválido.");
    return;
  }
  section(`Reporte mensual: ${empresa.nombre}`);
  const rep = await reporteMensualClienteCorporativo(db, empresa._id, anio, mes);
  printObject(rep);
}

async function ejecutar4d(db, rl) {
  const diasStr = (await rl.question("Ventana en días [30]: ")).trim() || "30";
  const dias = Number(diasStr);
  if (!Number.isFinite(dias) || dias < 1) {
    errorLine("Días inválidos.");
    return;
  }
  section(`Mejor primer intento (últimos ${dias} días)`);
  const top = await repartidoresMejorPrimerIntentoUltimosDias(db, dias);
  const ids = top.map((t) => t._id).filter(Boolean);
  const nombres = await db
    .collection("repartidores")
    .find({ _id: { $in: ids } }, { projection: { nombre: 1 } })
    .toArray();
  const mapa = new Map(nombres.map((r) => [r._id.toString(), r.nombre]));
  const enriquecido = top.map((row) => ({
    repartidor_id: row._id?.toString(),
    nombre: mapa.get(row._id?.toString()) ?? "(sin nombre)",
    total_entregas: row.total_entregas,
    primer_intento_ok: row.primer_intento,
    tasa_primer_intento: row.tasa_primer_intento,
  }));
  success(`${enriquecido.length} repartidor(es) con entregas en el período.`);
  printObject(enriquecido, { maxArrayLength: 25 });
}

async function ejecutar4e(db, rl) {
  const umStr = (await rl.question("Umbral de ocupación % [85]: ")).trim() || "85";
  const um = Number(umStr);
  if (!Number.isFinite(um) || um <= 0 || um > 100) {
    errorLine("Umbral inválido (use 1–100).");
    return;
  }
  section(`4.e — Depósitos con ocupación > ${um} %`);
  const dep = await depositosOcupacionSuperiorA(db, um);
  success(`${dep.length} depósito(s).`);
  printObject(dep);
}

async function ejecutarBuscarEnvio(db, rl, codigoDef) {
  let codigo = (await rl.question(`Código [${codigoDef ?? "-"}]: `)).trim();
  if (!codigo) codigo = codigoDef;
  if (!codigo) {
    warn("Indicá un código de seguimiento.");
    return;
  }
  section(`Buscar envío — ${codigo}`);
  const env = await buscarEnvioPorCodigo(db, codigo);
  if (!env) {
    warn("Sin resultados.");
    return;
  }
  printObject(env);
}

async function ejecutarTodas(db, codigoDef) {
  const codigo = codigoDef;
  if (!codigo) {
    warn("No hay envíos; no se puede demostrar 4.a.");
    return;
  }
  section("4.a — Historial (demo)");
  printObject(await historialPorCodigoSeguimiento(db, codigo), { maxArrayLength: 15 });

  await ejecutar4b(db);

  const empresa = await db.collection("clientes").findOne({ tipo: "empresa" });
  if (empresa) {
    const ref = await db.collection("envios").findOne(
      { cliente_remitente_id: empresa._id },
      { projection: { fecha_estimada_entrega: 1 } },
    );
    const d = ref?.fecha_estimada_entrega ?? new Date();
    section("4.c — Reporte mensual (demo, primera empresa)");
    printObject(
      await reporteMensualClienteCorporativo(
        db,
        empresa._id,
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
      ),
    );
  }

  section("4.d — Primer intento (30 días, demo)");
  const top = await repartidoresMejorPrimerIntentoUltimosDias(db, 30);
  printObject(top.slice(0, 10), { maxArrayLength: 15 });

  section("4.e — Depósitos >85 % (demo)");
  printObject(await depositosOcupacionSuperiorA(db, 85));
}

const DEF_NEO_ORIGEN = "Deposito principal";
const DEF_NEO_DESTINO = "Deposito zona oeste";
const DEF_NEO_EVITAR = "Deposito principal";
const DEF_NEO_ALT_ORIGEN = "Deposito norte";
const DEF_NEO_ALT_DESTINO = "Deposito sur";
const DEF_NEO_DESTINOS_MULTI = ["Deposito norte", "Deposito sur", "Deposito este"];

async function neoEjecutar1(session, rl) {
  let o = (await rl.question(`Depósito origen [${DEF_NEO_ORIGEN}] `)).trim() || DEF_NEO_ORIGEN;
  let d = (await rl.question(`Depósito destino [${DEF_NEO_DESTINO}] `)).trim() || DEF_NEO_DESTINO;
  section(`Neo4j a) Ruta más corta: ${o} → ${d}`);
  const rows = await rutaMasCorta(session, o, d);
  if (!rows.length) {
    warn("Sin camino (revisá nombres o datos en Neo4j).");
    return;
  }
  success("1 resultado.");
  printObject(rows);
}

async function neoEjecutar2(session, rl) {
  let o = (await rl.question(`Depósito origen [${DEF_NEO_ORIGEN}] `)).trim() || DEF_NEO_ORIGEN;
  let d = (await rl.question(`Depósito destino [${DEF_NEO_DESTINO}] `)).trim() || DEF_NEO_DESTINO;
  section(`Neo4j b) Ruta más rápida: ${o} → ${d}`);
  const rows = await rutaMasRapida(session, o, d);
  if (!rows.length) {
    warn("Sin camino.");
    return;
  }
  success("Mejor ruta por suma de `tiempo` en CONECTADO_A.");
  printObject(rows);
}

async function neoEjecutar3(session, rl) {
  const dep = (await rl.question(`Depósito caído [${DEF_NEO_EVITAR}] `)).trim() || DEF_NEO_EVITAR;
  section(`Neo4j c-1) Envíos afectados — ${dep}`);
  const afect = await enviosAfectadosDeposito(session, dep);
  success(`${afect.length} envío(s).`);
  printObject(afect);

  let o = (await rl.question(`\nRuta alternativa: origen [${DEF_NEO_ALT_ORIGEN}] `)).trim() || DEF_NEO_ALT_ORIGEN;
  let dest = (await rl.question(`Ruta alternativa: destino [${DEF_NEO_ALT_DESTINO}] `)).trim() || DEF_NEO_ALT_DESTINO;
  let ev = (await rl.question(`Evitar nodo [${DEF_NEO_EVITAR}] `)).trim() || DEF_NEO_EVITAR;
  const limStr = (await rl.question("Máx. rutas [5] ")).trim() || "5";
  const lim = Number(limStr);
  section(`Neo4j c-2) Rutas ${o} → ${dest} sin pasar por ${ev}`);
  if (!Number.isFinite(lim) || lim < 1) {
    errorLine("Límite inválido.");
    return;
  }
  const alt = await rutasAlternativasSinDeposito(session, o, dest, ev, lim);
  success(`${alt.length} ruta(s).`);
  printObject(alt);
}

async function neoEjecutar4(session) {
  section("Neo4j d) Depósitos críticos");
  const rows = await depositosCriticos(session);
  success(`${rows.length} depósito(s).`);
  printObject(rows);
}

async function neoEjecutar5(session, rl) {
  let ini = (await rl.question(`Punto de partida [${DEF_NEO_ORIGEN}] `)).trim() || DEF_NEO_ORIGEN;
  const raw = (
    await rl.question(`Destinos (coma-separados) [${DEF_NEO_DESTINOS_MULTI.join(", ")}] `)
  ).trim();
  const destinos = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [...DEF_NEO_DESTINOS_MULTI];
  section(`Neo4j e) Optimización conceptual — desde ${ini}`);
  const rows = await optimizacionRutasConceptual(session, ini, destinos);
  printObject(rows);
}

async function neoListarDepositos(session) {
  section("Nodos Deposito");
  const nombres = await listarNombresDepositos(session);
  success(`${nombres.length} depósito(s).`);
  printObject(nombres);
}

async function ejecutarTodasNeo4j(session) {
  section("Neo4j — Todas (demo)");
  printObject(await rutaMasCorta(session, DEF_NEO_ORIGEN, DEF_NEO_DESTINO));
  section("b) Ruta más rápida");
  printObject(await rutaMasRapida(session, DEF_NEO_ORIGEN, DEF_NEO_DESTINO));
  section("c-1) Envíos afectados");
  printObject(await enviosAfectadosDeposito(session, DEF_NEO_EVITAR));
  section("c-2) Rutas alternativas");
  printObject(
    await rutasAlternativasSinDeposito(
      session,
      DEF_NEO_ALT_ORIGEN,
      DEF_NEO_ALT_DESTINO,
      DEF_NEO_EVITAR,
      5,
    ),
  );
  section("d) Depósitos críticos");
  printObject(await depositosCriticos(session));
  section("e) Optimización conceptual");
  printObject(await optimizacionRutasConceptual(session, DEF_NEO_ORIGEN, DEF_NEO_DESTINOS_MULTI));
}

async function bucleSubmenuNeo4j(session, rl) {
  while (true) {
    console.clear();
    tituloNeo4j();
    console.log(
      paint("  ▸ Consultas Cypher", ansi.bold + ansi.magenta) +
        paint(` · base: ${nombreBaseNeo4j()}`, ansi.dim),
    );
    console.log();
    for (const line of lineasSubmenuNeo4j()) {
      console.log("   " + line);
    }
    console.log();
    const op = (await rl.question(paint("Opción: ", ansi.bold + ansi.green))).trim();

    if (op === "0") return;

    try {
      switch (op) {
        case "1":
          await neoEjecutar1(session, rl);
          break;
        case "2":
          await neoEjecutar2(session, rl);
          break;
        case "3":
          await neoEjecutar3(session, rl);
          break;
        case "4":
          await neoEjecutar4(session);
          break;
        case "5":
          await neoEjecutar5(session, rl);
          break;
        case "6":
          await neoListarDepositos(session);
          break;
        case "7":
          await ejecutarTodasNeo4j(session);
          break;
        default:
          errorLine("Opción no reconocida.");
      }
    } catch (err) {
      console.log();
      errorLine(err?.message ?? String(err));
    }

    await pausa(rl);
  }
}

async function bucleSubmenuConsultas(db, rl) {
  while (true) {
    console.clear();
    tituloMongo();
    console.log(
      paint("  ▸ Consultas", ansi.bold + ansi.magenta) +
        paint(` · base: ${db.databaseName}`, ansi.dim),
    );
    console.log();
    for (const line of lineasSubmenuConsultas()) {
      console.log("   " + line);
    }
    const nEnv = await db.collection("envios").estimatedDocumentCount();
    hint(`Envíos en base: ${nEnv}`);
    console.log();
    const op = (await rl.question(paint("Opción: ", ansi.bold + ansi.green))).trim();
    const codigoDef = await codigoPorDefecto(db);

    if (op === "0") return;

    try {
      switch (op) {
        case "1":
          await ejecutar4a(db, rl, codigoDef);
          break;
        case "2":
          await ejecutar4b(db);
          break;
        case "3":
          await ejecutar4c(db, rl);
          break;
        case "4":
          await ejecutar4d(db, rl);
          break;
        case "5":
          await ejecutar4e(db, rl);
          break;
        case "6":
          await ejecutarBuscarEnvio(db, rl, codigoDef);
          break;
        case "7":
          await ejecutarTodas(db, codigoDef);
          break;
        default:
          errorLine("Opción no reconocida.");
      }
    } catch (err) {
      console.log();
      errorLine(err?.message ?? String(err));
    }

    await pausa(rl);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const soloTodas = args.includes("--todas") || args.includes("-a");
  const soloTodasNeo = args.includes("--todas-neo4j");

  const rl = readline.createInterface({ input, output });

  /** @type {import("mongodb").MongoClient | null} */
  let mongoClient = null;
  /** @type {import("mongodb").Db | null} */
  let db = null;
  /** @type {import("neo4j-driver").Driver | null} */
  let neoDriver = null;

  try {
    if (soloTodasNeo) {
      const { driver } = await conectarNeo4j();
      neoDriver = driver;
      const session = driver.session({ database: nombreBaseNeo4j() });
      try {
        console.log();
        console.log("  " + bannerLine(56));
        console.log(paint("  Neo4j — todas las consultas (--todas-neo4j)", ansi.bold));
        console.log("  " + bannerLine(56));
        await ejecutarTodasNeo4j(session);
      } finally {
        await session.close();
      }
      return;
    }

    if (soloTodas) {
      const r = await conectarMongo();
      mongoClient = r.client;
      db = r.db;
      const nEnv = await db.collection("envios").estimatedDocumentCount();
      console.log();
      console.log("  " + bannerLine(56));
      console.log(paint("  Ejecutando todas las consultas MongoDB (--todas)", ansi.bold));
      console.log("  " + bannerLine(56));
      if (nEnv === 0) {
        warn("No hay envíos en la base; no se pueden ejecutar las consultas de demo.");
        return;
      }
      const codigoDef = await codigoPorDefecto(db);
      await ejecutarTodas(db, codigoDef);
      return;
    }

    while (true) {
      console.clear();
      tituloPrincipal();
      console.log();
      for (const line of lineasMenuPrincipal()) {
        console.log("   " + line);
      }
      console.log();
      const op = (await rl.question(paint("Opción: ", ansi.bold + ansi.green))).trim();

      if (op === "0") break;

      if (op === "1") {
        try {
          if (!mongoClient || !db) {
            const r = await conectarMongo();
            mongoClient = r.client;
            db = r.db;
          }
          console.log();
          console.log("  " + bannerLine(56));
          success(`MongoDB — base: ${db.databaseName}`);
          console.log("  " + bannerLine(56));
          await bucleSubmenuConsultas(db, rl);
        } catch (err) {
          console.log();
          errorLine(err?.message ?? String(err));
          await pausa(rl);
        }
        continue;
      }

      if (op === "2") {
        let session;
        try {
          if (!neoDriver) {
            const r = await conectarNeo4j();
            neoDriver = r.driver;
          }
          session = neoDriver.session({ database: nombreBaseNeo4j() });
          console.log();
          console.log("  " + bannerLine(56));
          success(`Neo4j — base: ${nombreBaseNeo4j()}`);
          console.log("  " + bannerLine(56));
          await bucleSubmenuNeo4j(session, rl);
        } catch (err) {
          console.log();
          errorLine(err?.message ?? String(err));
          await pausa(rl);
        } finally {
          if (session) await session.close();
        }
        continue;
      }

      errorLine("Opción no reconocida.");
      await pausa(rl);
    }
  } finally {
    rl.close();
    if (mongoClient) await mongoClient.close();
    if (neoDriver) await neoDriver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
