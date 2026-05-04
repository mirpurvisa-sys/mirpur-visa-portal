import { Client } from "pg";
import { readFileSync } from "node:fs";

const env = readEnvFile(".env");
const connectionString = withoutSslMode(process.env.DATABASE_URL || env.DATABASE_URL);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  const tablesResult = await client.query(`
    select tablename
    from pg_catalog.pg_tables
    where schemaname = 'public'
    order by tablename
  `);

  for (const { tablename } of tablesResult.rows) {
    const countResult = await client.query(`select count(*)::int as count from "${tablename}"`);
    console.log(`${tablename}: ${countResult.rows[0].count}`);
  }
} finally {
  await client.end().catch(() => {});
}

function readEnvFile(path) {
  const env = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function withoutSslMode(value) {
  const url = new URL(value);
  url.searchParams.delete("sslmode");
  return url.toString();
}
