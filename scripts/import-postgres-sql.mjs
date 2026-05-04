import { Client } from "pg";
import { readFileSync } from "node:fs";

const [sqlFile = "mirpurvisaportal_portal.postgres.sql"] = process.argv.slice(2);
const env = readEnvFile(".env");
const connectionString = withoutSslMode(process.env.DATABASE_URL || env.DATABASE_URL);
const sql = readFileSync(sqlFile, "utf8");
const statements = splitStatements(sql);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  query_timeout: 0,
  statement_timeout: 0,
});

console.log(`Importing ${statements.length} SQL statements from ${sqlFile}...`);

try {
  await client.connect();

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index].trim();
    if (!statement) continue;

    try {
      await client.query(statement);
    } catch (error) {
      console.error(`Import failed at statement ${index + 1}/${statements.length}`);
      console.error(statement.slice(0, 600));
      throw error;
    }

    if ((index + 1) % 50 === 0 || index + 1 === statements.length) {
      console.log(`Executed ${index + 1}/${statements.length}`);
    }
  }

  console.log("Import completed.");
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

function splitStatements(sqlText) {
  const result = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const char = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (!inSingle && !inDouble && char === "-" && next === "-") {
      inLineComment = true;
      current += char;
      continue;
    }

    if (char === "\\" && inSingle) {
      current += char;
      if (i + 1 < sqlText.length) {
        current += sqlText[i + 1];
        i += 1;
      }
      continue;
    }

    if (!inDouble && char === "'") inSingle = !inSingle;
    else if (!inSingle && char === '"') inDouble = !inDouble;

    if (!inSingle && !inDouble && char === ";") {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
}
