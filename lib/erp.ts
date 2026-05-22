import { getDb } from "./db";
import { APP_TIME_ZONE } from "./finance";

const EXPENSE_VOUCHER_SEQUENCE_FLOOR = 4694;

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

export function isPaidStatus(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z]/g, "") === "paid";
}

export function today() {
  const { year, month, day } = datePartsInAppTime();
  return `${year}-${month}-${day}`;
}

export function localDateTime(date = new Date()) {
  const { year, month, day, hour, minute } = datePartsInAppTime(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function datePartsInAppTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: values.year || "1970",
    month: values.month || "01",
    day: values.day || "01",
    hour: values.hour || "00",
    minute: values.minute || "00",
  };
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
      WITH case_row AS (
        SELECT id, total, appointment_id
        FROM "client_cases"
        WHERE id = $1
      ),
      installment_totals AS (
        SELECT
          COALESCE(SUM(NULLIF(regexp_replace(amount, '[^0-9.-]', '', 'g'), '')::numeric), 0) AS paid
        FROM "case_installments"
        JOIN case_row ON case_row.id = "case_installments".client_case_id
        LEFT JOIN "appointments" a ON a.id = case_row.appointment_id
        WHERE client_case_id = $1
          AND NOT (
            "case_installments".name ILIKE 'Appointment%'
            AND regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') <> 'paid'
          )
      ),
      paid_appointment AS (
        SELECT
          CASE
            WHEN regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') = 'paid'
              AND COALESCE(a.fee, 0) > 0
              AND NOT EXISTS (
                SELECT 1
                FROM "case_installments" ci
                WHERE ci.client_case_id = case_row.id
                  AND ci.name ILIKE 'Appointment%'
                  AND COALESCE(NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric, 0) = COALESCE(a.fee, 0)
              )
            THEN COALESCE(a.fee, 0)
            ELSE 0
          END AS paid
        FROM case_row
        LEFT JOIN "appointments" a ON a.id = case_row.appointment_id
      ),
      totals AS (
        SELECT installment_totals.paid + paid_appointment.paid AS paid
        FROM installment_totals, paid_appointment
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

export async function nextExpenseVoucherNo() {
  const result = await getDb().query(`
    WITH latest AS (
      SELECT NULLIF(substring(trim(voucher_no) from '([0-9]+)$'), '')::integer AS voucher_no
      FROM "expenses"
      WHERE NULLIF(substring(trim(voucher_no) from '([0-9]+)$'), '') IS NOT NULL
      ORDER BY id DESC
      LIMIT 1
    )
    SELECT GREATEST(COALESCE((SELECT voucher_no FROM latest), 0), $1) + 1 AS voucher_no
  `, [EXPENSE_VOUCHER_SEQUENCE_FLOOR]);

  return String(result.rows[0]?.voucher_no || 1);
}

export async function safeCount(sql: string, values: unknown[] = []) {
  try {
    const result = await getDb().query(sql, values);
    return Number(result.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
