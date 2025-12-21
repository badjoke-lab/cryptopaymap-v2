import { Pool } from "pg";

let pool: Pool | null = null;

export const hasDatabaseUrl = () => Boolean(process.env.DATABASE_URL);

export const getDbPool = () => {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!pool) {
    pool = new Pool({ connectionString });
  }

  return pool;
};

