import { revalidateTag, unstable_cache } from "next/cache";
import { getDb } from "./db";

export const APP_TIME_ZONE = "Asia/Karachi";
export const APP_TODAY_SQL = `(NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date`;
export const FINANCE_CACHE_TAG = "finance";

export const RECEIVED_INCOME_CTE = `
  parsed_case_installments AS (
    SELECT
      ci.id,
      ci.client_case_id,
      ci.name,
      COALESCE(NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric, 0) AS amount,
      COALESCE(ci.time::date, ci.created_at::date) AS received_on
    FROM "case_installments" ci
  ),
  case_installment_income AS (
    SELECT
      'case_installment:' || ci.id::text AS source_id,
      ci.amount,
      COALESCE(ci.received_on, cc.created_at::date) AS received_on
    FROM parsed_case_installments ci
    JOIN "client_cases" cc ON cc.id = ci.client_case_id
    LEFT JOIN "appointments" a ON a.id = cc.appointment_id
    WHERE ci.amount > 0
      AND NOT (
        ci.name ILIKE 'Appointment%'
        AND regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') <> 'paid'
      )
  ),
  paid_appointment_income AS (
    SELECT
      'appointment:' || a.id::text AS source_id,
      a.fee::numeric AS amount,
      COALESCE(a.appointmentdate::date, a.created_at::date) AS received_on
    FROM "appointments" a
    WHERE regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') = 'paid'
      AND COALESCE(a.fee, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM "client_cases" cc
        JOIN parsed_case_installments ci ON ci.client_case_id = cc.id
        WHERE cc.appointment_id = a.id
          AND ci.name ILIKE 'Appointment%'
          AND ci.amount = COALESCE(a.fee, 0)
      )
  ),
  manual_income AS (
    SELECT
      'manual_income:' || i.id::text AS source_id,
      i."Amount"::numeric AS amount,
      i."Date"::date AS received_on
    FROM "incomes" i
    WHERE COALESCE(i."Amount", 0) > 0
      AND COALESCE(i."IncomesType", '') NOT ILIKE 'Appointment%'
      AND COALESCE(i."IncomesType", '') NOT ILIKE 'Case Installment%'
  ),
  received_income AS (
    SELECT * FROM case_installment_income
    UNION ALL
    SELECT * FROM paid_appointment_income
    UNION ALL
    SELECT * FROM manual_income
  )
`;

const getReceivedIncomeTotalCached = unstable_cache(async () => {
  const result = await getDb().query(`
    WITH ${RECEIVED_INCOME_CTE}
    SELECT COALESCE(SUM(amount), 0) AS income
    FROM received_income
  `);
  return Number(result.rows[0]?.income || 0);
}, ["received-income-total-v3"], { revalidate: 60, tags: [FINANCE_CACHE_TAG] });

export async function getReceivedIncomeTotal() {
  return getReceivedIncomeTotalCached();
}

export function revalidateFinanceCache() {
  revalidateTag(FINANCE_CACHE_TAG, "max");
}
