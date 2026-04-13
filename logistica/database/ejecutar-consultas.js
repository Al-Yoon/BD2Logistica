/**
 * Menú MongoDB (principal + submenú Consultas).
 *
 * Uso:
 *   node logistica/database/ejecutar-consultas.js
 *   node logistica/database/ejecutar-consultas.js --todas
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { conectarMongo } from "./mongo.js";
import {
  historialPorCodigoSeguimiento,
  enviosDemoradosNoEntregados,
  reporteMensualClienteCorporativo,
  repartidoresMejorPrimerIntentoUltimosDias,
  depositosOcupacionSuperiorA,
  buscarEnvioPorCodigo,
} from "./consultas.js";
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
} from "./terminal-ui.js";

async function codigoPorDefecto(db) {
  return (
    await db.collection("envios").findOne({}, { projection: { codigo_seguimiento: 1 } })
  )?.codigo_seguimiento;
}

async function pausa(rl, msg = "\nEnter para continuar…") {
  await rl.question(paint(msg, ansi.dim));
}

function tituloMongo() {
  console.log();
  console.log(
    paint("  ═══  ", ansi.cyan + ansi.bold) +
      paint("MongoDB — Logística", ansi.bold + ansi.white) +
      paint("  ═══", ansi.cyan + ansi.bold),
  );
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

  const { client, db } = await conectarMongo();
  const rl = readline.createInterface({ input, output });

  try {
    if (soloTodas) {
      const nEnv = await db.collection("envios").estimatedDocumentCount();
      console.log();
      console.log("  " + bannerLine(56));
      console.log(paint("  Ejecutando todas las consultas (--todas)", ansi.bold));
      console.log("  " + bannerLine(56));
      if (nEnv === 0) {
        warn("No hay envíos en la base; no se pueden ejecutar las consultas de demo.");
        return;
      }
      const codigoDef = await codigoPorDefecto(db);
      await ejecutarTodas(db, codigoDef);
      return;
    }

    console.log();
    console.log("  " + bannerLine(56));
    console.log(paint("  Conectado a MongoDB", ansi.bold));
    console.log("  " + bannerLine(56));

    await bucleSubmenuConsultas(db, rl);
  } finally {
    rl.close();
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
