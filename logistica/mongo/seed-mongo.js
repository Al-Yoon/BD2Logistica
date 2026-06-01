import { conectarMongo } from "./mongo.js";
import { ObjectId } from "mongodb";

/**
 * Carga de datos de prueba para MongoDB que se ajustan a todas las consultas del TP.
 */
export async function seedMongo() {
  const { client, db } = await conectarMongo();
  try {
    console.log("Conectado a MongoDB. Limpiando colecciones de logística existentes...");
    
    // Limpiamos las colecciones involucradas en las consultas
    await db.collection("clientes").deleteMany({});
    await db.collection("repartidores").deleteMany({});
    await db.collection("depositos").deleteMany({});
    await db.collection("envios").deleteMany({});
    await db.collection("eventos_tracking").deleteMany({});
    
    console.log("Limpieza completada. Insertando datos de prueba...");

    // 1. Clientes (Empresas y Particulares)
    const clienteCorp1Id = new ObjectId("60b8d2f5f1d2b827e8a9f001");
    const clienteCorp2Id = new ObjectId("60b8d2f5f1d2b827e8a9f002");
    const clientePartId = new ObjectId("60b8d2f5f1d2b827e8a9f003");

    const clientes = [
      {
        _id: clienteCorp1Id,
        nombre: "MercadoLibre S.A.",
        tipo: "empresa",
        cuit: "30-70924259-8",
        email: "logistica@mercadolibre.com",
        direccion: "Arias 3751, CABA"
      },
      {
        _id: clienteCorp2Id,
        nombre: "Globex Corporation",
        tipo: "empresa",
        cuit: "30-98765432-1",
        email: "envios@globex.com",
        direccion: "Av. Corrientes 1234, CABA"
      },
      {
        _id: clientePartId,
        nombre: "Alex Yoon",
        tipo: "particular",
        dni: "39876543",
        email: "alexyoon@gmail.com",
        direccion: "Av. Rivadavia 4500, CABA"
      }
    ];
    await db.collection("clientes").insertMany(clientes);
    console.log(`✔ Clientes sembrados: ${clientes.length}`);

    // 2. Repartidores
    const repartidor1Id = new ObjectId("60b8d2f5f1d2b827e8a9f011");
    const repartidor2Id = new ObjectId("60b8d2f5f1d2b827e8a9f012");
    const repartidor3Id = new ObjectId("60b8d2f5f1d2b827e8a9f013");

    const repartidores = [
      {
        _id: repartidor1Id,
        nombre: "Juan Carlos Pérez",
        telefono: "11-5555-0001",
        vehiculo: "Utilitario Fiorino"
      },
      {
        _id: repartidor2Id,
        nombre: "María Luz Gómez",
        telefono: "11-5555-0002",
        vehiculo: "Motocicleta 150cc"
      },
      {
        _id: repartidor3Id,
        nombre: "Esteban Quito",
        telefono: "11-5555-0003",
        vehiculo: "Furgón Sprinter"
      }
    ];
    await db.collection("repartidores").insertMany(repartidores);
    console.log(`✔ Repartidores sembrados: ${repartidores.length}`);

    // 3. Depósitos (con capacidades y stock actuales para probar el umbral > 85%)
    const depositos = [
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f021"),
        nombre: "Depósito Central Pompeya",
        ciudad: "CABA",
        capacidad_max: 1000,
        paquetes_stock_actual: 920 // 92% (supera el 85%)
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f022"),
        nombre: "Depósito Norte San Isidro",
        ciudad: "Gran Buenos Aires",
        capacidad_max: 500,
        paquetes_stock_actual: 440 // 88% (supera el 85%)
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f023"),
        nombre: "Depósito Oeste Haedo",
        ciudad: "Gran Buenos Aires",
        capacidad_max: 800,
        paquetes_stock_actual: 400 // 50% (NO supera el 85%)
      }
    ];
    await db.collection("depositos").insertMany(depositos);
    console.log(`✔ Depósitos sembrados: ${depositos.length}`);

    // Fechas absolutas fijas — independientes del momento en que se ejecuta el seed.
    // Los envíos "entregados" usan fechas del pasado reciente (enero 2026).
    // TRK-2026-004 tiene fecha estimada muy antigua → siempre aparece como demorado.

    // Envíos entregados: fechas estimadas y reales en enero 2026
    const estEntrega1     = new Date("2026-01-05T18:00:00.000Z");
    const realEntrega1    = new Date("2026-01-05T16:00:00.000Z"); // 2 hs antes (en término)

    const estEntrega2     = new Date("2026-01-10T18:00:00.000Z");
    const realEntrega2    = new Date("2026-01-11T00:00:00.000Z"); // misma fecha, dentro del día

    const estEntrega3     = new Date("2026-01-15T18:00:00.000Z");
    const realEntrega3    = new Date("2026-01-17T00:00:00.000Z"); // 30 hs tarde (fuera de término)

    const estEntrega5     = new Date("2026-01-20T18:00:00.000Z");
    const realEntrega5    = new Date("2026-01-20T18:00:00.000Z");

    // TRK-2026-004: fecha estimada hace mucho tiempo → siempre demorado al correr la consulta
    const estEntregaDemorado = new Date("2026-01-01T12:00:00.000Z");


    // 4. Envíos (con combinaciones de estados, demoras y primer intento)
    const envios = [
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f031"),
        codigo_seguimiento: "TRK-2026-001",
        cliente_remitente_id: clienteCorp1Id,
        estado_actual: "entregado",
        fecha_estimada_entrega: estEntrega1,
        fecha_entrega_real: realEntrega1,       // 2 hs antes (en término)
        incidencias: 0,
        repartidor_entrega_id: repartidor1Id,
        entrega_primer_intento: true
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f032"),
        codigo_seguimiento: "TRK-2026-002",
        cliente_remitente_id: clienteCorp1Id,
        estado_actual: "entregado",
        fecha_estimada_entrega: estEntrega2,
        fecha_entrega_real: realEntrega2,       // mismo día, dentro del rango
        incidencias: 1,
        repartidor_entrega_id: repartidor1Id,
        entrega_primer_intento: true
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f033"),
        codigo_seguimiento: "TRK-2026-003",
        cliente_remitente_id: clienteCorp1Id,
        estado_actual: "entregado",
        fecha_estimada_entrega: estEntrega3,
        fecha_entrega_real: realEntrega3,       // 30 hs tarde (fuera de término)
        incidencias: 2,
        repartidor_entrega_id: repartidor2Id,
        entrega_primer_intento: false
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f034"),
        codigo_seguimiento: "TRK-2026-004",
        cliente_remitente_id: clienteCorp1Id,
        estado_actual: "en_camino",             // No entregado → debe aparecer en la consulta 2
        fecha_estimada_entrega: estEntregaDemorado, // 2026-01-01 → siempre > 24 hs de demora
        fecha_entrega_real: null,
        incidencias: 0,
        repartidor_entrega_id: repartidor2Id,
        entrega_primer_intento: null
      },
      {
        _id: new ObjectId("60b8d2f5f1d2b827e8a9f035"),
        codigo_seguimiento: "TRK-2026-005",
        cliente_remitente_id: clienteCorp2Id,
        estado_actual: "entregado",
        fecha_estimada_entrega: estEntrega5,
        fecha_entrega_real: realEntrega5,
        incidencias: 0,
        repartidor_entrega_id: repartidor3Id,
        entrega_primer_intento: true
      }
    ];
    await db.collection("envios").insertMany(envios);
    console.log(`✔ Envíos sembrados: ${envios.length}`);

    // 5. Historial de Eventos de Tracking (para TRK-2026-001 y TRK-2026-004)
    const eventosTracking = [
      // Historial completo para TRK-2026-001
      {
        codigo_seguimiento: "TRK-2026-001",
        timestamp: new Date(estEntrega1.getTime() - 2 * 24 * 60 * 60 * 1000),
        descripcion: "Envío recibido en Depósito Central Pompeya",
        ubicacion: "Depósito Central Pompeya"
      },
      {
        codigo_seguimiento: "TRK-2026-001",
        timestamp: new Date(estEntrega1.getTime() - 1 * 24 * 60 * 60 * 1000),
        descripcion: "Envío clasificado y listo para despacho",
        ubicacion: "Depósito Central Pompeya"
      },
      {
        codigo_seguimiento: "TRK-2026-001",
        timestamp: new Date(estEntrega1.getTime() - 12 * 60 * 60 * 1000),
        descripcion: "Asignado a repartidor y en camino de entrega",
        ubicacion: "En tránsito"
      },
      {
        codigo_seguimiento: "TRK-2026-001",
        timestamp: new Date(estEntrega1.getTime() - 2 * 60 * 60 * 1000),
        descripcion: "Entregado exitosamente en primer intento",
        ubicacion: "Domicilio de destino"
      },
      // Historial para TRK-2026-004 (El envío demorado)
      {
        codigo_seguimiento: "TRK-2026-004",
        timestamp: new Date(estEntregaDemorado.getTime() - 1 * 24 * 60 * 60 * 1000),
        descripcion: "Envío ingresado al sistema en Depósito Central Pompeya",
        ubicacion: "Depósito Central Pompeya"
      },
      {
        codigo_seguimiento: "TRK-2026-004",
        timestamp: estEntregaDemorado,
        descripcion: "Retraso en aduana / zona intransitable",
        ubicacion: "En tránsito"
      }
    ];
    await db.collection("eventos_tracking").insertMany(eventosTracking);
    console.log(`✔ Historial de eventos sembrados: ${eventosTracking.length}`);

    console.log("\n🚀 ¡La base de datos de MongoDB ha sido sembrada exitosamente para tus pruebas!");
  } finally {
    await client.close();
  }
}

// Habilitar ejecución directa con node
if (process.argv[1] && (process.argv[1].includes("seed-mongo.js") || process.argv[1] === import.meta.filename)) {
  seedMongo().catch((e) => {
    console.error("❌ Error al sembrar MongoDB:", e);
    process.exit(1);
  });
}
