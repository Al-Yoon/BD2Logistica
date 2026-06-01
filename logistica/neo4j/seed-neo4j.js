import { conectarNeo4j, nombreBaseNeo4j } from "./neo4j.js";

export async function seedNeo4j() {
  const { driver } = await conectarNeo4j();
  const dbName = nombreBaseNeo4j();
  const session = driver.session({ database: dbName });

  try {
    console.log(`Conectado a Neo4j (Base de datos: ${dbName}). Limpiando datos existentes...`);
    
    // Limpiar toda la base de datos
    await session.run("MATCH (n) DETACH DELETE n");
    console.log("✔ Base de datos limpia.");

    console.log("Insertando nodos Deposito y relaciones CONECTADO_A...");

    // Crear Depósitos
    await session.run(`
      CREATE (dp:Deposito {nombre: "Deposito principal", ciudad: "Buenos Aires"})
      CREATE (dzo:Deposito {nombre: "Deposito zona oeste", ciudad: "Haedo"})
      CREATE (dn:Deposito {nombre: "Deposito norte", ciudad: "San Isidro"})
      CREATE (ds:Deposito {nombre: "Deposito sur", ciudad: "Avellaneda"})
      CREATE (de:Deposito {nombre: "Deposito este", ciudad: "La Plata"})
      CREATE (do:Deposito {nombre: "Deposito oeste", ciudad: "Moron"})
    `);

    // Crear Relaciones de Conexión (CONECTADO_A) con tiempos de tránsito
    await session.run(`
      MATCH (dp:Deposito {nombre: "Deposito principal"}),
            (dzo:Deposito {nombre: "Deposito zona oeste"}),
            (dn:Deposito {nombre: "Deposito norte"}),
            (ds:Deposito {nombre: "Deposito sur"}),
            (de:Deposito {nombre: "Deposito este"}),
            (do:Deposito {nombre: "Deposito oeste"})
      
      // Ruta Directa Principal -> Zona Oeste (1 salto, tiempo = 10)
      CREATE (dp)-[:CONECTADO_A {tiempo: 10}]->(dzo)

      // Ruta alternativa Principal -> Norte -> Zona Oeste (2 saltos, tiempo = 5)
      CREATE (dp)-[:CONECTADO_A {tiempo: 2}]->(dn)
      CREATE (dn)-[:CONECTADO_A {tiempo: 3}]->(dzo)

      // Conexiones para principal (Nodo crítico con grado de conexión = 5)
      CREATE (dp)-[:CONECTADO_A {tiempo: 4}]->(ds)
      CREATE (dp)-[:CONECTADO_A {tiempo: 6}]->(de)
      CREATE (dp)-[:CONECTADO_A {tiempo: 8}]->(do)

      // Otras conexiones en la red
      CREATE (dn)-[:CONECTADO_A {tiempo: 5}]->(de)
      CREATE (de)-[:CONECTADO_A {tiempo: 3}]->(ds)
      CREATE (ds)-[:CONECTADO_A {tiempo: 7}]->(do)
      CREATE (do)-[:CONECTADO_A {tiempo: 2}]->(dzo)
    `);
    console.log("✔ Depósitos y rutas (CONECTADO_A) sembrados.");

    console.log("Insertando nodos Envio y relaciones PASA_POR...");
    await session.run(`
      MATCH (dp:Deposito {nombre: "Deposito principal"}),
            (dn:Deposito {nombre: "Deposito norte"})

      // Envíos que pasan por "Deposito principal" y no están entregados (afectados si dp cae)
      CREATE (e1:Envio {codigo: "ENV-101", estado_actual: "en_camino"})
      CREATE (e1)-[:PASA_POR]->(dp)

      CREATE (e2:Envio {codigo: "ENV-102", estado_actual: "procesando"})
      CREATE (e2)-[:PASA_POR]->(dp)

      // Envío entregado que pasa por "Deposito principal" (No debe figurar como afectado)
      CREATE (e3:Envio {codigo: "ENV-103", estado_actual: "entregado"})
      CREATE (e3)-[:PASA_POR]->(dp)

      // Envío en camino por otro depósito (No debe figurar como afectado por dp)
      CREATE (e4:Envio {codigo: "ENV-104", estado_actual: "en_camino"})
      CREATE (e4)-[:PASA_POR]->(dn)
    `);
    console.log("✔ Envíos y eventos de paso (PASA_POR) sembrados.");

    console.log("\n🚀 ¡La base de datos de Neo4j ha sido sembrada exitosamente para tus pruebas!");
  } finally {
    await session.close();
    await driver.close();
  }
}

if (process.argv[1] && (process.argv[1].includes("seed-neo4j.js") || process.argv[1] === import.meta.filename)) {
  seedNeo4j().catch((e) => {
    console.error("❌ Error al sembrar Neo4j:", e);
    process.exit(1);
  });
}
