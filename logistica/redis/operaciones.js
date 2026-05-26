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
  const members = await client.geoSearch(GEO_REPARTIDORES(), { longitude, latitude }, { BYRADIUS: 50, COUNT: 3, SORT: "ASC" });
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
  return client.geoSearch(GEO_REPARTIDORES(), { longitude, latitude }, { BYRADIUS: r, COUNT: 1000, SORT: "ASC" });
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
    { BYRADIUS: 50, COUNT: 10, SORT: "ASC" },
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

