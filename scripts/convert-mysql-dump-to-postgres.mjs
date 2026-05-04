import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [inputFile, outputFile = inputFile?.replace(/\.sql$/i, ".postgres.sql")] = process.argv.slice(2);

if (!inputFile) {
  console.error("Usage: node scripts/convert-mysql-dump-to-postgres.mjs <mysql-dump.sql> [output.sql]");
  process.exit(1);
}

const source = readFileSync(inputFile, "utf8");
const statements = splitStatements(source);

const tableOrder = [];
const createTables = [];
const inserts = [];
const primaryKeys = [];
const indexes = [];
const identities = [];
const foreignKeys = [];

for (const originalStatement of statements) {
  const statement = stripLeadingComments(originalStatement).trim();
  if (!statement) continue;

  if (/^CREATE TABLE `/i.test(statement)) {
    const converted = convertCreateTable(statement);
    if (converted) {
      tableOrder.push(converted.table);
      createTables.push(converted.sql);
    }
    continue;
  }

  if (/^INSERT INTO `/i.test(statement)) {
    inserts.push(convertInsert(statement));
    continue;
  }

  if (/^ALTER TABLE `/i.test(statement)) {
    const converted = convertAlterTable(statement);
    primaryKeys.push(...converted.primaryKeys);
    indexes.push(...converted.indexes);
    identities.push(...converted.identities);
    foreignKeys.push(...converted.foreignKeys);
  }
}

const output = [
  `-- Converted from ${basename(inputFile)} for Supabase Postgres.`,
  "-- Review before importing into a database that already has data.",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = off;",
  "SET check_function_bodies = false;",
  "BEGIN;",
  "",
  ...createTables,
  "",
  ...inserts,
  "",
  "-- Primary keys",
  ...primaryKeys,
  "",
  "-- Indexes",
  ...indexes,
  "",
  "-- Identity defaults for auto-increment columns",
  ...identities,
  "",
  "-- Foreign keys",
  ...foreignKeys,
  "",
  "COMMIT;",
  "",
].join("\n");

writeFileSync(outputFile, output, "utf8");

console.log(JSON.stringify({
  inputFile,
  outputFile,
  tables: createTables.length,
  insertStatements: inserts.length,
  primaryKeys: primaryKeys.length,
  indexes: indexes.length,
  identities: identities.length,
  foreignKeys: foreignKeys.length,
}, null, 2));

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

function stripLeadingComments(statement) {
  return statement
    .replace(/^\s*--.*(?:\r?\n|$)/gm, "")
    .replace(/^\s*\/\*![\s\S]*?\*\/\s*;?/gm, "")
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*;?/gm, "")
    .trim();
}

function convertCreateTable(statement) {
  const match = statement.match(/^CREATE TABLE `([^`]+)`\s*\(([\s\S]*)\)\s*ENGINE=/i);
  if (!match) return null;

  const [, table, body] = match;
  const columns = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/,$/, "");
    if (!line.startsWith("`")) continue;

    const columnMatch = line.match(/^`([^`]+)`\s+([\s\S]+)$/);
    if (!columnMatch) continue;

    const [, column, definition] = columnMatch;
    columns.push(`  ${quoteIdent(column)} ${convertColumnDefinition(definition)}`);
  }

  return {
    table,
    sql: `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n${columns.join(",\n")}\n);\n`,
  };
}

function convertColumnDefinition(definition) {
  let converted = definition
    .replace(/\bUNSIGNED\b/gi, "")
    .replace(/\bCHARACTER SET\s+\w+/gi, "")
    .replace(/\bCOLLATE\s+\w+/gi, "")
    .replace(/\bAUTO_INCREMENT\b/gi, "")
    .replace(/\bON UPDATE\s+current_timestamp\(\)/gi, "")
    .replace(/\bcurrent_timestamp\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bdouble\((\d+),\s*(\d+)\)/gi, "numeric($1,$2)")
    .replace(/\bdecimal\((\d+),\s*(\d+)\)/gi, "numeric($1,$2)")
    .replace(/\bbigint\(\d+\)/gi, "bigint")
    .replace(/\btinyint\(1\)/gi, "smallint")
    .replace(/\btinyint\(\d+\)/gi, "smallint")
    .replace(/\bint\(\d+\)/gi, "integer")
    .replace(/\blongtext\b/gi, "text")
    .replace(/\bmediumtext\b/gi, "text")
    .replace(/\bdatetime\b/gi, "timestamp")
    .replace(/\bfloat\b/gi, "double precision")
    .replace(/\s+/g, " ")
    .trim();

  converted = converted.replace(/\bDEFAULT\s+NULL\b/gi, "DEFAULT NULL");
  return converted;
}

function convertInsert(statement) {
  const valuesIndex = statement.search(/\sVALUES\s/i);
  if (valuesIndex === -1) return replaceMySqlIdentifiers(statement) + ";";

  const prefix = statement.slice(0, valuesIndex);
  const suffix = statement.slice(valuesIndex);
  return `${replaceMySqlIdentifiers(prefix)}${suffix};`;
}

function convertAlterTable(statement) {
  const tableMatch = statement.match(/^ALTER TABLE `([^`]+)`\s+([\s\S]+)$/i);
  const converted = { primaryKeys: [], indexes: [], identities: [], foreignKeys: [] };
  if (!tableMatch) return converted;

  const [, table, body] = tableMatch;

  const primaryMatch = body.match(/ADD PRIMARY KEY\s*\(([^)]+)\)/i);
  if (primaryMatch) {
    converted.primaryKeys.push(`ALTER TABLE ${quoteIdent(table)} ADD PRIMARY KEY (${convertColumnList(primaryMatch[1])});`);
  }

  for (const match of body.matchAll(/ADD UNIQUE KEY `([^`]+)`\s*\(([^)]+)\)/gi)) {
    const [, name, columns] = match;
    converted.indexes.push(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${quoteIdent(indexName(table, name))} ON ${quoteIdent(table)} (${convertColumnList(columns)});`,
    );
  }

  for (const match of body.matchAll(/ADD KEY `([^`]+)`\s*\(([^)]+)\)/gi)) {
    const [, name, columns] = match;
    converted.indexes.push(
      `CREATE INDEX IF NOT EXISTS ${quoteIdent(indexName(table, name))} ON ${quoteIdent(table)} (${convertColumnList(columns)});`,
    );
  }

  const identityMatch = body.match(/MODIFY `([^`]+)`[\s\S]*?\bAUTO_INCREMENT\b(?:,\s*AUTO_INCREMENT=(\d+))?/i);
  if (identityMatch) {
    const [, column, startValue] = identityMatch;
    const start = startValue ? ` (START WITH ${startValue})` : "";
    converted.identities.push(`ALTER TABLE ${quoteIdent(table)} ALTER COLUMN ${quoteIdent(column)} ADD GENERATED BY DEFAULT AS IDENTITY${start};`);
  }

  for (const match of body.matchAll(/ADD CONSTRAINT `([^`]+)` FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES `([^`]+)`\s*\(([^)]+)\)([^,;]*)/gi)) {
    const [, name, columns, referencedTable, referencedColumns, suffix] = match;
    converted.foreignKeys.push(
      `ALTER TABLE ${quoteIdent(table)} ADD CONSTRAINT ${quoteIdent(name)} FOREIGN KEY (${convertColumnList(columns)}) REFERENCES ${quoteIdent(referencedTable)} (${convertColumnList(referencedColumns)})${convertConstraintSuffix(suffix)};`,
    );
  }

  return converted;
}

function replaceMySqlIdentifiers(sql) {
  return sql.replace(/`([^`]+)`/g, (_match, identifier) => quoteIdent(identifier));
}

function convertColumnList(list) {
  return list
    .split(",")
    .map((column) => column.trim().replace(/`/g, ""))
    .filter(Boolean)
    .map(quoteIdent)
    .join(", ");
}

function convertConstraintSuffix(suffix) {
  return suffix
    .replace(/`/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^/, " ");
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function indexName(table, name) {
  const raw = `${table}__${name}`;
  if (raw.length <= 55) return raw;
  const hash = createHash("sha1").update(raw).digest("hex").slice(0, 8);
  return `${raw.slice(0, 46)}_${hash}`;
}
