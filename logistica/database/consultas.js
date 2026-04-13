/**
 * Consultas funcionales del TP (MongoDB), sección 3.1 punto 4.
 * @param {import("mongodb").Db} db
 */

/** Historial completo por código de seguimiento */
export async function historialPorCodigoSeguimiento(db, codigoSeguimiento) {
  return db
    .collection("eventos_tracking")
    .find({ codigo_seguimiento: codigoSeguimiento })
    .sort({ timestamp: 1 })
    .toArray();
}

/** Envíos con más de 24 h de demora respecto a la fecha estimada y aún no entregados */
export async function enviosDemoradosNoEntregados(db) {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return db
    .collection("envios")
    .find({
      estado_actual: { $nin: ["entregado", "devuelto"] },
      fecha_estimada_entrega: { $lt: hace24h },
    })
    .toArray();
}

/**
 * Reporte mensual cliente corporativo: total envíos, tasa en término, incidencias.
 * @param {import("mongodb").ObjectId|string} clienteId
 */
export async function reporteMensualClienteCorporativo(db, clienteId, anio, mes) {
  const inicio = new Date(Date.UTC(anio, mes - 1, 1));
  const fin = new Date(Date.UTC(anio, mes, 1));
  const match = {
    cliente_remitente_id: clienteId,
    fecha_estimada_entrega: { $gte: inicio, $lt: fin },
  };

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: null,
        total_envios: { $sum: 1 },
        incidencias: { $sum: "$incidencias" },
        entregados: {
          $sum: { $cond: [{ $eq: ["$estado_actual", "entregado"] }, 1, 0] },
        },
        en_termino: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$estado_actual", "entregado"] },
                  { $ne: ["$fecha_entrega_real", null] },
                  { $lte: ["$fecha_entrega_real", "$fecha_estimada_entrega"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        total_envios: 1,
        incidencias: 1,
        entregados: 1,
        entregados_en_termino: "$en_termino",
        tasa_entrega_en_termino: {
          $cond: [
            { $gt: ["$entregados", 0] },
            { $divide: ["$en_termino", "$entregados"] },
            null,
          ],
        },
      },
    },
  ];

  const rows = await db.collection("envios").aggregate(pipeline).toArray();
  const r = rows[0] ?? {
    total_envios: 0,
    incidencias: 0,
    entregados: 0,
    entregados_en_termino: 0,
    tasa_entrega_en_termino: null,
  };
  return { clienteId: String(clienteId), periodo: { anio, mes }, ...r };
}

/**
 *Repartidores con mayor tasa de entrega exitosa en primer intento (últimos 30 días).
 */
export async function repartidoresMejorPrimerIntentoUltimosDias(db, dias = 30) {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const pipeline = [
    {
      $match: {
        estado_actual: "entregado",
        fecha_entrega_real: { $gte: desde },
        repartidor_entrega_id: { $ne: null },
      },
    },
    {
      $group: {
        _id: "$repartidor_entrega_id",
        total_entregas: { $sum: 1 },
        primer_intento: {
          $sum: { $cond: [{ $eq: ["$entrega_primer_intento", true] }, 1, 0] },
        },
      },
    },
    {
      $addFields: {
        tasa_primer_intento: {
          $cond: [
            { $gt: ["$total_entregas", 0] },
            { $divide: ["$primer_intento", "$total_entregas"] },
            0,
          ],
        },
      },
    },
    { $sort: { tasa_primer_intento: -1, total_entregas: -1 } },
  ];
  return db.collection("envios").aggregate(pipeline).toArray();
}

/**
 * Depósitos con ocupación superior al umbral (por defecto 85 %).
 * @param {number} porcentajeUmbral 0-100
 */
export async function depositosOcupacionSuperiorA(db, porcentajeUmbral = 85) {
  const umbral = porcentajeUmbral / 100;
  const pipeline = [
    {
      $addFields: {
        ratio: {
          $cond: [
            { $gt: ["$capacidad_max", 0] },
            { $divide: ["$paquetes_stock_actual", "$capacidad_max"] },
            0,
          ],
        },
      },
    },
    { $match: { ratio: { $gt: umbral } } },
    {
      $project: {
        nombre: 1,
        ciudad: 1,
        capacidad_max: 1,
        paquetes_stock_actual: 1,
        ocupacion_porcentaje: { $multiply: ["$ratio", 100] },
      },
    },
  ];
  return db.collection("depositos").aggregate(pipeline).toArray();
}

/**Buscar un envío por código (útil para demos). */
export async function buscarEnvioPorCodigo(db, codigoSeguimiento) {
  return db.collection("envios").findOne({ codigo_seguimiento: codigoSeguimiento });
}
