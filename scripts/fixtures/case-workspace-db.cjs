// Loaded only by the local production regression test. No external database is used.
if (process.env.CASE_WORKSPACE_TEST_DB !== "1") throw new Error("Test database preload requires explicit opt-in.");
const Module = require("node:module");
const originalLoad = Module._load;
const cases = new Map([1705, 1706].map((id, index) => [id, {
  id, client_id: id + 100, appointment_id: id + 200, employee_id: 100 + index,
  client_name: "Fixture Client", firstname: "Fixture", lastname: "Client",
  email: "fixture@example.invalid", phone: "0000000000", address: "Fixture address",
  total: 5000, advance: 1000, remaining: 5000, total_paid: 0,
  caseCategory: "Visit", startDate: "2026-10-17", status: "Open", description: "Original description",
  appointment_fee: 0, appointmentstatus: "Unpaid", appointment_category: "visit",
  appointmentdate: "2026-10-17 10:00", employee_firstname: "Fixture", employee_lastname: "Employee",
}]));
const rows = (...items) => ({ rows: items });
const owner = row => row.employee_id === 100 ? 9 : 11;
class Pool {
  async query(source, values = []) {
    const sql = source.replace(/\s+/g, " ").trim();
    if (sql.includes('FROM "users" u')) {
      const id = Number(values[0]);
      const role = { 1: "admin", 9: "accountant", 11: "case_officer" }[id];
      return role ? rows({ id, firstname: "Fixture", lastname: role, email: "fixture@example.invalid", user_type: role,
        role_slugs: [role], permission_slugs: [] }) : rows();
    }
    if (sql.includes("SELECT cc.*")) return rows({ ...cases.get(Number(values[0])) });
    if (sql.includes('FROM "case_installments"') && sql.startsWith("SELECT")) return rows();
    if (sql.includes('FROM "documents"')) return rows();
    if (sql.includes('FROM "employees"') && sql.includes("designation")) {
      return rows({ id: 100, firstname: "Fixture", lastname: "Accountant", designation: "Accountant" },
        { id: 101, firstname: "Fixture", lastname: "Officer", designation: "Case Officer" });
    }
    if (sql.startsWith("SELECT user_id FROM employees")) return rows({ user_id: Number(values[0]) === 100 ? 9 : 11 });
    if (sql.startsWith("SELECT cc.client_id")) {
      const row = cases.get(Number(values[0]));
      return row ? rows({ client_id: row.client_id, employee_id: row.employee_id, user_id: owner(row) }) : rows();
    }
    if (sql.startsWith("SELECT cc.appointment_id")) {
      const row = cases.get(Number(values[0]));
      return rows({ appointment_id: row.appointment_id, total: row.total, advance: row.advance,
        appointment_fee: row.appointment_fee, appointmentstatus: row.appointmentstatus });
    }
    if (sql.startsWith('WITH changed AS (UPDATE "client_cases"')) {
      const row = cases.get(Number(values[21]));
      if (!row || (!values[23] && owner(row) !== Number(values[22]))) return rows();
      const fields = ["employee_id", "client_name", "total", "advance", "caseCategory", "startDate", "endDate",
        "submitted_on", "travel_dates", "docs", "email_gen", "travel_history", "previous_refusal", "vfa", "dfa",
        "personal_documents", "job_documents", "business_documents", "documents_note", "status", "description"];
      fields.forEach((key, index) => { if (index !== 0 || values[23]) row[key] = values[index]; });
      Object.assign(row, { appointmentstatus: values[24], appointment_category: values[25],
        appointmentdate: values[26], appointment_fee: values[27] });
      return rows({ id: row.id });
    }
    if (sql.startsWith('UPDATE "clients"')) {
      const row = cases.get(Number(values[18]));
      if (!row || (!values[20] && owner(row) !== Number(values[19]))) return rows();
      ["firstname", "lastname", "email", "phone", "phone2", "cnic", "gender", "city", "province", "country",
        "address", "destination_country", "visa_category", "passport_no", "passport_issue", "passport_expiry", "documents"]
        .forEach((key, index) => { row[key] = values[index]; });
      return rows();
    }
    if (sql.startsWith("WITH case_row AS")) return rows(); // Balance recalculation.
    if (sql.includes('FROM "appointments" a')) return rows(); // No received appointment payment.
    if (sql.startsWith('INSERT INTO "activity_log"')) return rows();
    throw new Error("Unexpected fixture query: " + sql.slice(0, 160));
  }
}
Module._load = function (name, parent, isMain) {
  if (name === "pg" || /^pg-[a-f0-9]+$/.test(name)) return { Pool, types: { setTypeParser() {} } };
  return originalLoad.call(this, name, parent, isMain);
};
