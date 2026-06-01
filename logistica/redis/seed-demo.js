import { actualizarPosicionRepartidor, marcarDisponibleEnZona, encolarEnvio, registrarMovimientoPaquetes } from "./operaciones.js";

/**
 * Carga datos mínimos de demo para Redis (no pisa Mongo/Neo4j).
 * @param {import("redis").RedisClientType} client
 */
export async function seedRedisDemo(client) {
  // repartidores
  await actualizarPosicionRepartidor(client, "R001", -58.3816, -34.6037); // CABA
  await actualizarPosicionRepartidor(client, "R002", -58.4450, -34.6030);
  await actualizarPosicionRepartidor(client, "R003", -58.4200, -34.6150);

  await marcarDisponibleEnZona(client, "R001", "zona_norte");
  await marcarDisponibleEnZona(client, "R002", "zona_norte");
  await marcarDisponibleEnZona(client, "R003", "zona_sur");

  // colas
  await encolarEnvio(client, "DEP01", "ENV-1001", Date.now() * 10 + 5);
  await encolarEnvio(client, "DEP01", "ENV-1002", Date.now() * 10 + 9);

  // depósitos
  await registrarMovimientoPaquetes(client, "DEP01", 120, 200);
  await registrarMovimientoPaquetes(client, "DEP02", 40, 80);
}

