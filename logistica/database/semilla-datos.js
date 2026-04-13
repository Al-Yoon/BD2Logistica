/**
 * Carga datos de prueba coherentes con las consultas del TP (MongoDB).
 *
 * Uso:
 *   node logistica/database/semilla-datos.js
 *   node logistica/database/semilla-datos.js --limpiar
 */
import { ObjectId } from "mongodb";
import { conectarMongo } from "./mongo.js";
import { asegurarIndices } from "./indices.js";
import { insertarMuchos } from "./insertar.js";

function rnd(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[rnd(0, arr.length - 1)];
}

function pad(n, w) {
  return String(n).padStart(w, "0");
}

const CIUDADES = [
  "Buenos Aires",
  "Córdoba",
  "Rosario",
  "Mendoza",
  "La Plata",
  "Tucumán",
  "Mar del Plata",
  "Salta",
  "Santa Fe",
  "San Juan",
  "Resistencia",
  "Neuquén",
];

const ESTADOS_FLUJO = ["creado", "en_deposito", "en_transito", "en_reparto", "entregado"];

export const CANTIDAD_ENVIOS_SEMILLA = 1000;

export async function limpiarColeccionesLogistica(db) {
  const orden = [
    "eventos_tracking",
    "envios",
    "rutas",
    "repartidores",
    "depositos",
    "clientes",
  ];
  for (const c of orden) {
    await db.collection(c).deleteMany({});
  }
}

function buildClientes() {
  const docs = [];
  for (let i = 0; i < 50; i++) {
    const esEmpresa = i >= 40;
    docs.push({
      _id: new ObjectId(),
      nombre: esEmpresa ? `Empresa Logística ${i + 1} S.A.` : `Cliente Particular ${i + 1}`,
      tipo: esEmpresa ? "empresa" : "particular",
    });
  }
  return docs;
}

function buildDepositos() {
  const docs = [];
  for (let i = 0; i < 5; i++) {
    const capacidad = rnd(8000, 20000);
    docs.push({
      _id: new ObjectId(),
      nombre: `Depósito ${i + 1}`,
      ciudad: pick(CIUDADES),
      capacidad_max: capacidad,
      paquetes_stock_actual: rnd(0, capacidad),
    });
  }
  return docs;
}

function buildRepartidores() {
  const docs = [];
  for (let i = 0; i < 20; i++) {
    docs.push({
      _id: new ObjectId(),
      nombre: `Repartidor ${i + 1}`,
      ciudad_base: pick(CIUDADES),
    });
  }
  return docs;
}

function buildEnvios(clientes, repartidores) {
  const ahora = Date.now();
  const docs = [];

  for (let i = 0; i < CANTIDAD_ENVIOS_SEMILLA; i++) {
    const cliente = pick(clientes);
    const rep = Math.random() < 0.9 ? pick(repartidores) : null;

    const horasAtras = rnd(1, 24 * 45);
    const fechaEstimada = new Date(ahora - horasAtras * 60 * 60 * 1000);

    const entregado = Math.random() < 0.72;
    const estado = entregado ? "entregado" : pick(ESTADOS_FLUJO.slice(0, 4));

    const demoraHoras = entregado ? rnd(-6, 72) : null;
    const fechaEntregaReal = entregado
      ? new Date(fechaEstimada.getTime() + demoraHoras * 60 * 60 * 1000)
      : null;

    const entregaPrimerIntento = entregado ? Math.random() < 0.75 : false;

    docs.push({
      _id: new ObjectId(),
      codigo_seguimiento: `TRK-${pad(i + 1, 7)}`,
      cliente_remitente_id: cliente._id,
      estado_actual: estado,
      fecha_estimada_entrega: fechaEstimada,
      fecha_entrega_real: fechaEntregaReal,
      incidencias: rnd(0, 3),
      repartidor_entrega_id: entregado ? rep?._id ?? null : null,
      entrega_primer_intento: entregaPrimerIntento,
    });
  }

  return docs;
}

function buildEventosTracking(envios) {
  const docs = [];

  for (const e of envios) {
    const n = rnd(3, 8);
    const base = e.fecha_estimada_entrega?.getTime?.() ?? Date.now();
    for (let i = 0; i < n; i++) {
      docs.push({
        _id: new ObjectId(),
        codigo_seguimiento: e.codigo_seguimiento,
        timestamp: new Date(base - (n - i) * rnd(1, 6) * 60 * 60 * 1000),
        evento: pick(ESTADOS_FLUJO),
      });
    }
  }

  return docs;
}

export async function cargarSemilla(db, opts = {}) {
  const { limpiarPrimero = false, log = console } = opts;

  if (limpiarPrimero) {
    log.log("Limpiando colecciones…");
    await limpiarColeccionesLogistica(db);
  }

  log.log("Creando índices…");
  await asegurarIndices(db);

  log.log("Generando documentos…");
  const clientes = buildClientes();
  const depositos = buildDepositos();
  const repartidores = buildRepartidores();
  const envios = buildEnvios(clientes, repartidores);
  const eventos = buildEventosTracking(envios);

  log.log("Insertando…");
  await insertarMuchos(db.collection("clientes"), clientes, { log });
  await insertarMuchos(db.collection("depositos"), depositos, { log });
  await insertarMuchos(db.collection("repartidores"), repartidores, { log });
  await insertarMuchos(db.collection("envios"), envios, { log, chunkSize: 1000 });
  await insertarMuchos(db.collection("eventos_tracking"), eventos, { log, chunkSize: 2000 });

  return {
    ok: true,
    stats: {
      clientes: clientes.length,
      depositos: depositos.length,
      repartidores: repartidores.length,
      envios: envios.length,
      eventos_tracking: eventos.length,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const limpiar = args.includes("--limpiar");

  const { client, db } = await conectarMongo();
  try {
    const r = await cargarSemilla(db, { limpiarPrimero: limpiar, log: console });
    console.log("\nOK");
    console.log(r.stats);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

