import bcrypt from "bcryptjs";
import type { Resource } from "./adminConfig";
import { getDb } from "./db";

type AnyObj = Record<string, any>;

export function delegate(table: string): any {
  return {
    async count({ where }: { where?: AnyObj } = {}) {
      const query = buildSelect(table, ["count(*)::int as count"], where);
      const result = await getDb().query(query.sql, query.values);
      return result.rows[0]?.count ?? 0;
    },

    async findMany({ where, take = 50, orderBy }: { where?: AnyObj; take?: number; orderBy?: AnyObj } = {}) {
      const query = buildSelect(table, ["*"], where);
      const orderSql = buildOrderSql(orderBy);
      const limitIndex = query.values.length + 1;
      const result = await getDb().query(`${query.sql}${orderSql} LIMIT $${limitIndex}`, [...query.values, take]);
      return result.rows;
    },

    async findUnique({ where }: { where: AnyObj }) {
      const values: any[] = [];
      const whereSql = requireWhereSql(where, values);
      const result = await getDb().query(`SELECT * FROM ${quoteIdent(table)}${whereSql} LIMIT 1`, values);
      return result.rows[0] ?? null;
    },

    async create({ data }: { data: AnyObj }) {
      const columns = Object.keys(data);
      const values = Object.values(data);
      if (!columns.length) {
        const result = await getDb().query(`INSERT INTO ${quoteIdent(table)} DEFAULT VALUES RETURNING *`);
        return result.rows[0] ?? null;
      }

      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders}) RETURNING *`;
      const result = await getDb().query(sql, values);
      return result.rows[0] ?? null;
    },

    async update({ where, data }: { where: AnyObj; data: AnyObj }) {
      const columns = Object.keys(data);
      if (!columns.length) return this.findUnique({ where });

      const values = Object.values(data);
      const assignments = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(", ");
      const whereValues: any[] = [];
      const whereSql = requireWhereSql(where, whereValues, values.length);
      const sql = `UPDATE ${quoteIdent(table)} SET ${assignments}${whereSql} RETURNING *`;
      const result = await getDb().query(sql, [...values, ...whereValues]);
      return result.rows[0] ?? null;
    },

    async delete({ where }: { where: AnyObj }) {
      const values: any[] = [];
      const whereSql = requireWhereSql(where, values);
      const result = await getDb().query(`DELETE FROM ${quoteIdent(table)}${whereSql} RETURNING *`, values);
      return result.rows[0] ?? null;
    },
  };
}

export function formatValue(value: any) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value?.toString) return value.toString();
  return String(value);
}

export function recordKey(resource: Resource, row: AnyObj) {
  const primaryKey = normalizedPrimaryKey(resource);
  if (primaryKey.length === 1) {
    return encodeURIComponent(String(row[primaryKey[0]] ?? ""));
  }

  const keyValues = Object.fromEntries(primaryKey.map((field) => [field, row[field]]));
  return Buffer.from(JSON.stringify(keyValues), "utf8").toString("base64url");
}

export function parseRecordWhere(resource: Resource, id: string) {
  const primaryKey = normalizedPrimaryKey(resource);
  if (primaryKey.length === 1) {
    const field = primaryKey[0];
    return { [field]: coerceFieldValue(resource, field, decodeURIComponent(id)) };
  }

  try {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    const values = JSON.parse(decoded);
    return Object.fromEntries(primaryKey.map((field) => [field, coerceFieldValue(resource, field, values[field])]));
  } catch {
    throw new Error("Invalid record identifier.");
  }
}

export function buildWhere(resource: Resource, q?: string) {
  if (!q) return undefined;
  return { OR: resource.searchFields.map((field) => ({ [field]: { contains: q } })) };
}

export async function formToData(resource: Resource, formData: FormData, mode: "create" | "edit" = "create"): Promise<AnyObj> {
  const data: AnyObj = {};
  for (const field of resource.fields) {
    const raw = formData.get(field.name);

    if (field.type === "checkbox") {
      data[field.name] = raw === null ? 0 : 1;
      continue;
    }

    if (raw === null) continue;

    const value = String(raw).trim();
    if (field.type === "password") {
      if (value === "" && mode === "edit") continue;
      data[field.name] = value === "" ? null : await bcrypt.hash(value, 10);
      continue;
    }

    if (value === "") {
      data[field.name] = null;
      continue;
    }

    if (field.type === "number") data[field.name] = Number(value);
    else if (field.type === "datetime") data[field.name] = value.replace("T", " ");
    else if (field.type === "date") data[field.name] = value;
    else data[field.name] = value;
  }

  const now = new Date();
  if (resource.autoTimestamps?.updatedAt) data.updated_at = now;
  if (mode === "create" && resource.autoTimestamps?.createdAt) data.created_at = now;
  return data;
}

function buildSelect(table: string, columns: string[], where?: AnyObj) {
  const values: any[] = [];
  const whereSql = buildWhereSql(where, values);
  return {
    sql: `SELECT ${columns.join(", ")} FROM ${quoteIdent(table)}${whereSql}`,
    values,
  };
}

function buildWhereSql(where: AnyObj | undefined, values: any[], offset = 0) {
  if (!where) return "";

  if (Array.isArray(where.OR)) {
    const parts = where.OR
      .map((condition: AnyObj) => {
        const [field, filter] = Object.entries(condition)[0] || [];
        if (!field || !filter || typeof filter !== "object" || !("contains" in filter)) return null;
        values.push(`%${String((filter as AnyObj).contains)}%`);
        return `${quoteIdent(field)}::text ILIKE $${offset + values.length}`;
      })
      .filter(Boolean);
    return parts.length ? ` WHERE (${parts.join(" OR ")})` : "";
  }

  const parts = Object.entries(where)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => {
      values.push(value);
      return `${quoteIdent(field)} = $${offset + values.length}`;
    });
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

function requireWhereSql(where: AnyObj | undefined, values: any[], offset = 0) {
  const whereSql = buildWhereSql(where, values, offset);
  if (!whereSql) throw new Error("Missing record identifier.");
  return whereSql;
}

function buildOrderSql(orderBy?: AnyObj) {
  const [field, direction] = Object.entries(orderBy || {})[0] || [];
  if (!field) return "";
  return ` ORDER BY ${quoteIdent(field)} ${direction === "asc" ? "ASC" : "DESC"}`;
}

function normalizedPrimaryKey(resource: Resource) {
  return resource.primaryKey?.length ? resource.primaryKey : ["id"];
}

function coerceFieldValue(resource: Resource, fieldName: string, value: any) {
  if (value === null || value === undefined) return value;
  const field = resource.fields.find((item) => item.name === fieldName);
  const looksNumeric = /(^id$|_id$)/i.test(fieldName);
  if (field?.type === "number" || field?.type === "checkbox" || looksNumeric) {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  return String(value);
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}
