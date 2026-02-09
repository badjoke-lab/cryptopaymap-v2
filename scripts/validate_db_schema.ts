import { Client } from "pg";

type Row = Record<string, any>;

async function q<T extends Row>(c: Client, sql: string, params: any[] = []) {
  return c.query<T>(sql, params);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // 1) tables existence
    const tables = ["submissions", "places", "verifications", "payment_accepts"];
    for (const t of tables) {
      const r = await q(client, `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema='public' AND table_name=$1
        LIMIT 1
      `, [t]);
      if (r.rowCount === 0) {
        throw new Error(`Missing table: public.${t}`);
      }
    }

    // 2) required columns (minimal promote surface)
    const requiredCols: Record<string, string[]> = {
      submissions: [
        "id","kind","status","payload",
        "name","country","city","category","address","about",
        "lat","lng","accepted_chains",
        "suggested_place_id","published_place_id"
      ],
      places: ["id","name","country","city","category","address","lat","lng","about"],
      verifications: ["id","place_id","level","status"],
      payment_accepts: ["id","place_id","asset","chain"]
    };

    for (const [table, cols] of Object.entries(requiredCols)) {
      const r = await q<{ column_name: string }>(client, `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
      `, [table]);
      const set = new Set(r.rows.map(x => x.column_name));
      const miss = cols.filter(cn => !set.has(cn));
      if (miss.length) {
        throw new Error(`Missing columns in public.${table}: ${miss.join(", ")}`);
      }
    }

    // 3) verifications: ON CONFLICT(place_id) requires UNIQUE/PK on place_id
    const vUq = await q(client, `
      SELECT 1
      FROM pg_indexes
      WHERE schemaname='public'
        AND tablename='verifications'
        AND indexdef ILIKE '%UNIQUE%'
        AND indexdef ILIKE '%(place_id)%'
      LIMIT 1
    `);
    if (vUq.rowCount === 0) {
      throw new Error("Missing UNIQUE index/constraint for verifications(place_id) required by ON CONFLICT(place_id)");
    }

    // 4) verifications.status check (approved/rejected/pending)
    const vCheck = await q<{ def: string }>(client, `
      SELECT pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname='public'
        AND t.relname='verifications'
        AND c.contype='c'
        AND c.conname='verifications_status_check'
      LIMIT 1
    `);
    if (vCheck.rowCount === 0) {
      throw new Error("Missing check constraint verifications_status_check");
    }

    // 5) payment_accepts: ON CONFLICT(place_id,asset,chain[,method]) requires UNIQUE on those keys
    // method column may or may not exist
    const hasMethod = await q(client, `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payment_accepts' AND column_name='method'
      LIMIT 1
    `);

    const target = hasMethod.rowCount ? "(place_id, asset, chain, method)" : "(place_id, asset, chain)";
    const paUq = await q(client, `
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname='public' AND tablename='payment_accepts'
        AND indexdef ILIKE '%UNIQUE%'
      ORDER BY indexname
    `);

    const ok = paUq.rows.some(r => {
      const s = String((r as any).indexdef || "").replace(/\s+/g, " ").toLowerCase();
      return hasMethod.rowCount
        ? s.includes("(place_id, asset, chain, method)")
        : s.includes("(place_id, asset, chain)");
    });

    if (!ok) {
      throw new Error(`Missing UNIQUE index/constraint for payment_accepts${target} required by ON CONFLICT`);
    }

    // 6) warn: duplicate uniques on same key (not fatal)
    const uniqDefs = paUq.rows.map(r => String((r as any).indexdef || "").replace(/\s+/g, " ").toLowerCase());
    const key = hasMethod.rowCount ? "(place_id, asset, chain, method)" : "(place_id, asset, chain)";
    const dup = uniqDefs.filter(d => d.includes(key));
    if (dup.length >= 2) {
      console.warn(`WARN: payment_accepts has ${dup.length} UNIQUE indexes on ${key}. Consider dropping duplicates later.`);
    }

    console.log("OK: DB schema looks compatible with promote.ts");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("SCHEMA CHECK FAILED:", e?.message || e);
  process.exit(1);
});
