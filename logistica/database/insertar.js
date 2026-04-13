/**
 * Helper para inserciones masivas en MongoDB con chunking.
 * @param {import("mongodb").Collection} col
 * @param {object[]} docs
 * @param {{ chunkSize?: number, ordered?: boolean, log?: Console }} [opts]
 */
export async function insertarMuchos(col, docs, opts = {}) {
  const { chunkSize = 1000, ordered = false, log } = opts;
  if (!Array.isArray(docs) || docs.length === 0) {
    return { insertedCount: 0 };
  }

  let inserted = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    const r = await col.insertMany(chunk, { ordered });
    inserted += r.insertedCount ?? chunk.length;
    if (log) log.log(`  - ${col.collectionName}: +${chunk.length} (total ${inserted})`);
  }

  return { insertedCount: inserted };
}

