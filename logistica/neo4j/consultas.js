/**
 * Consultas Cypher del TP (Neo4j), sección del PDF — Modelo de Datos en Neo4j.
 * Etiquetas: Deposito, Envio. Relación entre depósitos: CONECTADO_A (propiedad opcional `tiempo`).
 *
 * @param {import("neo4j-driver").Session} session
 */
import neo4j from "neo4j-driver";

function num(v) {
  if (v == null) return v;
  if (neo4j.isInt(v)) return v.toNumber();
  if (typeof v === "number") return v;
  return v;
}

function propsNodo(n) {
  return n?.properties != null ? { ...n.properties } : null;
}

function pathResumen(p) {
  if (!p?.segments) return null;
  const nodos = [propsNodo(p.start)].filter(Boolean);
  for (const seg of p.segments) {
    nodos.push(propsNodo(seg.end));
  }
  const tramos = p.segments.map((s) => ({
    tipo: s.relationship.type,
    tiempo: num(s.relationship.properties?.tiempo),
    props: { ...s.relationship.properties },
  }));
  const tiempo_total = tramos.reduce((acc, t) => acc + (Number(t.tiempo) || 0), 0);
  return { nodos, tramos, tiempo_total };
}

function recordsToPlain(records) {
  return records.map((rec) => {
    const o = {};
    for (const key of rec.keys) {
      o[key] = toPlain(rec.get(key));
    }
    return o;
  });
}

function toPlain(v) {
  if (v == null) return v;
  if (neo4j.isInt(v)) return v.toNumber();
  if (typeof v === "object" && Array.isArray(v.segments)) {
    return pathResumen(v);
  }
  if (Array.isArray(v)) return v.map(toPlain);
  if (typeof v === "object" && v.properties != null && v.labels != null) {
    return { labels: [...v.labels], ...v.properties };
  }
  if (typeof v === "object" && !Array.isArray(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      out[k] = toPlain(v[k]);
    }
    return out;
  }
  return v;
}

/** a) Ruta más corta (menor cantidad de saltos) entre dos depósitos */
export async function rutaMasCorta(session, nombreOrigen, nombreDestino) {
  const result = await session.run(
    `
    MATCH p = shortestPath(
      (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    )
    RETURN p, length(p) AS saltos
    `,
    { origen: nombreOrigen, destino: nombreDestino },
  );
  return recordsToPlain(result.records);
}

/** b) Ruta más rápida: suma mínima de `tiempo` en relaciones CONECTADO_A */
export async function rutaMasRapida(session, nombreOrigen, nombreDestino) {
  const result = await session.run(
    `
    MATCH p = (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    WITH p, reduce(t = 0, r IN relationships(p) | t + coalesce(r.tiempo, 0)) AS tiempo_total
    RETURN p, tiempo_total
    ORDER BY tiempo_total ASC
    LIMIT 1
    `,
    { origen: nombreOrigen, destino: nombreDestino },
  );
  return recordsToPlain(result.records);
}

/** c-1) Envíos no entregados que pasan por un depósito (impacto si el depósito cae) */
export async function enviosAfectadosDeposito(session, nombreDeposito) {
  const result = await session.run(
    `
    MATCH (d:Deposito {nombre: $nombre})<-[:PASA_POR]-(e:Envio)
    WHERE e.estado_actual <> 'entregado'
    RETURN e.codigo AS envio_afectado, e.estado_actual AS estado_actual
    `,
    { nombre: nombreDeposito },
  );
  return recordsToPlain(result.records);
}

/** c-2) Rutas alternativas entre dos depósitos que no pasan por un depósito intermedio dado */
export async function rutasAlternativasSinDeposito(
  session,
  nombreOrigen,
  nombreDestino,
  nombreEvitar,
  limite = 5,
) {
  const result = await session.run(
    `
    MATCH p = (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    WHERE NOT any(n IN nodes(p) WHERE n.nombre = $evitar)
    RETURN p
    LIMIT $limite
    `,
    { origen: nombreOrigen, destino: nombreDestino, evitar: nombreEvitar, limite: neo4j.int(limite) },
  );
  return recordsToPlain(result.records);
}

/** d) Depósitos con mayor grado (cantidad de aristas CONECTADO_A) */
export async function depositosCriticos(session) {
  const result = await session.run(`
    MATCH (d:Deposito)
    RETURN d.nombre AS deposito, COUNT { (d)-[:CONECTADO_A]-() } AS grado_conexiones
    ORDER BY grado_conexiones DESC
  `);
  return recordsToPlain(result.records);
}

/**
 * e) Optimización de rutas (ejemplo conceptual del PDF): punto de partida y lista de depósitos a visitar.
 */
export async function optimizacionRutasConceptual(session, nombreInicio, nombresDestinos) {
  const result = await session.run(
    `
    MATCH (inicio:Deposito {nombre: $inicio})
    MATCH (destinos:Deposito)
    WHERE destinos.nombre IN $destinos
    WITH inicio, collect(destinos) AS puntos
    RETURN inicio.nombre AS punto_partida, [p IN puntos | p.nombre] AS puntos_visitar
    `,
    { inicio: nombreInicio, destinos: nombresDestinos },
  );
  return recordsToPlain(result.records);
}

/** Lista nombres de depósitos (útil en el menú) */
export async function listarNombresDepositos(session) {
  const result = await session.run(`
    MATCH (d:Deposito)
    RETURN d.nombre AS nombre
    ORDER BY d.nombre
  `);
  return recordsToPlain(result.records).map((r) => r.nombre);
}
