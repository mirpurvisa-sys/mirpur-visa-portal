const pg = require("pg");

type QueryResult = { rows: any[] };
type PgPool = {
  query: (text: string, values?: any[]) => Promise<QueryResult>;
};

const globalForPg = globalThis as unknown as { pgPool?: PgPool };

export function getDb(): PgPool {
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new pg.Pool({
      connectionString: withoutSslMode(process.env.DATABASE_URL || ""),
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 20000,
    });
  }

  return globalForPg.pgPool;
}

function withoutSslMode(value: string) {
  if (!value) return value;
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
