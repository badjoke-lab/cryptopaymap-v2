import { readFileSync } from 'fs';
import path from 'path';
import { Client } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL environment variable');
    process.exit(1);
  }

  const fileArg = process.argv[2];
  const sqlPath = fileArg ? path.resolve(fileArg) : path.join(process.cwd(), 'migrations/compat_v3_min.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log(`Migration applied from ${sqlPath}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Unexpected migration error:', error);
  process.exit(1);
});
