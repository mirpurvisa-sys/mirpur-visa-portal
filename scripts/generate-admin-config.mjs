import { readFileSync, writeFileSync } from "node:fs";

const sqlFile = process.argv[2] || "mirpurvisaportal_portal.postgres.sql";
const outputFile = process.argv[3] || "lib/adminConfig.ts";
const csvFile = process.argv[4] || "C:/Users/Lenovo/Downloads/Supabase Snippet List Public Base Tables (1).csv";
const sql = readFileSync(sqlFile, "utf8");

const titleOverrides = {
  activity_log: "Activity Log",
  client_cases: "Client Cases",
  client_leads: "Client Leads",
  case_installments: "Case Installments",
  daily_activities: "Daily Activities",
  failed_jobs: "Failed Jobs",
  life_skills: "Life Skills",
  password_resets: "Password Resets",
  roles_permissions: "Role Permissions",
  users_permissions: "User Permissions",
  users_roles: "User Roles",
};

const keyOverrides = {
  activity_log: "activity-log",
  client_cases: "cases",
  client_leads: "leads",
  case_installments: "case-installments",
  daily_activities: "daily-activities",
  failed_jobs: "failed-jobs",
  life_skills: "life-skills",
  password_resets: "password-resets",
  roles_permissions: "roles-permissions",
  users_permissions: "users-permissions",
  users_roles: "users-roles",
};

const tables = parseTables(sql);
const primaryKeys = parsePrimaryKeys(sql);
const identityColumns = parseIdentityColumns(sql);
const csvColumns = readCsvColumns(csvFile);

const resources = tables.map((table) => {
  const primaryKey = primaryKeys.get(table.name) || inferPrimaryKey(table);
  const identity = identityColumns.get(table.name) || [];
  const columns = chooseDisplayColumns(table, csvColumns.get(table.name));
  const fields = chooseFields(table, primaryKey, identity);

  return {
    key: keyOverrides[table.name] || table.name.replace(/_/g, "-"),
    title: titleOverrides[table.name] || toTitle(table.name),
    model: table.name,
    primaryKey,
    searchFields: chooseSearchFields(table, primaryKey),
    columns,
    fields,
    autoTimestamps: {
      createdAt: table.columns.some((column) => column.name === "created_at"),
      updatedAt: table.columns.some((column) => column.name === "updated_at"),
    },
  };
});

const output = `export type FieldType = "text" | "number" | "date" | "datetime" | "textarea" | "email" | "password" | "checkbox";
export type Field = {
  name: string;
  label?: string;
  type?: FieldType;
  required?: boolean;
  requiredOnCreate?: boolean;
  optionalOnEdit?: boolean;
  step?: string;
};
export type Resource = {
  key: string;
  title: string;
  model: string;
  primaryKey: string[];
  searchFields: string[];
  columns: string[];
  fields: Field[];
  autoTimestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
};

export const resources: Resource[] = ${JSON.stringify(resources, null, 2)};

export function getResource(key: string) { return resources.find((r) => r.key === key); }
`;

writeFileSync(outputFile, output, "utf8");
console.log(`Wrote ${resources.length} resources to ${outputFile}`);

function parseTables(source) {
  const tables = [];
  const createPattern = /CREATE TABLE IF NOT EXISTS "([^"]+)" \(([\s\S]*?)\n\);/g;

  for (const match of source.matchAll(createPattern)) {
    const [, name, body] = match;
    const columns = [];

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim().replace(/,$/, "");
      const columnMatch = line.match(/^"([^"]+)"\s+(.+)$/);
      if (!columnMatch) continue;
      const [, columnName, definition] = columnMatch;
      columns.push({
        name: columnName,
        definition,
        type: inferType(definition),
        nullable: !/\bNOT NULL\b/i.test(definition),
        hasDefault: /\bDEFAULT\b/i.test(definition),
      });
    }

    tables.push({ name, columns });
  }

  return tables;
}

function parsePrimaryKeys(source) {
  const keys = new Map();
  const pattern = /ALTER TABLE "([^"]+)" ADD PRIMARY KEY \(([^)]+)\);/g;
  for (const match of source.matchAll(pattern)) {
    keys.set(match[1], match[2].split(",").map((column) => column.trim().replace(/"/g, "")));
  }
  return keys;
}

function parseIdentityColumns(source) {
  const identities = new Map();
  const pattern = /ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" ADD GENERATED/g;
  for (const match of source.matchAll(pattern)) {
    const columns = identities.get(match[1]) || [];
    columns.push(match[2]);
    identities.set(match[1], columns);
  }
  return identities;
}

function inferPrimaryKey(table) {
  if (table.columns.some((column) => column.name === "id")) return ["id"];
  if (table.name === "password_resets") return ["email"];
  return table.columns.slice(0, 1).map((column) => column.name);
}

function chooseDisplayColumns(table, csvColumnList) {
  const actualColumns = new Set(table.columns.map((column) => column.name));
  const columns = (csvColumnList?.length ? csvColumnList : table.columns.map((column) => column.name))
    .filter((column) => actualColumns.has(column));
  return columns.length ? columns : table.columns.map((column) => column.name);
}

function chooseSearchFields(table, primaryKey) {
  const blocked = new Set(["password", "remember_token", "payload", "exception", "properties", "data"]);
  const textFields = table.columns
    .filter((column) => ["text", "email", "textarea"].includes(fieldType(column)))
    .map((column) => column.name)
    .filter((name) => !blocked.has(name));
  return textFields.slice(0, 6).length ? textFields.slice(0, 6) : primaryKey;
}

function chooseFields(table, primaryKey, identity) {
  const system = new Set(["created_at", "updated_at", "failed_at", "email_verified_at", "remember_token"]);

  return table.columns
    .filter((column) => !system.has(column.name))
    .filter((column) => !(primaryKey.includes(column.name) && identity.includes(column.name)))
    .map((column) => {
      const type = fieldType(column);
      return {
        name: column.name,
        label: toTitle(column.name),
        type,
        required: column.name === "password" ? false : !column.nullable && !column.hasDefault && !primaryKey.includes(column.name),
        requiredOnCreate: column.name === "password" || (!column.nullable && !column.hasDefault && primaryKey.includes(column.name) && !identity.includes(column.name)),
        optionalOnEdit: column.name === "password",
        ...(isDecimal(column.definition) ? { step: "0.01" } : {}),
      };
    });
}

function fieldType(column) {
  const name = column.name.toLowerCase();
  const type = column.type;
  if (name === "password") return "password";
  if (name === "email" || name.endsWith("_email")) return "email";
  if (type === "timestamp") return "datetime";
  if (type === "date") return "date";
  if (type === "smallint") return "checkbox";
  if (["integer", "bigint", "numeric", "double precision"].includes(type)) return "number";
  if (type === "text" || shouldUseTextarea(name)) return "textarea";
  return "text";
}

function inferType(definition) {
  const lower = definition.toLowerCase();
  if (lower.startsWith("bigint")) return "bigint";
  if (lower.startsWith("integer")) return "integer";
  if (lower.startsWith("smallint")) return "smallint";
  if (lower.startsWith("numeric")) return "numeric";
  if (lower.startsWith("double precision")) return "double precision";
  if (lower.startsWith("timestamp")) return "timestamp";
  if (lower.startsWith("date")) return "date";
  if (lower.startsWith("text")) return "text";
  return "varchar";
}

function shouldUseTextarea(name) {
  return ["address", "description", "remarks", "properties", "payload", "exception", "data", "documents_note"].some((part) => name.includes(part));
}

function isDecimal(definition) {
  return /\bnumeric\(|\bdouble precision\b/i.test(definition);
}

function readCsvColumns(file) {
  try {
    const source = readFileSync(file, "utf8");
    const rows = parseCsv(source);
    const map = new Map();

    for (const row of rows.slice(1)) {
      const [tableName, columns] = row;
      if (!tableName || !columns) continue;
      map.set(tableName, columns.split(",").map((column) => column.trim()).filter(Boolean));
    }

    return map;
  } catch {
    return new Map();
  }
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      value += "\"";
      index++;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function toTitle(value) {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
