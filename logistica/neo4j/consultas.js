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

/** Ruta desde depósito origen hasta destino evitando un depósito como tránsito intermedio */
export async function rutaRedistribucionEnvio(
  session,
  nombreOrigen,
  nombreDestinoAlternativo,
  nombreEvitar,
) {
  const result = await session.run(
    `
    MATCH p = (d1:Deposito {nombre: $origen})-[:CONECTADO_A*]-(d2:Deposito {nombre: $destino})
    WHERE NOT any(n IN nodes(p) WHERE n.nombre = $evitar AND n <> d1 AND n <> d2)
    WITH p, reduce(t = 0, r IN relationships(p) | t + coalesce(r.tiempo, 0)) AS tiempo_total
    RETURN p, tiempo_total
    ORDER BY tiempo_total ASC
    LIMIT 1
    `,
    { origen: nombreOrigen, destino: nombreDestinoAlternativo, evitar: nombreEvitar },
  );
  return recordsToPlain(result.records);
}

/** TP1-7a: ruta más corta entre depósitos por cantidad de traslados intermedios */
export async function rutaMasCortaPorSaltos(session, nombreOrigen, nombreDestino) {
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

/** TP1-7c: rutas alternativas si un depósito queda inoperativo */
export async function enviosAfectadosDepositoInoperativo(session, nombreDepositoInoperativo) {
  const alternativos = await depositoAlternativoMasCercano(session, nombreDepositoInoperativo, 5);
  return {
    deposito_inoperativo: nombreDepositoInoperativo,
    depositos_alternativos: alternativos,
    nota: "Los envíos en tránsito se consultan en MongoDB (OP-4); aquí se calculan rutas alternativas en el grafo.",
  };
}

/**
 * TP1-7d: depósitos más críticos (eliminación desconectaría más pares de nodos).
 * Para grafos pequeños se evalúa cada nodo removiéndolo del camino.
 */
export async function depositosMasCriticos(session, limite = 5) {
  const nombres = await listarNombresDepositos(session);
  const criticos = [];

  for (const evitar of nombres) {
    const otros = nombres.filter((n) => n !== evitar);
    let paresTotales = 0;
    let paresDesconectados = 0;

    for (let i = 0; i < otros.length; i++) {
      for (let j = i + 1; j < otros.length; j++) {
        paresTotales += 1;
        const r = await session.run(
          `
          MATCH p = shortestPath(
            (a:Deposito {nombre: $origen})-[:CONECTADO_A*..15]-(b:Deposito {nombre: $destino})
          )
          WHERE NONE(n IN nodes(p) WHERE n.nombre = $evitar)
          RETURN count(p) AS conectados
          `,
          { origen: otros[i], destino: otros[j], evitar },
        );
        const conectados = num(r.records[0]?.get("conectados")) ?? 0;
        if (conectados === 0) paresDesconectados += 1;
      }
    }

    criticos.push({
      deposito: evitar,
      pares_desconectados: paresDesconectados,
      pares_totales: paresTotales,
      indice_criticidad: paresTotales ? paresDesconectados / paresTotales : 0,
    });
  }

  criticos.sort((a, b) => b.pares_desconectados - a.pares_desconectados);
  return criticos.slice(0, limite);
}

function distanciaHaversineKm(lon1, lat1, lon2, lat2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * TP1-7e: orden de visita que minimiza distancia (vecino más cercano sobre coordenadas).
 * @param {{ id: string, lon: number, lat: number }[]} entregasPendientes
 */
export async function ordenVisitaMinimaDistancia(session, repartidorId, entregasPendientes) {
  const pendientes = [...entregasPendientes];
  if (pendientes.length === 0) {
    return { repartidor_id: repartidorId, orden: [], distancia_total_km: 0 };
  }

  const posResult = await session.run(
    `
    MATCH (r:Repartidor {id: $id})
    RETURN r.lon AS lon, r.lat AS lat
    `,
    { id: String(repartidorId) },
  );

  let lon = num(posResult.records[0]?.get("lon"));
  let lat = num(posResult.records[0]?.get("lat"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    const depResult = await session.run(
      `
      MATCH (d:Deposito)
      WHERE d.lon IS NOT NULL AND d.lat IS NOT NULL
      RETURN d.lon AS lon, d.lat AS lat
      LIMIT 1
      `,
    );
    lon = num(depResult.records[0]?.get("lon"));
    lat = num(depResult.records[0]?.get("lat"));
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    lon = pendientes[0].lon;
    lat = pendientes[0].lat;
  }

  const restantes = [...pendientes];
  const orden = [];
  let distanciaTotal = 0;

  while (restantes.length) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaHaversineKm(lon, lat, restantes[i].lon, restantes[i].lat);
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    const siguiente = restantes.splice(mejorIdx, 1)[0];
    distanciaTotal += mejorDist;
    orden.push({ ...siguiente, distancia_desde_anterior_km: mejorDist });
    lon = siguiente.lon;
    lat = siguiente.lat;
  }

  return {
    repartidor_id: repartidorId,
    orden,
    distancia_total_km: Math.round(distanciaTotal * 100) / 100,
    algoritmo: "vecino_mas_cercano",
  };
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
