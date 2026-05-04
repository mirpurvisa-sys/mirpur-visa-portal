import { getDb } from "./db";

export type SelectOption = {
  id: number;
  label: string;
  detail?: string;
};

export function text(formData: FormData, name: string, fallback = "") {
  const value = String(formData.get(name) ?? "").trim();
  return value || fallback;
}

export function nullableText(formData: FormData, name: string) {
  const value = text(formData, name);
  return value || null;
}

export function numberValue(formData: FormData, name: string, fallback = 0) {
  const value = Number(String(formData.get(name) ?? "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

export function nullableNumber(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function dateValue(formData: FormData, name: string, fallback = today()) {
  return text(formData, name, fallback);
}

export function dateTimeValue(formData: FormData, name: string, fallback = localDateTime()) {
  return text(formData, name, fallback).replace("T", " ");
}

export function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) ? 1 : 0;
}

export function money(value: unknown) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export async function employeeOptions(): Promise<SelectOption[]> {
  const result = await getDb().query(`
    SELECT id, firstname, lastname, designation
    FROM "employees"
    ORDER BY firstname ASC, lastname ASC
    LIMIT 300
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    label: `${row.firstname} ${row.lastname}`.trim(),
    detail: row.designation,
  }));
}

export async function clientOptions(): Promise<SelectOption[]> {
  const result = await getDb().query(`
    SELECT id, firstname, lastname, phone
    FROM "clients"
    ORDER BY id DESC
    LIMIT 300
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    label: `${row.firstname} ${row.lastname}`.trim(),
    detail: row.phone,
  }));
}

export async function syncCaseTotals(caseId: number) {
  await getDb().query(
    `
      WITH totals AS (
        SELECT
          COALESCE(SUM(NULLIF(regexp_replace(amount, '[^0-9.-]', '', 'g'), '')::numeric), 0) AS paid
        FROM "case_installments"
        WHERE client_case_id = $1
      )
      UPDATE "client_cases"
      SET
        total_paid = totals.paid,
        remaining = GREATEST(COALESCE("client_cases".total, 0) - totals.paid, 0),
        updated_at = NOW()
      FROM totals
      WHERE "client_cases".id = $1
    `,
    [caseId],
  );
}

export async function safeCount(sql: string, values: unknown[] = []) {
  try {
    const result = await getDb().query(sql, values);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
