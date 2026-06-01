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
import { conectarRedis } from "../redis/redis.js";
import {
  actualizarPosicionRepartidor,
  tresRepartidoresMasCercanos,
  distanciaRepartidorADestino,
  repartidoresActivosEnRadio,
  encolarEnvio,
  asignarEnvioMayorPrioridad,
  tamanioColaDespacho,
  registrarMovimientoPaquetes,
  depositoOcupacionCritica,
  alertarSiSuperaUmbral,
  listarPosicionesRepartidoresActivos,
} from "../redis/operaciones.js";
import { seedRedisDemo } from "../redis/seed-demo.js";
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
    paint("3", ansi.yellow + ansi.bold) + "  Redis — tiempo real (GEO/HASH/ZSET/STREAM)",
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

function tituloRedis() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.yellow + ansi.bold) +
      paint("Redis — Operación en tiempo real", ansi.bold + ansi.white) +
      paint("  ═══", ansi.yellow + ansi.bold),
  );
}

function lineasSubmenuRedis() {
  return [
    paint("1", ansi.yellow + ansi.bold) + "  3.1.a Actualizar posición de repartidor (GEOADD)",
    paint("2", ansi.yellow + ansi.bold) + "  3.1.b 3 repartidores más cercanos a una coordenada (GEOSEARCH)",
    paint("3", ansi.yellow + ansi.bold) + "  3.1.c Distancia repartidor ↔ destino (GEODIST)",
    paint("4", ansi.yellow + ansi.bold) + "  3.1.d Activos en radio 5 km de una coordenada (GEOSEARCH)",
    paint("5", ansi.yellow + ansi.bold) + "  3.2.a Encolar envío (ZADD)",
    paint("6", ansi.yellow + ansi.bold) + "  3.2.b Asignar mayor prioridad al más cercano (ZSET+GEO+SETNX)",
    paint("7", ansi.yellow + ansi.bold) + "  3.2.d Tamaño de cola por depósito (ZCARD)",
    paint("8", ansi.yellow + ansi.bold) + "  3.3.a/b Movimiento de paquetes (INCR/DECR) + ocupación",
    paint("9", ansi.yellow + ansi.bold) + "  3.3.c/d Detectar >85% + alertar en STREAM (XADD)",
    paint("10", ansi.yellow + ansi.bold) + "  Listar posiciones (demo dashboard)",
    paint("11", ansi.yellow + ansi.bold) + "  Seed demo en Redis (carga datos mínimos)",
    paint("0", ansi.yellow + ansi.bold) + "  Volver al menú principal",
  ];
}

async function bucleSubmenuRedis(redisClient, rl, redisPrefix) {
  while (true) {
    console.clear();
    tituloRedis();
    console.log(paint(`  ▸ Prefijo de keys: ${redisPrefix}`, ansi.dim));
    console.log();
    for (const line of lineasSubmenuRedis()) console.log("   " + line);
    console.log();
    const op = (await rl.question(paint("Opción: ", ansi.bold + ansi.green))).trim();

    if (op === "0") return;

    try {
      switch (op) {
        case "1": {
          const id = (await rl.question("Repartidor ID (ej: R001): ")).trim();
          const lon = (await rl.question("Longitud (ej: -58.3816): ")).trim();
          const lat = (await rl.question("Latitud (ej: -34.6037): ")).trim();
          await actualizarPosicionRepartidor(redisClient, id, Number(lon), Number(lat));
          success("Posición actualizada.");
          break;
        }
        case "2": {
          const lon = Number((await rl.question("Longitud: ")).trim());
          const lat = Number((await rl.question("Latitud: ")).trim());
          section("3 más cercanos");
          printObject(await tresRepartidoresMasCercanos(redisClient, lon, lat));
          break;
        }
        case "3": {
          const id = (await rl.question("Repartidor ID: ")).trim();
          const lon = Number((await rl.question("Destino longitud: ")).trim());
          const lat = Number((await rl.question("Destino latitud: ")).trim());
          section("Distancia (km)");
          printObject(await distanciaRepartidorADestino(redisClient, id, lon, lat, "km"));
          break;
        }
        case "4": {
          const lon = Number((await rl.question("Centro longitud: ")).trim());
          const lat = Number((await rl.question("Centro latitud: ")).trim());
          section("Activos en radio 5 km");
          printObject(await repartidoresActivosEnRadio(redisClient, lon, lat, 5));
          break;
        }
        case "5": {
          const dep = (await rl.question("Depósito ID (ej: DEP01): ")).trim();
          const envio = (await rl.question("Envío ID (ej: ENV-1001): ")).trim();
          const score = Number((await rl.question("Prioridad score (número): ")).trim());
          await encolarEnvio(redisClient, dep, envio, score);
          success("Envío encolado.");
          break;
        }
        case "6": {
          const dep = (await rl.question("Depósito ID (ej: DEP01): ")).trim();
          const zona = (await rl.question("Zona (ej: zona_norte): ")).trim();
          const lon = Number((await rl.question("Entrega longitud: ")).trim());
          const lat = Number((await rl.question("Entrega latitud: ")).trim());
          section("Asignación");
          const r = await asignarEnvioMayorPrioridad(redisClient, dep, zona, lon, lat);
          if (!r) warn("No se pudo asignar (cola vacía o sin repartidores disponibles cercanos).");
          else printObject(r);
          break;
        }
        case "7": {
          const dep = (await rl.question("Depósito ID: ")).trim();
          const n = await tamanioColaDespacho(redisClient, dep);
          success(`Tamaño cola ${dep}: ${n}`);
          break;
        }
        case "8": {
          const dep = (await rl.question("Depósito ID: ")).trim();
          const delta = Number((await rl.question("Delta (+entra / -sale): ")).trim());
          const capStr = (await rl.question("Capacidad máx (opcional): ")).trim();
          const cap = capStr ? Number(capStr) : undefined;
          section("Movimiento");
          const stock = await registrarMovimientoPaquetes(redisClient, dep, delta, cap);
          const st = await depositoOcupacionCritica(redisClient, dep, 0.85);
          printObject({ stock_actual: stock, ...st });
          break;
        }
        case "9": {
          const dep = (await rl.question("Depósito ID: ")).trim();
          section("Chequeo >85% + STREAM");
          const alert = await alertarSiSuperaUmbral(redisClient, dep, 0.85);
          if (!alert) success("OK: no supera umbral o falta capacidad.");
          else printObject(alert);
          break;
        }
        case "10": {
          section("Posiciones activas (limit 50)");
          printObject(await listarPosicionesRepartidoresActivos(redisClient, 50));
          break;
        }
        case "11": {
          await seedRedisDemo(redisClient);
          success("Seed demo cargado.");
          break;
        }
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
  /** @type {import("redis").RedisClientType | null} */
  let redisClient = null;
  /** @type {string} */
  let redisPrefix = "";

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

      if (op === "3") {
        try {
          if (!redisClient) {
            const r = await conectarRedis();
            redisClient = r.client;
            redisPrefix = r.prefix;
          }
          console.log();
          console.log("  " + bannerLine(56));
          success(`Redis — conectado · prefijo: ${redisPrefix}`);
          console.log("  " + bannerLine(56));
          await bucleSubmenuRedis(redisClient, rl, redisPrefix);
        } catch (err) {
          console.log();
          errorLine(err?.message ?? String(err));
          await pausa(rl);
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
    if (redisClient) await redisClient.quit();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
