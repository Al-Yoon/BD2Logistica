/**
 * Consultas MongoDB usadas por la capa de persistencia poliglota (TP sección 4).
 * @param {import("mongodb").Db} db
 */

/** Historial completo de eventos de tracking por código de seguimiento */
export async function historialPorCodigoSeguimiento(db, codigoSeguimiento) {
  return db
    .collection("eventos_tracking")
    .find({ codigo_seguimiento: codigoSeguimiento })
    .sort({ timestamp: 1 })
    .toArray();
}

/** Envíos con más de 24 h de demora respecto a la fecha estimada y aún no entregados */
export async function enviosDemoradosNoEntregados(db, fechaReferencia = new Date()) {
  const refDate = new Date(fechaReferencia);
  return db
    .collection("envios")
    .find({
      estado_actual: { $nin: ["entregado", "devuelto"] },
      $expr: {
        $lt: [
          { $dateAdd: { startDate: "$fecha_estimada_entrega", unit: "hour", amount: 24 } },
          refDate,
        ],
      },
    })
    .project({
      codigo_seguimiento: 1,
      estado_actual: 1,
      fecha_estimada_entrega: 1,
      cliente_remitente_id: 1,
      deposito_actual: 1,
    })
    .toArray();
}

/**
 * Clientes corporativos con envíos activos cuya fecha estimada vence pronto (SLA en riesgo).
 * @param {number} horasUmbral horas hasta el vencimiento para considerar riesgo
 */
export async function clientesCorporativosConSlaEnRiesgo(db, horasUmbral = 24) {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + horasUmbral * 60 * 60 * 1000);
  const pipeline = [
    {
      $match: {
        estado_actual: { $nin: ["entregado", "devuelto"] },
        fecha_estimada_entrega: { $gte: ahora, $lte: limite },
      },
    },
    {
      $lookup: {
        from: "clientes",
        localField: "cliente_remitente_id",
        foreignField: "_id",
        as: "cliente",
      },
    },
    { $unwind: "$cliente" },
    { $match: { "cliente.tipo": "empresa" } },
    {
      $group: {
        _id: "$cliente._id",
        cliente: { $first: "$cliente.nombre" },
        envios_en_riesgo: { $sum: 1 },
        proximo_vencimiento: { $min: "$fecha_estimada_entrega" },
      },
    },
    { $sort: { envios_en_riesgo: -1 } },
  ];
  return db.collection("envios").aggregate(pipeline).toArray();
}

/** Envío por código de seguimiento (documento completo o parcial) */
export async function buscarEnvioPorCodigo(db, codigoSeguimiento) {
  return db.collection("envios").findOne({ codigo_seguimiento: codigoSeguimiento });
}

/**
 * Envíos en estado "en_deposito" (o equivalente) asociados a un depósito.
 * Acepta nombre de depósito o id según cómo esté modelado en la 1.ª entrega.
 */
export async function enviosEnDeposito(db, depositoRef) {
  const ref = String(depositoRef).trim();
  return db
    .collection("envios")
    .find({
      estado_actual: { $in: ["en_deposito", "en depósito", "en_deposito"] },
      $or: [
        { deposito_actual: ref },
        { deposito_actual_nombre: ref },
        { deposito_id: ref },
        { "deposito.nombre": ref },
      ],
    })
    .project({
      codigo_seguimiento: 1,
      estado_actual: 1,
      deposito_actual: 1,
      deposito_actual_nombre: 1,
      peso_kg: 1,
      tipo_envio: 1,
    })
    .toArray();
}

/**
 * Registra la asignación de un envío a un repartidor (historial + estado del envío).
 */
export async function registrarAsignacionEnvio(db, codigoSeguimiento, repartidorId, extra = {}) {
  const codigo = String(codigoSeguimiento);
  const repId = repartidorId;
  const ahora = new Date();
  const evento = {
    codigo_seguimiento: codigo,
    timestamp: ahora,
    estado: "asignado",
    descripcion: `Asignado a repartidor ${repId}`,
    repartidor_id: repId,
    ...extra,
  };
  await db.collection("eventos_tracking").insertOne(evento);
  await db.collection("envios").updateOne(
    { codigo_seguimiento: codigo },
    {
      $set: {
        estado_actual: "en_transito",
        repartidor_asignado_id: repId,
        fecha_asignacion: ahora,
      },
    },
  );
  return evento;
}

/**
 * Métricas del turno a partir del historial de envíos (para OP-5).
 * @param {Date} desde inicio del turno
 * @param {Date} [hasta=new Date()] fin del turno
 */
export async function metricasCierreTurno(db, desde, hasta = new Date()) {
  const inicio = new Date(desde);
  const fin = new Date(hasta);
  const pipeline = [
    {
      $match: {
        $or: [
          { fecha_entrega_real: { $gte: inicio, $lte: fin } },
          { fecha_asignacion: { $gte: inicio, $lte: fin } },
        ],
      },
    },
    {
      $group: {
        _id: null,
        completados: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$estado_actual", "entregado"] },
                  { $gte: ["$fecha_entrega_real", inicio] },
                  { $lte: ["$fecha_entrega_real", fin] },
                ],
              },
              1,
              0,
            ],
          },
        },
        rechazados: {
          $sum: {
            $cond: [{ $in: ["$estado_actual", ["devuelto", "rechazado"]] }, 1, 0],
          },
        },
        tiempos_ms: {
          $push: {
            $cond: [
              {
                $and: [
                  { $ne: ["$fecha_asignacion", null] },
                  { $ne: ["$fecha_entrega_real", null] },
                ],
              },
              { $subtract: ["$fecha_entrega_real", "$fecha_asignacion"] },
              null,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        completados: 1,
        rechazados: 1,
        tiempo_promedio_entrega_ms: {
          $avg: {
            $filter: { input: "$tiempos_ms", as: "t", cond: { $ne: ["$$t", null] } },
          },
        },
      },
    },
  ];
  const rows = await db.collection("envios").aggregate(pipeline).toArray();
  const base = rows[0] ?? { completados: 0, rechazados: 0, tiempo_promedio_entrega_ms: null };
  const promedioHoras =
    base.tiempo_promedio_entrega_ms != null
      ? base.tiempo_promedio_entrega_ms / (1000 * 60 * 60)
      : null;
  return {
    periodo: { desde: inicio, hasta: fin },
    envios_completados: base.completados,
    envios_rechazados: base.rechazados,
    tiempo_promedio_entrega_horas: promedioHoras,
  };
}

/** Persiste el resumen consolidado del turno */
export async function persistirResumenTurno(db, resumen) {
  const doc = { ...resumen, creado_en: new Date() };
  const r = await db.collection("resumenes_turno").insertOne(doc);
  return { insertedId: r.insertedId, ...doc };
}

/**
 * Tiempos de tránsito observados en el turno (para actualizar pesos en Neo4j).
 * Devuelve pares origen/destino de depósito con tiempo en minutos.
 */
export async function tiemposTransitoObservadosEnTurno(db, desde, hasta = new Date()) {
  const inicio = new Date(desde);
  const fin = new Date(hasta);
  return db
    .collection("envios")
    .find({
      estado_actual: "entregado",
      fecha_entrega_real: { $gte: inicio, $lte: fin },
      deposito_origen: { $exists: true, $ne: null },
      deposito_destino: { $exists: true, $ne: null },
      tiempo_transito_minutos: { $exists: true, $ne: null },
    })
    .project({
      deposito_origen: 1,
      deposito_destino: 1,
      tiempo_transito_minutos: 1,
    })
    .toArray();
}

/** Lista depósitos maestros (nombres/ids) desde MongoDB */
export async function listarDepositosMaestros(db) {
  const rows = await db
    .collection("depositos")
    .find({}, { projection: { nombre: 1, _id: 1, capacidad_max: 1 } })
    .toArray();
  return rows.map((d) => ({
    id: d._id?.toString(),
    nombre: d.nombre ?? String(d._id),
    capacidad_max: d.capacidad_max,
  }));
}

/** Extrae coordenadas de entrega del documento de envío (varios esquemas posibles) */
export function coordenadasEntrega(envio) {
  if (!envio) return null;
  const c =
    envio.direccion_entrega?.coordenadas ??
    envio.direccion_entrega ??
    envio.coordenadas_entrega ??
    envio.destino?.coordenadas ??
    envio.destino;
  if (!c) return null;
  const lon = Number(c.lon ?? c.longitude ?? c.lng);
  const lat = Number(c.lat ?? c.latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

/** Nombre/id de depósito origen y destino para rutas en Neo4j */
export function depositosRutaEnvio(envio) {
  if (!envio) return { origen: null, destino: null };
  const origen =
    envio.deposito_origen ??
    envio.deposito_origen_nombre ??
    envio.deposito_actual ??
    envio.deposito_actual_nombre ??
    null;
  const destino =
    envio.deposito_destino ??
    envio.deposito_destino_nombre ??
    envio.deposito_entrega ??
    null;
  return { origen: origen ? String(origen) : null, destino: destino ? String(destino) : null };
}

/** Identificador de repartidor asignado al envío */
export function repartidorAsignadoId(envio) {
  if (!envio) return null;
  const id =
    envio.repartidor_asignado_id ??
    envio.repartidor_entrega_id ??
    envio.repartidor_id ??
    null;
  return id != null ? String(id) : null;
}
