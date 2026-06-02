const pg = require("pg");

type QueryResult = { rows: any[] };
type PgPool = {
  query: (text: string, values?: any[]) => Promise<QueryResult>;
};

const globalForPg = globalThis as unknown as { pgPool?: PgPool; pgDateParsersConfigured?: boolean };

export function getDb(): PgPool {
  configurePgDateParsers();
  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new pg.Pool({
      connectionString: withoutSslMode(process.env.DATABASE_URL || ""),
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
      keepAlive: true,
    });
  }

  return globalForPg.pgPool;
}

function configurePgDateParsers() {
  if (globalForPg.pgDateParsersConfigured) return;
  // Keep date-only and timestamp-without-time-zone values in database-local form.
  // JS Date converts them through UTC, which made many date columns display one day behind.
  pg.types.setTypeParser(1082, (value: string) => value);
  pg.types.setTypeParser(1114, (value: string) => value);
  globalForPg.pgDateParsersConfigured = true;
}

function withoutSslMode(value: string) {
  if (!value) return value;
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
