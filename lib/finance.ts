import { getDb } from "./db";

export const APP_TIME_ZONE = "Asia/Karachi";
export const APP_TODAY_SQL = `(NOW() AT TIME ZONE '${APP_TIME_ZONE}')::date`;

export const RECEIVED_INCOME_CTE = `
  income_records AS (
    SELECT
      i.id::text AS source_id,
      i."Amount"::numeric AS amount,
      i."Date"::date AS received_on
    FROM "incomes" i
  ),
  paid_appointments AS (
    SELECT
      a.id,
      a.client_id,
      a.fee::numeric AS fee,
      a.appointmentdate,
      trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))) AS client_name
    FROM "appointments" a
    JOIN "clients" c ON c.id = a.client_id
    WHERE regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') = 'paid'
      AND COALESCE(a.fee, 0) > 0
  ),
  case_installment_rows AS (
    SELECT
      ci.id,
      ci.client_case_id,
      cc.client_id,
      cc.appointment_id,
      a.appointmentstatus,
      ci.name,
      NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric AS amount,
      ci.time,
      COALESCE(NULLIF(cc.client_name, ''), trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, '')))) AS client_name
    FROM "case_installments" ci
    JOIN "client_cases" cc ON cc.id = ci.client_case_id
    LEFT JOIN "appointments" a ON a.id = cc.appointment_id
    LEFT JOIN "clients" c ON c.id = cc.client_id
  ),
  unsynced_case_installment_income AS (
    SELECT ci.*
    FROM case_installment_rows ci
    WHERE COALESCE(ci.amount, 0) > 0
      AND NOT (
        ci.name ILIKE 'Appointment%'
        AND regexp_replace(lower(COALESCE(ci.appointmentstatus, '')), '[^a-z]', '', 'g') <> 'paid'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "incomes" i
        WHERE i."IncomesType" ILIKE 'Case Installment%'
          AND (
            i.foreign_id = ci.id::text
            OR i.foreign_id = ci.id::text || ci.client_case_id::text || ci.client_id::text
            OR (
              COALESCE(i."Title", '') = COALESCE(ci.client_name, '')
              AND COALESCE(i."Amount", 0) = COALESCE(ci.amount, 0)
              AND i."Date" = ci.time::date
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "incomes" i
        JOIN paid_appointments a ON a.id = ci.appointment_id
        WHERE ci.name ILIKE 'Appointment%'
          AND i."IncomesType" ILIKE 'Appointment%'
          AND COALESCE(i."Amount", 0) = COALESCE(ci.amount, 0)
          AND (
            i.foreign_id = a.id::text
            OR i.foreign_id = a.id::text || a.client_id::text
            OR i.foreign_id LIKE (a.id::text || a.client_id::text || '%')
            OR (
              COALESCE(i."Title", '') = a.client_name
              AND i."Date" = a.appointmentdate::date
            )
          )
      )
  ),
  unsynced_appointment_income AS (
    SELECT a.*
    FROM paid_appointments a
    WHERE NOT EXISTS (
        SELECT 1
        FROM "incomes" i
        WHERE i."IncomesType" ILIKE 'Appointment%'
          AND (
            i.foreign_id = a.id::text
            OR i.foreign_id = a.id::text || a.client_id::text
            OR i.foreign_id LIKE (a.id::text || a.client_id::text || '%')
            OR (
              COALESCE(i."Title", '') = a.client_name
              AND COALESCE(i."Amount", 0) = COALESCE(a.fee, 0)
              AND i."Date" = a.appointmentdate::date
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM case_installment_rows ci
        WHERE ci.appointment_id = a.id
          AND ci.name ILIKE 'Appointment%'
          AND COALESCE(ci.amount, 0) = COALESCE(a.fee, 0)
      )
  ),
  received_income AS (
    SELECT amount, received_on FROM income_records
    UNION ALL
    SELECT fee AS amount, appointmentdate::date AS received_on FROM unsynced_appointment_income
    UNION ALL
    SELECT amount, time::date AS received_on FROM unsynced_case_installment_income
  )
`;

export async function getReceivedIncomeTotal() {
  const result = await getDb().query(`
    WITH ${RECEIVED_INCOME_CTE}
    SELECT COALESCE(SUM(amount), 0) AS income
    FROM received_income
  `);
  return Number(result.rows[0]?.income || 0);
}
