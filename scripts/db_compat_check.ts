import { Client } from 'pg';

type TableCheck = {
  name: string;
  exists: boolean;
};

type ColumnCheck = {
  table: string;
  column: string;
  exists: boolean;
};

const expectedTables = [
  'places',
  'verifications',
  'payments',
  'payment_accepts',
  'socials',
  'media',
  'categories',
  'history',
];

const criticalColumns: Record<string, string[]> = {
  places: ['id', 'name', 'city', 'country', 'category', 'lat', 'lng', 'geom'],
  verifications: ['place_id', 'status', 'last_checked', 'last_verified', 'updated_at'],
};

const reasons: string[] = [];

function log(line: string) {
  console.log(line);
}

function title(line: string) {
  const formatted = `- ${line}`;
  log(formatted);
}

 async function checkPostgis(client: Client) {
  try {
    const { rows } = await client.query<{ present: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS present;",
    );
    if (rows[0]?.present) {
      title('PostGIS: OK');
      return true;
    }

    const funcCheck = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'st_makepoint') AS exists;",
    );

    if (funcCheck.rows[0]?.exists) {
      title('PostGIS functions detected (extension record missing)');
      return true;
    }

    title('PostGIS: MISSING');
    reasons.push('Missing PostGIS extension');
    return false;
  } catch (error) {
    title(`PostGIS: ERROR ${(error as Error).message}`);
    reasons.push('Could not verify PostGIS extension');
    return false;
  }
 }

 async function getExistingTables(client: Client) {
  const { rows } = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
  );
  const existing = rows.map((row) => row.table_name);
  const checks: TableCheck[] = expectedTables.map((table) => ({
    name: table,
    exists: existing.includes(table),
  }));

  const summary = checks
    .map((check) => `${check.name} ${check.exists ? 'OK' : 'MISSING'}`)
    .join(', ');
  title(`Tables: ${summary}`);

  checks
    .filter((check) => !check.exists)
    .forEach((check) => reasons.push(`Missing table: ${check.name}`));

  return checks;
 }

 async function checkColumns(client: Client, tables: TableCheck[]) {
  const results: ColumnCheck[] = [];

  for (const [table, cols] of Object.entries(criticalColumns)) {
    const tablePresent = tables.find((t) => t.name === table)?.exists;
    if (!tablePresent) {
      continue;
    }

    const { rows } = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    const presentCols = rows.map((row) => row.column_name);

    cols.forEach((col) => {
      const exists = presentCols.includes(col);
      results.push({ table, column: col, exists });
      if (!exists) {
        reasons.push(`Missing column: ${table}.${col}`);
      }
    });
  }

  if (results.length === 0) {
    title('Columns: skipped (tables missing)');
    return results;
  }

  const summary = results.map((col) => `${col.table}.${col.column} ${col.exists ? 'OK' : 'MISSING'}`).join(', ');
  title(`Columns: ${summary}`);
  return results;
 }

async function dataSanity(client: Client, tables: TableCheck[]): Promise<void> {
  const details: string[] = [];
  const presentTables = new Set(tables.filter((t) => t.exists).map((t) => t.name));

  try {
    if (presentTables.has('places')) {
      const countRes = await client.query<{ count: string }>('SELECT COUNT(*)::BIGINT AS count FROM places');
      const count = countRes.rows[0]?.count ?? '0';

      const nulls = await client.query<{ total: string; name_nulls: string; country_nulls: string; city_nulls: string; category_nulls: string; lat_nulls: string; lng_nulls: string }>(
        `SELECT
           COUNT(*)::BIGINT AS total,
           SUM(CASE WHEN name IS NULL THEN 1 ELSE 0 END)::BIGINT AS name_nulls,
           SUM(CASE WHEN country IS NULL THEN 1 ELSE 0 END)::BIGINT AS country_nulls,
           SUM(CASE WHEN city IS NULL THEN 1 ELSE 0 END)::BIGINT AS city_nulls,
           SUM(CASE WHEN category IS NULL THEN 1 ELSE 0 END)::BIGINT AS category_nulls,
           SUM(CASE WHEN lat IS NULL THEN 1 ELSE 0 END)::BIGINT AS lat_nulls,
           SUM(CASE WHEN lng IS NULL THEN 1 ELSE 0 END)::BIGINT AS lng_nulls
         FROM places`,
      );
      const row = nulls.rows[0];
      details.push(`places count=${count}, nulls(name=${row?.name_nulls ?? '0'}, country=${row?.country_nulls ?? '0'}, city=${row?.city_nulls ?? '0'}, category=${row?.category_nulls ?? '0'}, lat=${row?.lat_nulls ?? '0'}, lng=${row?.lng_nulls ?? '0'})`);

      const samples = await client.query(
        'SELECT id, name, country, city, category, lat, lng FROM places LIMIT 3',
      );
      samples.rows.forEach((sample, idx) => {
        details.push(`places sample ${idx + 1}: ${JSON.stringify(sample)}`);
      });
    } else {
      details.push('places table missing, data sanity skipped');
    }

    if (presentTables.has('verifications')) {
      const countRes = await client.query<{ count: string }>(
        'SELECT COUNT(*)::BIGINT AS count FROM verifications',
      );
      const count = countRes.rows[0]?.count ?? '0';
      details.push(`verifications count=${count}`);

      const samples = await client.query(
        'SELECT place_id, status, last_checked, last_verified FROM verifications LIMIT 3',
      );
      samples.rows.forEach((sample, idx) => {
        details.push(`verifications sample ${idx + 1}: ${JSON.stringify(sample)}`);
      });
    } else {
      details.push('verifications table missing, data sanity skipped');
    }
  } catch (error) {
    const message = (error as Error).message;
    details.push(`Data sanity check error: ${message}`);
    reasons.push(`Data sanity check failed: ${message}`);
  }

  title('Data sanity:');
  details.forEach((line) => log(`  - ${line}`));
}

 async function main() {
  console.log('DB COMPAT CHECK');
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('Missing DATABASE_URL environment variable');
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    title('Connection: OK');
  } catch (error) {
    title(`Connection: FAIL ${(error as Error).message}`);
    reasons.push('Unable to connect to database');
    console.log('\nVERDICT: FAIL');
    console.log('Reasons:');
    reasons.forEach((reason) => console.log(`- ${reason}`));
    console.log('\n---\nMarkdown report template:\n');
    console.log(`## DB Compatibility Check\n` +
      `- Connection: FAIL (${(error as Error).message})\n` +
      `- PostGIS: N/A\n` +
      `- Tables: N/A\n` +
      `- Columns: N/A\n` +
      `- Data sanity: not run\n` +
      `- Verdict: FAIL`);
    await client.end().catch(() => {});
    return;
  }

  const postgisOk = await checkPostgis(client);
  const tables = await getExistingTables(client);
  const columns = await checkColumns(client, tables);
  await dataSanity(client, tables);

  const allTablesOk = tables.every((t) => t.exists);
  const columnsOk = columns.every((c) => c.exists);
  const verdict = postgisOk && allTablesOk && columnsOk && reasons.length === 0 ? 'PASS' : 'FAIL';

  console.log('\nVERDICT:', verdict === 'PASS' ? 'PASS: DB looks compatible' : 'FAIL: DB incompatible');
  if (reasons.length > 0) {
    console.log('Reasons:');
    reasons.forEach((reason) => console.log(`- ${reason}`));
  }

  console.log('\n---\nMarkdown report template:\n');
  console.log(`## DB Compatibility Check\n` +
    `- Connection: ${'OK'}\n` +
    `- PostGIS: ${postgisOk ? 'OK' : 'MISSING'}\n` +
    `- Tables: ${tables.map((t) => `${t.name} ${t.exists ? 'OK' : 'MISSING'}`).join(', ')}\n` +
    `- Columns: ${columns.length > 0 ? columns.map((c) => `${c.table}.${c.column} ${c.exists ? 'OK' : 'MISSING'}`).join(', ') : 'N/A'}\n` +
    `- Data sanity: see console output above\n` +
    `- Verdict: ${verdict}`);

  await client.end();
  if (verdict === 'FAIL') {
    process.exitCode = 1;
  }
 }

 main().catch((error) => {
  console.error('Unexpected error during DB compatibility check:', error);
  process.exit(1);
 });
