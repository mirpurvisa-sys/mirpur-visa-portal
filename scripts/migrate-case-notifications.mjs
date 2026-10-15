import { readFileSync } from "node:fs";
import { Client } from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
const db = new Client({
  connectionString: url.toString(), ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000, statement_timeout: 30000,
});
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '5s'");
  await db.query(readFileSync(new URL("./case-notifications.sql", import.meta.url), "utf8"));
  await db.query("COMMIT");
  console.log("Case notification table and triggers installed. Existing case data was preserved.");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  console.error("Notification migration failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
