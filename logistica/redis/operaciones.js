import { k } from "./redis.js";

const GEO_REPARTIDORES = () => k("geo", "repartidores");
const SET_ACTIVOS = () => k("repartidores", "activos");
const HASH_REPARTIDOR = (id) => k("repartidor", id);
const SET_DISPONIBLES_ZONA = (zona) => k("disponibles", zona);
const ZSET_COLA_DESPACHO = (dep) => k("cola", "despacho", dep);
const RESERVA_REPARTIDOR = (id) => k("reserva", id);
const HASH_DEPOSITO = (dep) => k("deposito", dep);
const STOCK_DEPOSITO = (dep) => k("deposito", dep, "stock");
const STREAM_ALERTAS = () => k("stream", "alertas", "depositos");

/**
 * 3.1.a — Actualizar posición (GEOADD)
 * @param {import("redis").RedisClientType} client
 */
export async function actualizarPosicionRepartidor(client, repartidorId, lon, lat) {
  if (!repartidorId) throw new Error("repartidorId requerido");
  const longitude = Number(lon);
  const latitude = Number(lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error("lon/lat inválidos");
  }
  await client.geoAdd(GEO_REPARTIDORES(), { member: String(repartidorId), longitude, latitude });
  await client.sAdd(SET_ACTIVOS(), String(repartidorId));
}

/**
 * 3.1.b — 3 repartidores más cercanos (GEOSEARCH + COUNT)
 */
export async function tresRepartidoresMasCercanos(client, lon, lat) {
  const longitude = Number(lon);
  const latitude = Number(lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error("lon/lat inválidos");
  }
  const members = await client.geoSearch(
    GEO_REPARTIDORES(),
    { longitude, latitude },
    { radius: 50, unit: "km" },
    { SORT: "ASC", COUNT: 3 }
  );
  return members;
}

/**
 * 3.1.c — Distancia repartidor ↔ destino (GEODIST)
 */
export async function distanciaRepartidorADestino(client, repartidorId, lon, lat, unit = "km") {
  const longitude = Number(lon);
  const latitude = Number(lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error("lon/lat inválidos");
  }
  const tmp = k("tmp", "destino", String(Date.now()));
  try {
    await client.geoAdd(GEO_REPARTIDORES(), { member: tmp, longitude, latitude });
    const d = await client.geoDist(GEO_REPARTIDORES(), String(repartidorId), tmp, unit);
    return d;
  } finally {
    await client.zRem(GEO_REPARTIDORES(), tmp);
  }
}

/**
 * 3.1.d — Activos en radio (GEOSEARCH BYRADIUS)
 */
export async function repartidoresActivosEnRadio(client, lon, lat, radiusKm = 5) {
  const longitude = Number(lon);
  const latitude = Number(lat);
  const r = Number(radiusKm);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(r) || r <= 0) {
    throw new Error("lon/lat/radio inválidos");
  }
  return client.geoSearch(
    GEO_REPARTIDORES(),
    { longitude, latitude },
    { radius: r, unit: "km" },
    { SORT: "ASC", COUNT: 1000 }
  );
}

/**
 * Set de disponibilidad por zona.
 */
export async function marcarDisponibleEnZona(client, repartidorId, zona) {
  if (!repartidorId || !zona) throw new Error("repartidorId/zona requeridos");
  await client.sAdd(SET_DISPONIBLES_ZONA(String(zona)), String(repartidorId));
  await client.hSet(HASH_REPARTIDOR(String(repartidorId)), { zona: String(zona), estado: "disponible" });
}

/**
 * 3.1.e — Actualizar estado a 'en_ruta' de forma atómica con la asignación.
 * (MULTI/EXEC: reserva -> hash estado -> quitar de disponibles)
 */
export async function pasarAEnRutaAtomico(client, repartidorId, zona, envioId) {
  const rid = String(repartidorId);
  const z = String(zona);
  const envio = String(envioId);
  const reservaKey = RESERVA_REPARTIDOR(rid);
  const ok = await client.set(reservaKey, envio, { NX: true, EX: 30 });
  if (ok !== "OK") return { reservado: false };

  try {
    const tx = client.multi();
    tx.hSet(HASH_REPARTIDOR(rid), { estado: "en_ruta", envio_asignado: envio });
    tx.sRem(SET_DISPONIBLES_ZONA(z), rid);
    await tx.exec();
    return { reservado: true, reservaKey };
  } catch (e) {
    await client.del(reservaKey);
    throw e;
  }
}

/**
 * 3.2.a — Encolar envío con prioridad (ZADD)
 */
export async function encolarEnvio(client, depositoId, envioId, prioridadScore) {
  const dep = String(depositoId);
  const envio = String(envioId);
  const score = Number(prioridadScore);
  if (!Number.isFinite(score)) throw new Error("prioridadScore inválido (número)");
  await client.zAdd(ZSET_COLA_DESPACHO(dep), { score, value: envio });
}

/**
 * 3.2.d — Tamaño de cola (ZCARD)
 */
export async function tamanioColaDespacho(client, depositoId) {
  return client.zCard(ZSET_COLA_DESPACHO(String(depositoId)));
}

/**
 * 3.2.b/c — Asignar mayor prioridad al repartidor disponible más cercano (ZPOPMAX + GEO + SETNX)
 * Devuelve null si no hay asignación posible.
 */
export async function asignarEnvioMayorPrioridad(client, depositoId, zona, lonEntrega, latEntrega) {
  const dep = String(depositoId);
  const z = String(zona);
  const longitude = Number(lonEntrega);
  const latitude = Number(latEntrega);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) throw new Error("lon/lat entrega inválidos");

  const popped = await client.zPopMax(ZSET_COLA_DESPACHO(dep), 1);
  const item = popped?.[0];
  if (!item?.value) return null;
  const envioId = item.value;

  const candidatos = await client.geoSearch(
    GEO_REPARTIDORES(),
    { longitude, latitude },
    { radius: 50, unit: "km" },
    { SORT: "ASC", COUNT: 10 }
  );

  for (const rid of candidatos) {
    const disponible = await client.sIsMember(SET_DISPONIBLES_ZONA(z), rid);
    if (!disponible) continue;
    const r = await pasarAEnRutaAtomico(client, rid, z, envioId);
    if (r.reservado) {
      return { envioId, repartidorId: rid, depositoId: dep, zona: z, reservaKey: r.reservaKey };
    }
  }

  // No se pudo asignar: reencolar para no perderlo (libera implícitamente la "reserva" porque nunca se reservó)
  await client.zAdd(ZSET_COLA_DESPACHO(dep), { score: Number(item.score) || 0, value: envioId });
  return null;
}

/**
 * 3.2.c — Liberar reserva temporal (DEL)
 */
export async function liberarReserva(client, repartidorId) {
  await client.del(RESERVA_REPARTIDOR(String(repartidorId)));
}

/**
 * 3.3.a/b — Entrada/salida con contadores atómicos (INCRBY) + ocupación
 */
export async function registrarMovimientoPaquetes(client, depositoId, delta, capacidadMax) {
  const dep = String(depositoId);
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) throw new Error("delta inválido (use un número != 0)");

  if (capacidadMax !== undefined) {
    const cap = Number(capacidadMax);
    if (!Number.isFinite(cap) || cap <= 0) throw new Error("capacidadMax inválida");
    await client.hSet(HASH_DEPOSITO(dep), { capacidad_max: String(cap) });
  }

  const stock = await client.incrBy(STOCK_DEPOSITO(dep), d);
  await client.hSet(HASH_DEPOSITO(dep), { paquetes_stock_actual: String(stock) });
  return stock;
}

/**
 * 3.3.c — Detectar depósitos > 85% (lee capacidad y stock del HASH)
 */
export async function depositoOcupacionCritica(client, depositoId, umbral = 0.85) {
  const dep = String(depositoId);
  const raw = await client.hGetAll(HASH_DEPOSITO(dep));
  const cap = Number(raw.capacidad_max);
  const stock = Number(raw.paquetes_stock_actual);
  if (!Number.isFinite(cap) || cap <= 0) return { depositoId: dep, critica: false, motivo: "sin_capacidad" };
  const ratio = (Number.isFinite(stock) ? stock : 0) / cap;
  return { depositoId: dep, critica: ratio > umbral, ratio, stock: Number.isFinite(stock) ? stock : 0, capacidad: cap };
}

/**
 * 3.3.d — Alertar en STREAM cuando supera umbral (XADD)
 */
export async function alertarSiSuperaUmbral(client, depositoId, umbral = 0.85) {
  const st = await depositoOcupacionCritica(client, depositoId, umbral);
  if (!st.critica) return null;
  const id = await client.xAdd(
    STREAM_ALERTAS(),
    "*",
    {
      depositoId: st.depositoId,
      ratio: String(st.ratio),
      stock: String(st.stock),
      capacidad: String(st.capacidad),
      ts: String(Date.now()),
    },
  );
  return { stream: STREAM_ALERTAS(), id, ...st };
}

/**
 * Utilidad para el dashboard: listar posiciones actuales (SMEMBERS + GEOPOS)
 */
export async function listarPosicionesRepartidoresActivos(client, limit = 200) {
  const ids = await client.sMembers(SET_ACTIVOS());
  const picked = ids.slice(0, Math.max(0, Number(limit) || 0));
  if (picked.length === 0) return [];
  const pos = await client.geoPos(GEO_REPARTIDORES(), picked);
  return picked.map((id, idx) => ({ repartidorId: id, pos: pos?.[idx] ?? null }));
}

/** IDs de depósitos con cola de despacho en Redis */
export async function listarDepositosConCola(client) {
  const prefixCola = k("cola", "despacho");
  const keys = await client.keys(`${prefixCola}:*`);
  const baseLen = prefixCola.length + 1;
  return keys.map((key) => key.slice(baseLen)).filter(Boolean);
}

/** Tamaño de cola por cada depósito conocido */
export async function tamaniosColasDespacho(client, depositoIds) {
  const ids = depositoIds?.length ? depositoIds : await listarDepositosConCola(client);
  const out = [];
  for (const dep of ids) {
    out.push({ depositoId: dep, tamano: await tamanioColaDespacho(client, dep) });
  }
  return out;
}

/** Depósitos con ocupación crítica (> umbral) entre los ids dados */
export async function depositosConOcupacionCritica(client, depositoIds, umbral = 0.85) {
  const ids = depositoIds?.length ? depositoIds : await listarDepositosConCola(client);
  const criticos = [];
  for (const dep of ids) {
    const st = await depositoOcupacionCritica(client, dep, umbral);
    if (st.critica) criticos.push(st);
  }
  return criticos;
}

/**
 * Repartidores cercanos que están en el SET de disponibles de una zona.
 */
export async function repartidoresDisponiblesCercanos(client, zona, lon, lat, count = 3) {
  const candidatos = await tresRepartidoresMasCercanos(client, lon, lat);
  const disponibles = [];
  for (const rid of candidatos) {
    if (await client.sIsMember(SET_DISPONIBLES_ZONA(String(zona)), rid)) {
      disponibles.push(rid);
    }
    if (disponibles.length >= count) break;
  }
  return disponibles;
}

/** Estado operativo (HASH) de un repartidor */
export async function estadoRepartidor(client, repartidorId) {
  return client.hGetAll(HASH_REPARTIDOR(String(repartidorId)));
}

/** Estado final de todos los repartidores activos */
export async function estadoFinalRepartidoresActivos(client) {
  const ids = await client.sMembers(SET_ACTIVOS());
  const estados = [];
  for (const id of ids) {
    const hash = await estadoRepartidor(client, id);
    const pos = (await client.geoPos(GEO_REPARTIDORES(), id))?.[0] ?? null;
    estados.push({ repartidorId: id, estado: hash, posicion: pos });
  }
  return estados;
}

/** Elimina claves de reserva que ya expiraron (TTL) o huérfanas */
export async function limpiarReservasExpiradas(client) {
  const pattern = `${k("reserva")}*`;
  const keys = await client.keys(pattern);
  let eliminadas = 0;
  for (const key of keys) {
    const ttl = await client.ttl(key);
    if (ttl === -2) eliminadas += 1;
    else if (ttl === -1) {
      await client.del(key);
      eliminadas += 1;
    }
  }
  return { revisadas: keys.length, eliminadas };
}

/** Métricas de colas de despacho al cierre de turno */
export async function metricasColasDespacho(client, depositoIds) {
  const ids = depositoIds?.length ? depositoIds : await listarDepositosConCola(client);
  const colas = [];
  let totalPendientes = 0;
  for (const dep of ids) {
    const tam = await tamanioColaDespacho(client, dep);
    totalPendientes += tam;
    colas.push({ depositoId: dep, pendientes: tam });
  }
  return { colas, total_pendientes: totalPendientes };
}

/** Vacía colas de depósitos indicados (solo las que quedaron en 0 pendientes tras el turno) */
export async function vaciarColasCompletadas(client, depositoIds) {
  const vaciadas = [];
  for (const dep of depositoIds) {
    const tam = await tamanioColaDespacho(client, dep);
    if (tam === 0) {
      await client.del(ZSET_COLA_DESPACHO(String(dep)));
      vaciadas.push(dep);
    }
  }
  return vaciadas;
}

export { HASH_REPARTIDOR, SET_DISPONIBLES_ZONA, ZSET_COLA_DESPACHO, RESERVA_REPARTIDOR };

