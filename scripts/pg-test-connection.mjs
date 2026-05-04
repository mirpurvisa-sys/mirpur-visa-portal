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
  const result = await client.query("select current_database() as database, current_user as user_name, version() as version");
  console.log(JSON.stringify(result.rows[0], null, 2));
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
