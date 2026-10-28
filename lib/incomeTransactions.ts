import { buildRecordSearch } from "./recordSearch";

type Database = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };
export async function getIncomeTransactions(db: Database, query = "") {
  const search = buildRecordSearch(query, ["title", "category", "description", "reference", "amount", "date", "record_id"]);
  const result = await db.query(`
    WITH parsed_case_installments AS (
      SELECT
        ci.id,
        ci.client_case_id,
        ci.name,
        COALESCE(NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric, 0) AS amount,
        COALESCE(ci.time::date, ci.created_at::date) AS received_on
      FROM "case_installments" ci
    ),
    case_earnings AS (
      SELECT
        'case_installment:' || ci.id::text AS id,
        'case_installment' AS source_type,
        ci.id::text AS record_id,
        COALESCE(NULLIF(cc.client_name, ''), NULLIF(trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))), ''), 'Case #' || cc.id::text) AS title,
        'Case Installment' AS category,
        COALESCE(NULLIF(ci.name, ''), 'Case payment') AS description,
        ci.amount,
        COALESCE(ci.received_on, cc.created_at::date) AS date,
        'Case #' || cc.id::text AS reference,
        '/admin/cases/' || cc.id::text AS href,
        ci.id AS sort_id
      FROM parsed_case_installments ci
      JOIN "client_cases" cc ON cc.id = ci.client_case_id
      LEFT JOIN "appointments" a ON a.id = cc.appointment_id
      LEFT JOIN "clients" c ON c.id = cc.client_id
      WHERE ci.amount > 0
        AND NOT (
          ci.name ILIKE 'Appointment%'
          AND regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') <> 'paid'
        )
    ),
    appointment_earnings AS (
      SELECT
        'appointment:' || a.id::text AS id,
        'appointment' AS source_type,
        a.id::text AS record_id,
        COALESCE(NULLIF(trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))), ''), 'Appointment #' || a.id::text) AS title,
        'Appointment' AS category,
        'Paid appointment fee' AS description,
        a.fee::numeric AS amount,
        COALESCE(a.appointmentdate::date, a.created_at::date) AS date,
        'Appointment #' || a.id::text AS reference,
        '/admin/appointments?edit=' || a.id::text AS href,
        a.id AS sort_id
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
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
    manual_earnings AS (
      SELECT
        'manual_income:' || i.id::text AS id,
        CASE WHEN i.student_course IS NOT NULL THEN 'student_fee' ELSE 'manual_income' END AS source_type,
        i.id::text AS record_id,
        COALESCE(NULLIF(i."Title", ''), 'Income #' || i.id::text) AS title,
        COALESCE(NULLIF(i."IncomesType", ''), 'Income') AS category,
        i."Description" AS description,
        i."Amount"::numeric AS amount,
        i."Date"::date AS date,
        CASE WHEN i.student_course IS NOT NULL THEN i.student_course || ' #' || i.student_id::text ELSE COALESCE(NULLIF(i.foreign_id, ''), 'Income #' || i.id::text) END AS reference,
        CASE WHEN i.student_course IS NOT NULL THEN '/admin/' || i.student_course || '?view=' || i.student_id::text ELSE '/admin/incomes/' || i.id::text || '/edit' END AS href,
        i.id AS sort_id
      FROM "incomes" i
      WHERE COALESCE(i."Amount", 0) > 0
        AND COALESCE(i."IncomesType", '') NOT ILIKE 'Appointment%'
        AND COALESCE(i."IncomesType", '') NOT ILIKE 'Case Installment%'
    ),
    all_earnings AS (
      SELECT * FROM case_earnings
      UNION ALL
      SELECT * FROM appointment_earnings
      UNION ALL
      SELECT * FROM manual_earnings
    )
    SELECT id, source_type, record_id, title, category, amount, description, date, reference, href
    FROM all_earnings
    WHERE ${search.condition}
    ORDER BY date DESC NULLS LAST, sort_id DESC
    LIMIT 80
  `, search.values);
  return result.rows;
}
