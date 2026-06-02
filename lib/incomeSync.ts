import { getDb } from "./db";
import { isPaidStatus } from "./erp";
import { revalidateFinanceCache } from "./finance";

const APPOINTMENT_SYNC_DESCRIPTION = "Auto-synced from paid appointment";
const CASE_INSTALLMENT_SYNC_DESCRIPTION = "Auto-synced from case installment";

export async function syncAppointmentIncome(appointmentId: number) {
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) return;

  const result = await getDb().query(
    `
      SELECT
        a.id,
        a.client_id,
        a.fee,
        a.appointmentstatus,
        a.appointmentdate,
        trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))) AS client_name
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
      WHERE a.id=$1
      LIMIT 1
    `,
    [appointmentId],
  );
  const appointment = result.rows[0];
  if (!appointment) return;

  const amount = Number(appointment.fee || 0);
  const shouldRecord = isPaidStatus(appointment.appointmentstatus) && amount > 0;
  const foreignId = String(appointment.id);

  if (!shouldRecord) {
    await getDb().query(
      `DELETE FROM "incomes" WHERE foreign_id=$1 AND "IncomesType" ILIKE 'Appointment%' AND "Description"=$2`,
      [foreignId, APPOINTMENT_SYNC_DESCRIPTION],
    );
    revalidateFinanceCache();
    return;
  }

  const title = appointment.client_name || `Appointment #${appointment.id}`;
  const date = appointment.appointmentdate ? String(appointment.appointmentdate).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const updated = await getDb().query(
    `
      UPDATE "incomes"
      SET "Title"=$1, "Amount"=$2, "Date"=$3, updated_at=NOW()
      WHERE foreign_id=$4 AND "IncomesType" ILIKE 'Appointment%' AND "Description"=$5
      RETURNING id
    `,
    [title, amount, date, foreignId, APPOINTMENT_SYNC_DESCRIPTION],
  );

  if (!updated.rows[0]) {
    await getDb().query(
      `
        INSERT INTO "incomes" ("Title", "IncomesType", "Amount", "Description", "Date", foreign_id, created_at, updated_at)
        VALUES ($1, 'Appointment', $2, $3, $4, $5, NOW(), NOW())
      `,
      [title, amount, APPOINTMENT_SYNC_DESCRIPTION, date, foreignId],
    );
  }
  revalidateFinanceCache();
}

export async function syncCaseInstallmentIncome(installmentId: number) {
  if (!Number.isFinite(installmentId) || installmentId <= 0) return;

  const result = await getDb().query(
    `
      SELECT
        ci.id,
        ci.name,
        NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric AS amount,
        ci.time,
        cc.client_name,
        trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))) AS fallback_client_name
      FROM "case_installments" ci
      JOIN "client_cases" cc ON cc.id = ci.client_case_id
      LEFT JOIN "clients" c ON c.id = cc.client_id
      WHERE ci.id=$1
      LIMIT 1
    `,
    [installmentId],
  );
  const installment = result.rows[0];
  if (!installment) return;

  const foreignId = String(installment.id);
  const amount = Number(installment.amount || 0);
  if (amount <= 0 || isAppointmentInstallment(installment.name)) {
    await deleteCaseInstallmentIncome(installmentId);
    return;
  }

  const title = installment.client_name || installment.fallback_client_name || `Case installment #${installment.id}`;
  const date = installment.time ? String(installment.time).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const updated = await getDb().query(
    `
      UPDATE "incomes"
      SET "Title"=$1, "Amount"=$2, "Date"=$3, updated_at=NOW()
      WHERE foreign_id=$4 AND "IncomesType" ILIKE 'Case Installment%' AND "Description"=$5
      RETURNING id
    `,
    [title, amount, date, foreignId, CASE_INSTALLMENT_SYNC_DESCRIPTION],
  );

  if (!updated.rows[0]) {
    await getDb().query(
      `
        INSERT INTO "incomes" ("Title", "IncomesType", "Amount", "Description", "Date", foreign_id, created_at, updated_at)
        VALUES ($1, 'Case Installment', $2, $3, $4, $5, NOW(), NOW())
      `,
      [title, amount, CASE_INSTALLMENT_SYNC_DESCRIPTION, date, foreignId],
    );
  }
  revalidateFinanceCache();
}

export async function deleteCaseInstallmentIncome(installmentId: number) {
  if (!Number.isFinite(installmentId) || installmentId <= 0) return;

  await getDb().query(
    `DELETE FROM "incomes" WHERE foreign_id=$1 AND "IncomesType" ILIKE 'Case Installment%' AND "Description"=$2`,
    [String(installmentId), CASE_INSTALLMENT_SYNC_DESCRIPTION],
  );
  revalidateFinanceCache();
}

export async function deleteAppointmentIncome(appointmentId: number) {
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) return;

  await getDb().query(
    `DELETE FROM "incomes" WHERE foreign_id=$1 AND "IncomesType" ILIKE 'Appointment%' AND "Description"=$2`,
    [String(appointmentId), APPOINTMENT_SYNC_DESCRIPTION],
  );
  revalidateFinanceCache();
}

export async function deleteCaseAutoIncome(caseId: number) {
  if (!Number.isFinite(caseId) || caseId <= 0) return;

  await getDb().query(
    `
      DELETE FROM "incomes" i
      USING "case_installments" ci
      WHERE ci.client_case_id=$1
        AND i.foreign_id=ci.id::text
        AND i."IncomesType" ILIKE 'Case Installment%'
        AND i."Description"=$2
    `,
    [caseId, CASE_INSTALLMENT_SYNC_DESCRIPTION],
  );
  revalidateFinanceCache();
}

function isAppointmentInstallment(value: unknown) {
  return String(value ?? "").trim().toLowerCase().startsWith("appointment");
}
