import { Client } from "pg";
import { readFileSync } from "node:fs";

const [dumpFile = "mirpurvisaportal_portal.sql"] = process.argv.slice(2);
const env = readEnvFile(".env");
const connectionString = withoutSslMode(process.env.DATABASE_URL || env.DATABASE_URL);
const dump = readFileSync(dumpFile, "utf8");

const expected = countDumpRows(dump);
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

  const actual = new Map();
  for (const { tablename } of tablesResult.rows) {
    const result = await client.query(`select count(*)::int as count from "${tablename}"`);
    actual.set(tablename, result.rows[0].count);
  }

  const tables = Array.from(new Set([...expected.keys(), ...actual.keys()])).sort();
  let mismatches = 0;

  console.log("table,expected_from_dump,actual_in_supabase,difference");
  for (const table of tables) {
    const expectedCount = expected.get(table) ?? 0;
    const actualCount = actual.get(table) ?? 0;
    const difference = actualCount - expectedCount;
    if (difference !== 0) mismatches += 1;
    console.log(`${table},${expectedCount},${actualCount},${difference}`);
  }

  console.log(`mismatches=${mismatches}`);
} finally {
  await client.end().catch(() => {});
}

function countDumpRows(sql) {
  const counts = new Map();
  const statements = splitStatements(sql);

  for (const statement of statements) {
    const match = statement.match(/INSERT INTO `([^`]+)`[\s\S]*?\bVALUES\s*([\s\S]*)$/i);
    if (!match) continue;

    const [, table, values] = match;
    counts.set(table, (counts.get(table) ?? 0) + countTopLevelTuples(values));
  }

  return counts;
}

function countTopLevelTuples(values) {
  let count = 0;
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < values.length; i += 1) {
    const char = values[i];

    if (char === "\\" && inSingle) {
      i += 1;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (char === "(") {
      if (depth === 0) count += 1;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
  }

  return count;
}

function splitStatements(sql) {
  const result = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingle && !inDouble && !inBacktick) {
      if (char === "-" && next === "-") {
        inLineComment = true;
        current += char;
        continue;
      }

      if (char === "/" && next === "*") {
        inBlockComment = true;
        current += char;
        continue;
      }
    }

    if (char === "\\" && inSingle) {
      current += char;
      if (i + 1 < sql.length) {
        current += sql[i + 1];
        i += 1;
      }
      continue;
    }

    if (!inDouble && !inBacktick && char === "'") inSingle = !inSingle;
    else if (!inSingle && !inBacktick && char === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && char === "`") inBacktick = !inBacktick;

    if (!inSingle && !inDouble && !inBacktick && char === ";") {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
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
