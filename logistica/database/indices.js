/**
 * Índices mínimos para acelerar las consultas del TP.
 * @param {import("mongodb").Db} db
 */
export async function asegurarIndices(db) {
  await db.collection("envios").createIndex({ codigo_seguimiento: 1 }, { unique: true });
  await db.collection("eventos_tracking").createIndex({ codigo_seguimiento: 1, timestamp: 1 });

  await db.collection("envios").createIndex({ estado_actual: 1, fecha_estimada_entrega: 1 });
  await db.collection("envios").createIndex({ cliente_remitente_id: 1, fecha_estimada_entrega: 1 });
  await db.collection("envios").createIndex({ repartidor_entrega_id: 1, fecha_entrega_real: 1 });

  await db.collection("clientes").createIndex({ tipo: 1 });
  await db.collection("depositos").createIndex({ ciudad: 1 });
}

