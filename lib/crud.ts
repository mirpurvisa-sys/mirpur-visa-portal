import { getDb } from "./db";
import type { Resource } from "./adminConfig";

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
      const orderSql = orderBy?.id === "desc" ? ` ORDER BY ${quoteIdent("id")} DESC` : "";
      const limitIndex = query.values.length + 1;
      const result = await getDb().query(`${query.sql}${orderSql} LIMIT $${limitIndex}`, [...query.values, take]);
      return result.rows;
    },

    async findUnique({ where }: { where: AnyObj }) {
      const query = buildSelect(table, ["*"], { id: where.id });
      const result = await getDb().query(`${query.sql} LIMIT 1`, query.values);
      return result.rows[0] ?? null;
    },

    async create({ data }: { data: AnyObj }) {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${placeholders}) RETURNING *`;
      const result = await getDb().query(sql, values);
      return result.rows[0] ?? null;
    },

    async update({ where, data }: { where: AnyObj; data: AnyObj }) {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const assignments = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`).join(", ");
      const idIndex = values.length + 1;
      const sql = `UPDATE ${quoteIdent(table)} SET ${assignments} WHERE ${quoteIdent("id")} = $${idIndex} RETURNING *`;
      const result = await getDb().query(sql, [...values, where.id]);
      return result.rows[0] ?? null;
    },

    async delete({ where }: { where: AnyObj }) {
      const result = await getDb().query(`DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent("id")} = $1 RETURNING *`, [where.id]);
      return result.rows[0] ?? null;
    },
  };
}

export function formatValue(value: any) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value?.toString) return value.toString();
  return String(value);
}

export function parseId(id: string) {
  return /^\d+$/.test(id) ? Number(id) : id;
}

export function buildWhere(resource: Resource, q?: string) {
  if (!q) return undefined;
  return { OR: resource.searchFields.map((field) => ({ [field]: { contains: q } })) };
}

export function formToData(resource: Resource, formData: FormData): AnyObj {
  const data: AnyObj = {};
  for (const field of resource.fields) {
    const raw = formData.get(field.name);
    if (raw === null) continue;
    const value = String(raw).trim();
    if (value === "") { data[field.name] = null; continue; }
    if (field.type === "number") data[field.name] = Number(value);
    else if (field.type === "date") data[field.name] = new Date(value);
    else data[field.name] = value;
  }
  data.updated_at = new Date();
  if (!data.created_at) data.created_at = new Date();
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

function buildWhereSql(where: AnyObj | undefined, values: any[]) {
  if (!where) return "";

  if (Array.isArray(where.OR)) {
    const parts = where.OR
      .map((condition: AnyObj) => {
        const [field, filter] = Object.entries(condition)[0] || [];
        if (!field || !filter || typeof filter !== "object" || !("contains" in filter)) return null;
        values.push(`%${String((filter as AnyObj).contains)}%`);
        return `${quoteIdent(field)}::text ILIKE $${values.length}`;
      })
      .filter(Boolean);
    return parts.length ? ` WHERE (${parts.join(" OR ")})` : "";
  }

  const parts = Object.entries(where).map(([field, value]) => {
    values.push(value);
    return `${quoteIdent(field)} = $${values.length}`;
  });
  return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
}

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}
