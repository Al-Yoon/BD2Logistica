/**
 * Consultas Cypher para la capa poliglota (TP sección 4).
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

/** Ruta más rápida entre dos depósitos (suma de `tiempo` en CONECTADO_A) */
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

/**
 * Rutas alternativas desde un depósito saturado hacia otro con menor carga (evita el nodo caído/saturado).
 */
export async function rutasAlternativasDesdeDeposito(
  session,
  nombreDepositoSaturado,
  nombreDestinoAlternativo,
  limite = 3,
) {
  const result = await session.run(
    `
    MATCH p = (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    WHERE d1 <> d2
    WITH p, reduce(t = 0, r IN relationships(p) | t + coalesce(r.tiempo, 0)) AS tiempo_total
    RETURN p, tiempo_total
    ORDER BY tiempo_total ASC
    LIMIT $limite
    `,
    {
      origen: nombreDepositoSaturado,
      destino: nombreDestinoAlternativo,
      limite: neo4j.int(limite),
    },
  );
  return recordsToPlain(result.records);
}

/**
 * Depósito alternativo más próximo en el grafo (excluye el inoperativo).
 */
export async function depositoAlternativoMasCercano(session, nombreDepositoInoperativo, limite = 5) {
  const result = await session.run(
    `
    MATCH (caido:Deposito {nombre: $caido})
    MATCH (alt:Deposito)
    WHERE alt.nombre <> $caido
    MATCH p = shortestPath((caido)-[:CONECTADO_A*]-(alt))
    WITH alt, p, length(p) AS saltos
    RETURN alt.nombre AS deposito_alternativo, saltos, p
    ORDER BY saltos ASC
    LIMIT $limite
    `,
    { caido: nombreDepositoInoperativo, limite: neo4j.int(limite) },
  );
  return recordsToPlain(result.records);
}

/** Ruta desde depósito origen hasta destino evitando un depósito intermedio */
export async function rutaRedistribucionEnvio(
  session,
  nombreOrigen,
  nombreDestinoAlternativo,
  nombreEvitar,
) {
  const result = await session.run(
    `
    MATCH p = (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    WHERE NOT any(n IN nodes(p) WHERE n.nombre = $evitar)
    WITH p, reduce(t = 0, r IN relationships(p) | t + coalesce(r.tiempo, 0)) AS tiempo_total
    RETURN p, tiempo_total
    ORDER BY tiempo_total ASC
    LIMIT 1
    `,
    { origen: nombreOrigen, destino: nombreDestinoAlternativo, evitar: nombreEvitar },
  );
  return recordsToPlain(result.records);
}

/**
 * Actualiza el peso `tiempo` de aristas CONECTADO_A según tiempos reales observados.
 * @param {{ origen: string, destino: string, tiempoMinutos: number }[]} observaciones
 */
export async function actualizarPesosRutasPorTiempos(session, observaciones) {
  const actualizados = [];
  for (const obs of observaciones) {
    const origen = String(obs.origen ?? obs.deposito_origen ?? "");
    const destino = String(obs.destino ?? obs.deposito_destino ?? "");
    const tiempo = Number(obs.tiempoMinutos ?? obs.tiempo_transito_minutos);
    if (!origen || !destino || !Number.isFinite(tiempo)) continue;
    const result = await session.run(
      `
      MATCH (a:Deposito {nombre: $origen})-[r:CONECTADO_A]->(b:Deposito {nombre: $destino})
      SET r.tiempo = $tiempo
      RETURN a.nombre AS origen, b.nombre AS destino, r.tiempo AS tiempo
      `,
      { origen, destino, tiempo },
    );
    if (result.records.length) {
      actualizados.push(recordsToPlain(result.records)[0]);
    }
  }
  return actualizados;
}

/** Lista nombres de depósitos en el grafo */
export async function listarNombresDepositos(session) {
  const result = await session.run(`
    MATCH (d:Deposito)
    RETURN d.nombre AS nombre
    ORDER BY d.nombre
  `);
  return recordsToPlain(result.records).map((r) => r.nombre);
}
