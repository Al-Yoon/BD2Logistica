/**
 * Operaciones de persistencia poliglota (TP sección 4.2): OP-1 … OP-5.
 *
 * @typedef {{ db: import("mongodb").Db, session: import("neo4j-driver").Session, redis: import("redis").RedisClientType }} ContextoPoliglota
 */

import {
  historialPorCodigoSeguimiento,
  enviosDemoradosNoEntregados,
  clientesCorporativosConSlaEnRiesgo,
  buscarEnvioPorCodigo,
  enviosEnDeposito,
  registrarAsignacionEnvio,
  metricasCierreTurno,
  persistirResumenTurno,
  tiemposTransitoObservadosEnTurno,
  listarDepositosMaestros,
  coordenadasEntrega,
  depositosRutaEnvio,
  repartidorAsignadoId,
} from "../mongo/consultas.js";
import {
  rutaMasRapida,
  rutasAlternativasDesdeDeposito,
  depositoAlternativoMasCercano,
  rutaRedistribucionEnvio,
  actualizarPesosRutasPorTiempos,
  listarNombresDepositos,
} from "../neo4j/consultas.js";
import { k } from "../redis/redis.js";
import {
  listarPosicionesRepartidoresActivos,
  tamaniosColasDespacho,
  depositosConOcupacionCritica,
  repartidoresDisponiblesCercanos,
  pasarAEnRutaAtomico,
  distanciaRepartidorADestino,
  estadoFinalRepartidoresActivos,
  limpiarReservasExpiradas,
  metricasColasDespacho,
  vaciarColasCompletadas,
  liberarReserva,
  listarDepositosConCola,
} from "../redis/operaciones.js";

function msDesde(t0) {
  return Date.now() - t0;
}

/**
 * OP-1 — Dashboard operativo en tiempo real (* tres motores).
 */
export async function dashboardOperativo(ctx, opts = {}) {
  const t0 = Date.now();
  const umbral = opts.umbralOcupacion ?? 0.85;
  const horasSla = opts.horasSlaUmbral ?? 24;

  const depositosMongo = await listarDepositosMaestros(ctx.db);
  let depositoIds = depositosMongo.map((d) => d.nombre ?? d.id).filter(Boolean);
  if (!depositoIds.length) {
    depositoIds = await listarDepositosConCola(ctx.redis);
  }

  const tRedis = Date.now();
  const [posiciones, colas, criticosRedis] = await Promise.all([
    listarPosicionesRepartidoresActivos(ctx.redis, opts.limiteRepartidores ?? 100),
    tamaniosColasDespacho(ctx.redis, depositoIds),
    depositosConOcupacionCritica(ctx.redis, depositoIds, umbral),
  ]);
  const tiempoRedisMs = msDesde(tRedis);

  const tMongo = Date.now();
  const [demorados, slaRiesgo] = await Promise.all([
    enviosDemoradosNoEntregados(ctx.db),
    clientesCorporativosConSlaEnRiesgo(ctx.db, horasSla),
  ]);
  const tiempoMongoMs = msDesde(tMongo);

  const tNeo = Date.now();
  const rutasAlternativas = [];
  const nombresNeo = await listarNombresDepositos(ctx.session);
  for (const crit of criticosRedis.slice(0, opts.maxRutasAlternativas ?? 3)) {
    const depCritico = crit.depositoId;
    const destino = nombresNeo.find((n) => n !== depCritico);
    if (!destino) continue;
    const rutas = await rutasAlternativasDesdeDeposito(
      ctx.session,
      depCritico,
      destino,
      2,
    );
    rutasAlternativas.push({ deposito_critico: depCritico, hacia: destino, rutas });
  }
  const tiempoNeo4jMs = msDesde(tNeo);

  return {
    operacion: "OP-1",
    descripcion: "Dashboard operativo en tiempo real",
    motores: ["redis", "mongodb", "neo4j"],
    redis: {
      repartidores_activos: posiciones.length,
      posiciones,
      colas_despacho: colas,
      depositos_ocupacion_critica: criticosRedis,
    },
    mongodb: {
      envios_demorados: demorados,
      clientes_sla_en_riesgo: slaRiesgo,
    },
    neo4j: { rutas_alternativas_depositos_criticos: rutasAlternativas },
    tiempos_ms: {
      redis: tiempoRedisMs,
      mongodb: tiempoMongoMs,
      neo4j: tiempoNeo4jMs,
      total: msDesde(t0),
    },
  };
}

/**
 * OP-2 — Asignación inteligente de envío (* tres motores).
 */
export async function asignacionInteligenteEnvio(ctx, params) {
  const t0 = Date.now();
  const codigo = String(params.codigoSeguimiento ?? params.codigo ?? "").trim();
  const zona = String(params.zona ?? "zona_norte");
  if (!codigo) throw new Error("codigoSeguimiento requerido");

  const envio = await buscarEnvioPorCodigo(ctx.db, codigo);
  if (!envio) throw new Error(`Envío no encontrado: ${codigo}`);

  const coords = coordenadasEntrega(envio);
  if (!coords) {
    throw new Error(
      "El envío no tiene coordenadas de entrega (direccion_entrega.coordenadas o equivalente).",
    );
  }

  const tRedis = Date.now();
  const candidatos = await repartidoresDisponiblesCercanos(
    ctx.redis,
    zona,
    coords.lon,
    coords.lat,
    3,
  );
  if (!candidatos.length) {
    return {
      operacion: "OP-2",
      asignado: false,
      motivo: "No hay repartidores disponibles cercanos en Redis",
      envio: {
        codigo_seguimiento: codigo,
        peso_kg: envio.peso_kg,
        tipo_envio: envio.tipo_envio,
        sla: envio.fecha_estimada_entrega,
      },
      tiempos_ms: { total: msDesde(t0) },
    };
  }

  let repartidorId = null;
  let reservaKey = null;
  for (const rid of candidatos) {
    const r = await pasarAEnRutaAtomico(ctx.redis, rid, zona, codigo);
    if (r.reservado) {
      repartidorId = rid;
      reservaKey = r.reservaKey;
      break;
    }
  }
  const tiempoRedisMs = msDesde(tRedis);

  if (!repartidorId) {
    return {
      operacion: "OP-2",
      asignado: false,
      motivo: "No se pudo reservar repartidor (SETNX / ya en ruta)",
      candidatos,
      tiempos_ms: { redis: tiempoRedisMs, total: msDesde(t0) },
    };
  }

  const { origen, destino } = depositosRutaEnvio(envio);
  let rutaNeo = [];
  const tNeo = Date.now();
  if (origen && destino) {
    rutaNeo = await rutaMasRapida(ctx.session, origen, destino);
  }
  const tiempoNeo4jMs = msDesde(tNeo);

  const tMongo = Date.now();
  const evento = await registrarAsignacionEnvio(ctx.db, codigo, repartidorId, {
    coordenadas_entrega: coords,
    zona,
  });
  const repartidor =
    (await ctx.db.collection("repartidores").findOne(
      { _id: envio.repartidor_asignado_id ?? repartidorId },
      { projection: { nombre: 1, vehiculo: 1 } },
    )) ??
    (await ctx.db
      .collection("repartidores")
      .findOne({ codigo: repartidorId }, { projection: { nombre: 1, vehiculo: 1 } }));
  const tiempoMongoMs = msDesde(tMongo);

  return {
    operacion: "OP-2",
    asignado: true,
    motores: ["redis", "neo4j", "mongodb"],
    envio: {
      codigo_seguimiento: codigo,
      direccion: coords,
      peso_kg: envio.peso_kg,
      tipo_envio: envio.tipo_envio,
      fecha_estimada_entrega: envio.fecha_estimada_entrega,
    },
    repartidor: {
      id: repartidorId,
      nombre: repartidor?.nombre,
      vehiculo: repartidor?.vehiculo,
      reserva_redis: reservaKey,
      candidatos_evaluados: candidatos,
    },
    neo4j: { ruta_optima_depositos: rutaNeo, origen, destino },
    mongodb: { evento_asignacion: evento },
    tiempos_ms: {
      redis: tiempoRedisMs,
      neo4j: tiempoNeo4jMs,
      mongodb: tiempoMongoMs,
      total: msDesde(t0),
    },
  };
}

/**
 * OP-3 — Seguimiento en tiempo real de un envío (MongoDB + Redis).
 */
export async function seguimientoTiempoRealEnvio(ctx, codigoSeguimiento) {
  const t0 = Date.now();
  const codigo = String(codigoSeguimiento).trim();
  if (!codigo) throw new Error("codigoSeguimiento requerido");

  const tMongo = Date.now();
  const [envio, historial] = await Promise.all([
    buscarEnvioPorCodigo(ctx.db, codigo),
    historialPorCodigoSeguimiento(ctx.db, codigo),
  ]);
  const tiempoMongoMs = msDesde(tMongo);

  if (!envio) throw new Error(`Envío no encontrado: ${codigo}`);

  const rid = repartidorAsignadoId(envio);
  const coords = coordenadasEntrega(envio);

  const tRedis = Date.now();
  let posicion = null;
  let distancia_km = null;
  if (rid) {
    const geoKey = k("geo", "repartidores");
    const posArr = await ctx.redis.geoPos(geoKey, rid);
    posicion = posArr?.[0] ?? null;
    if (coords) {
      distancia_km = await distanciaRepartidorADestino(
        ctx.redis,
        rid,
        coords.lon,
        coords.lat,
        "km",
      );
    }
  }
  const tiempoRedisMs = msDesde(tRedis);

  return {
    operacion: "OP-3",
    descripcion: "Seguimiento en tiempo real (sin Neo4j)",
    motores: ["mongodb", "redis"],
    codigo_seguimiento: codigo,
    mongodb: {
      estado_actual: envio.estado_actual,
      historial_tracking: historial,
    },
    redis: {
      repartidor_asignado_id: rid,
      posicion_actual: posicion,
      distancia_a_entrega_km: distancia_km,
    },
    tiempos_ms: {
      mongodb: tiempoMongoMs,
      redis: tiempoRedisMs,
      total: msDesde(t0),
    },
  };
}

/**
 * OP-4 — Redistribución ante depósito inoperativo (MongoDB + Neo4j).
 */
export async function redistribucionDepositoInoperativo(ctx, nombreDeposito) {
  const t0 = Date.now();
  const dep = String(nombreDeposito).trim();
  if (!dep) throw new Error("nombreDeposito requerido");

  const tMongo = Date.now();
  const pendientes = await enviosEnDeposito(ctx.db, dep);
  const tiempoMongoMs = msDesde(tMongo);

  const tNeo = Date.now();
  const alternativos = await depositoAlternativoMasCercano(ctx.session, dep, 5);
  const plan = [];
  const destinoAlt = alternativos[0]?.deposito_alternativo;
  for (const env of pendientes) {
    const origenEnv = env.deposito_actual ?? env.deposito_actual_nombre ?? dep;
    let ruta = [];
    if (destinoAlt) {
      ruta = await rutaRedistribucionEnvio(ctx.session, origenEnv, destinoAlt, dep);
    }
    plan.push({
      codigo_seguimiento: env.codigo_seguimiento,
      deposito_origen: origenEnv,
      deposito_alternativo: destinoAlt ?? null,
      ruta,
    });
  }
  const tiempoNeo4jMs = msDesde(tNeo);

  return {
    operacion: "OP-4",
    descripcion: "Redistribución ante depósito inoperativo",
    motores: ["mongodb", "neo4j"],
    deposito_inoperativo: dep,
    mongodb: { envios_pendientes: pendientes },
    neo4j: { depositos_alternativos: alternativos, plan_redistribucion: plan },
    tiempos_ms: {
      mongodb: tiempoMongoMs,
      neo4j: tiempoNeo4jMs,
      total: msDesde(t0),
    },
  };
}

/**
 * OP-5 — Cierre de turno y consolidación de métricas (* tres motores).
 */
export async function cierreTurnoConsolidacion(ctx, params = {}) {
  const t0 = Date.now();
  const horasTurno = Number(params.horasTurno ?? 8);
  const hasta = params.hasta ? new Date(params.hasta) : new Date();
  const desde = params.desde
    ? new Date(params.desde)
    : new Date(hasta.getTime() - horasTurno * 60 * 60 * 1000);

  let depositoIds = params.depositoIds;
  if (!depositoIds?.length) {
    depositoIds = await listarDepositosConCola(ctx.redis);
  }

  const tRedis = Date.now();
  const [estadosRepartidores, reservas, colas, vaciadas] = await Promise.all([
    estadoFinalRepartidoresActivos(ctx.redis),
    limpiarReservasExpiradas(ctx.redis),
    metricasColasDespacho(ctx.redis, depositoIds),
    vaciarColasCompletadas(ctx.redis, depositoIds),
  ]);
  const tiempoRedisMs = msDesde(tRedis);

  const tMongo = Date.now();
  const metricas = await metricasCierreTurno(ctx.db, desde, hasta);
  const observaciones = await tiemposTransitoObservadosEnTurno(ctx.db, desde, hasta);
  const resumen = {
    operacion: "OP-5",
    periodo: { desde, hasta },
    metricas,
    redis: { estados_repartidores: estadosRepartidores, reservas, colas, colas_vaciadas: vaciadas },
  };
  const persistido = await persistirResumenTurno(ctx.db, resumen);
  const tiempoMongoMs = msDesde(tMongo);

  const tNeo = Date.now();
  const pesosActualizados = await actualizarPesosRutasPorTiempos(
    ctx.session,
    observaciones.map((o) => ({
      origen: o.deposito_origen,
      destino: o.deposito_destino,
      tiempoMinutos: o.tiempo_transito_minutos,
    })),
  );
  const tiempoNeo4jMs = msDesde(tNeo);

  return {
    ...resumen,
    motores: ["redis", "mongodb", "neo4j"],
    mongodb: { resumen_persistido: persistido, metricas },
    neo4j: { aristas_actualizadas: pesosActualizados.length, detalle: pesosActualizados },
    tiempos_ms: {
      redis: tiempoRedisMs,
      mongodb: tiempoMongoMs,
      neo4j: tiempoNeo4jMs,
      total: msDesde(t0),
    },
  };
}

/** Libera reserva manual (utilidad tras fallo parcial en OP-2) */
export { liberarReserva };
