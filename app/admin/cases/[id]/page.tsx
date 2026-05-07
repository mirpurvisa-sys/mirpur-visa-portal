import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { checkboxValue, dateTimeValue, dateValue, employeeOptions, localDateTime, money, nullableText, numberValue, syncCaseTotals, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isFinite(caseId)) notFound();

  const user = await requireUser();
  const resource = getResource("cases");
  if (!canViewResource(user, "cases")) return <AccessDenied />;
  const canEdit = resource ? canEditResource(user, resource) : false;
  const canDelete = resource ? canDeleteResource(user, resource) : false;
  const showFinance = canViewFinance(user);

  const [caseRow, installments, employees] = await Promise.all([
    getCase(caseId),
    showFinance ? getInstallments(caseId) : Promise.resolve([]),
    employeeOptions(),
  ]);
  if (!caseRow) notFound();

  async function updateClient(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to edit this client.");

    await getDb().query(
      `
        UPDATE "clients"
        SET firstname=$1, lastname=$2, email=$3, phone=$4, phone2=$5, cnic=$6, gender=$7,
            city=$8, province=$9, country=$10, address=$11, destination_country=$12,
            visa_category=$13, passport_no=$14, passport_issue=$15, passport_expiry=$16,
            documents=$17, updated_at=NOW()
        WHERE id=$18
      `,
      [
        text(formData, "firstname"),
        text(formData, "lastname"),
        nullableText(formData, "email"),
        text(formData, "phone"),
        nullableText(formData, "phone2"),
        nullableText(formData, "cnic"),
        text(formData, "gender", "Male"),
        nullableText(formData, "city"),
        nullableText(formData, "province"),
        nullableText(formData, "country"),
        text(formData, "address", "Not provided"),
        nullableText(formData, "destination_country"),
        nullableText(formData, "visa_category"),
        nullableText(formData, "passport_no"),
        nullableText(formData, "passport_issue"),
        nullableText(formData, "passport_expiry"),
        nullableText(formData, "documents"),
        Number(formData.get("client_id")),
      ],
    );

    redirect(`/admin/cases/${caseId}`);
  }

  async function updateCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to edit this case.");
    const currentCanViewFinance = canViewFinance(currentUser);
    const db = getDb();
    const existing = await db.query(
      `
        SELECT cc.appointment_id, cc.total, cc.advance, a.fee AS appointment_fee, a.appointmentstatus
        FROM "client_cases" cc
        LEFT JOIN "appointments" a ON a.id = cc.appointment_id
        WHERE cc.id=$1
        LIMIT 1
      `,
      [caseId],
    );
    const existingRow = existing.rows[0] || {};
    const totalValue = currentCanViewFinance ? numberValue(formData, "total") : Number(existingRow.total || 0);
    const advanceValue = currentCanViewFinance ? numberValue(formData, "advance") : Number(existingRow.advance || 0);
    const appointmentFee = currentCanViewFinance ? numberValue(formData, "appointment_fee") : Number(existingRow.appointment_fee || 0);
    const appointmentStatus = currentCanViewFinance ? text(formData, "appointmentstatus", "Unpaid") : textFromValue(existingRow.appointmentstatus, "Unpaid");
    const appointmentId = Number(existingRow.appointment_id || 0);

    await db.query(
      `
        UPDATE "client_cases"
        SET employee_id=$1, client_name=$2, total=$3, advance=$4, "caseCategory"=$5,
            "startDate"=$6, "endDate"=$7, submitted_on=$8, travel_dates=$9, docs=$10,
            email_gen=$11, travel_history=$12, previous_refusal=$13, vfa=$14, dfa=$15,
            personal_documents=$16, job_documents=$17, business_documents=$18,
            documents_note=$19, status=$20, description=$21, updated_at=NOW()
        WHERE id=$22
      `,
      [
        numberValue(formData, "employee_id"),
        text(formData, "client_name"),
        totalValue,
        advanceValue,
        text(formData, "caseCategory"),
        dateValue(formData, "startDate"),
        nullableText(formData, "endDate"),
        nullableText(formData, "submitted_on"),
        nullableText(formData, "travel_dates"),
        nullableText(formData, "docs"),
        checkboxValue(formData, "email_gen"),
        checkboxValue(formData, "travel_history"),
        checkboxValue(formData, "previous_refusal"),
        checkboxValue(formData, "vfa"),
        checkboxValue(formData, "dfa"),
        checkboxValue(formData, "personal_documents"),
        checkboxValue(formData, "job_documents"),
        checkboxValue(formData, "business_documents"),
        nullableText(formData, "documents_note"),
        text(formData, "status", "Open"),
        nullableText(formData, "description"),
        caseId,
      ],
    );

    await db.query(
      `UPDATE "appointments" SET appointmentstatus=$1, category=$2, appointmentdate=$3, fee=$4, updated_at=NOW() WHERE id=$5`,
      [
        appointmentStatus,
        text(formData, "appointment_category", "visit"),
        dateTimeValue(formData, "appointmentdate"),
        appointmentFee,
        appointmentId,
      ],
    );

    await syncCaseTotals(caseId);
    redirect(`/admin/cases/${caseId}`);
  }

  async function addInstallment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("case-installments");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to add installments.");

    await getDb().query(
      `INSERT INTO "case_installments" (client_case_id, name, amount, time, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [caseId, text(formData, "name", "Installment"), String(numberValue(formData, "amount")), dateTimeValue(formData, "time")],
    );
    await syncCaseTotals(caseId);
    redirect(`/admin/cases/${caseId}`);
  }

  async function deleteInstallment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("case-installments");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete installments.");

    await getDb().query(`DELETE FROM "case_installments" WHERE id=$1 AND client_case_id=$2`, [Number(formData.get("installment_id")), caseId]);
    await syncCaseTotals(caseId);
    redirect(`/admin/cases/${caseId}`);
  }

  async function deleteCase() {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete cases.");
    await getDb().query(`DELETE FROM "client_cases" WHERE id=$1`, [caseId]);
    redirect("/admin/cases");
  }

  const paid = Number(caseRow.total_paid || 0);
  const total = Number(caseRow.total || 0);

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Case workspace</div>
        <h1>Case #{caseRow.id}</h1>
        <p>{caseRow.client_name || `${caseRow.firstname} ${caseRow.lastname}`} - {caseRow.caseCategory || "General"} - {caseRow.status || "Open"}</p>
      </div>
      <div className="headerActions">
        <Link className="btn" href="/admin/cases">Back</Link>
        {canDelete ? <form action={deleteCase}><button className="btn dangerButton">Delete Case</button></form> : null}
      </div>
    </div>

    {showFinance ? <div className="metricGrid">
      <Metric label="Total" value={money(total)} />
      <Metric label="Paid" value={money(paid)} />
      <Metric label="Remaining" value={money(caseRow.remaining)} tone="warn" />
      <Metric label="Installments" value={installments.length.toLocaleString()} />
    </div> : <div className="metricGrid">
      <Metric label="Status" value={String(caseRow.status || "Open")} />
      <Metric label="Category" value={String(caseRow.caseCategory || "General")} />
      <Metric label="Start Date" value={dateInput(caseRow.startDate) || "-"} />
    </div>}

    <div className="workspaceGrid">
      <form action={updateClient} className="panel formSection">
        <h2>Client Profile</h2>
        <input type="hidden" name="client_id" value={caseRow.client_id} />
        <div className="formGrid">
          <Field name="firstname" label="First name" defaultValue={caseRow.firstname} disabled={!canEdit} required />
          <Field name="lastname" label="Last name" defaultValue={caseRow.lastname} disabled={!canEdit} required />
          <Field name="email" label="Email" type="email" defaultValue={caseRow.email} disabled={!canEdit} />
          <Field name="phone" label="Phone" defaultValue={caseRow.phone} disabled={!canEdit} required />
          <Field name="phone2" label="Second phone" defaultValue={caseRow.phone2} disabled={!canEdit} />
          <Field name="cnic" label="CNIC" defaultValue={caseRow.cnic} disabled={!canEdit} />
          <Field name="gender" label="Gender" defaultValue={caseRow.gender} disabled={!canEdit} required />
          <Field name="city" label="City" defaultValue={caseRow.city} disabled={!canEdit} />
          <Field name="province" label="Province" defaultValue={caseRow.province} disabled={!canEdit} />
          <Field name="country" label="Country" defaultValue={caseRow.country} disabled={!canEdit} />
          <Field name="destination_country" label="Destination" defaultValue={caseRow.destination_country} disabled={!canEdit} />
          <Field name="visa_category" label="Visa category" defaultValue={caseRow.visa_category} disabled={!canEdit} />
          <Field name="passport_no" label="Passport no" defaultValue={caseRow.passport_no} disabled={!canEdit} />
          <Field name="passport_issue" label="Passport issue" type="date" defaultValue={dateInput(caseRow.passport_issue)} disabled={!canEdit} />
          <Field name="passport_expiry" label="Passport expiry" type="date" defaultValue={dateInput(caseRow.passport_expiry)} disabled={!canEdit} />
          <Field name="documents" label="Documents" defaultValue={caseRow.documents} disabled={!canEdit} />
          <Field name="address" label="Address" defaultValue={caseRow.address} disabled={!canEdit} wide required />
        </div>
        {canEdit ? <button className="btn btnPrimary">Save Client</button> : null}
      </form>

      <form action={updateCase} className="panel formSection">
        <h2>Case & Assignment</h2>
        <input type="hidden" name="appointment_id" value={caseRow.appointment_id} />
        <div className="formGrid">
          <Field name="client_name" label="Display client name" defaultValue={caseRow.client_name} disabled={!canEdit} />
          <EmployeeSelect employees={employees} value={caseRow.employee_id} disabled={!canEdit} />
          <Field name="caseCategory" label="Case category" defaultValue={caseRow.caseCategory} disabled={!canEdit} required />
          <Select name="status" label="Status" value={caseRow.status || "Open"} disabled={!canEdit} options={["Open", "In Process", "Pending", "Completed", "Closed"]} />
          {showFinance ? <>
            <Field name="total" label="Total amount" type="number" defaultValue={caseRow.total} disabled={!canEdit} required />
            <Field name="advance" label="Advance" type="number" defaultValue={caseRow.advance} disabled={!canEdit} required />
          </> : null}
          <Field name="startDate" label="Start date" type="date" defaultValue={dateInput(caseRow.startDate)} disabled={!canEdit} required />
          <Field name="endDate" label="End date" type="date" defaultValue={dateInput(caseRow.endDate)} disabled={!canEdit} />
          <Field name="submitted_on" label="Submitted on" type="date" defaultValue={dateInput(caseRow.submitted_on)} disabled={!canEdit} />
          <Field name="travel_dates" label="Travel dates" defaultValue={caseRow.travel_dates} disabled={!canEdit} />
          <Field name="docs" label="Docs status" defaultValue={caseRow.docs} disabled={!canEdit} />
          {showFinance ? <Field name="appointment_fee" label="Appointment fee" type="number" defaultValue={caseRow.appointment_fee} disabled={!canEdit} /> : null}
          <Select name="appointment_category" label="Appointment type" value={caseRow.appointment_category || "visit"} disabled={!canEdit} options={[{ value: "online", label: "Online" }, { value: "visit", label: "Physical / Visit" }]} />
          {showFinance ? <Select name="appointmentstatus" label="Payment status" value={caseRow.appointmentstatus || "Unpaid"} disabled={!canEdit} options={["Paid", "Unpaid"]} /> : null}
          <Field name="appointmentdate" label="Appointment date" type="datetime-local" defaultValue={dateTimeInput(caseRow.appointmentdate)} disabled={!canEdit} required />
          <Field name="documents_note" label="Document notes" defaultValue={caseRow.documents_note} disabled={!canEdit} wide />
          <Textarea name="description" label="Description" defaultValue={caseRow.description} disabled={!canEdit} />
        </div>
        <div className="checkGrid">
          {["email_gen", "travel_history", "previous_refusal", "vfa", "dfa", "personal_documents", "job_documents", "business_documents"].map((item) => (
            <label key={item}><input type="checkbox" name={item} defaultChecked={Boolean(Number(caseRow[item] || 0))} disabled={!canEdit} /> {item.replace(/_/g, " ")}</label>
          ))}
        </div>
        {canEdit ? <button className="btn btnPrimary">Save Case</button> : null}
      </form>
    </div>

    {showFinance ? <section className="panel formSection">
      <div className="sectionHeader"><h2>Installments</h2><span className="badge">{money(paid)} received</span></div>
      {canEdit ? <form action={addInstallment} className="inlineForm">
        <input className="input" name="name" placeholder="Installment name" required />
        <input className="input" name="amount" type="number" step="0.01" placeholder="Amount" required />
        <input className="input" name="time" type="datetime-local" defaultValue={localDateTime()} required />
        <button className="btn btnPrimary">Add Installment</button>
      </form> : null}

      <div className="tableWrap">
        <table className="table dataTable">
          <thead><tr><th>Name</th><th>Amount</th><th>Time</th>{canDelete ? <th className="actionColumn">Action</th> : null}</tr></thead>
          <tbody>{installments.map((item) => <tr key={item.id}>
            <td>{item.name}</td>
            <td>{money(item.amount)}</td>
            <td>{dateTimeInput(item.time).replace("T", " ")}</td>
            {canDelete ? <td className="actionColumn"><form action={deleteInstallment}><input type="hidden" name="installment_id" value={item.id}/><button className="iconDanger" aria-label="Delete installment"><Trash2 size={16}/></button></form></td> : null}
          </tr>)}</tbody>
        </table>
      </div>
    </section> : null}
  </>;
}

async function getCase(caseId: number) {
  const result = await getDb().query(
    `
      SELECT
        cc.*,
        c.firstname, c.lastname, c.email, c.phone, c.phone2, c.cnic, c.gender, c.city, c.province, c.country,
        c.address, c.destination_country, c.visa_category, c.passport_no, c.passport_issue, c.passport_expiry, c.documents,
        a.fee AS appointment_fee, a.appointmentstatus, a.category AS appointment_category, a.appointmentdate
      FROM "client_cases" cc
      JOIN "clients" c ON c.id = cc.client_id
      LEFT JOIN "appointments" a ON a.id = cc.appointment_id
      WHERE cc.id = $1
      LIMIT 1
    `,
    [caseId],
  );
  return result.rows[0] ?? null;
}

async function getInstallments(caseId: number) {
  const result = await getDb().query(`SELECT id, name, amount, time FROM "case_installments" WHERE client_case_id=$1 ORDER BY time DESC, id DESC`, [caseId]);
  return result.rows;
}

function Field({ name, label, type = "text", defaultValue, disabled, required, wide }: { name: string; label: string; type?: string; defaultValue?: unknown; disabled?: boolean; required?: boolean; wide?: boolean }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input className="input" name={name} type={type} defaultValue={stringValue(defaultValue)} disabled={disabled} required={required} step={type === "number" ? "0.01" : undefined} /></div>;
}

function Textarea({ name, label, defaultValue, disabled }: { name: string; label: string; defaultValue?: unknown; disabled?: boolean }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4} defaultValue={stringValue(defaultValue)} disabled={disabled} /></div>;
}

function EmployeeSelect({ employees, value, disabled }: { employees: Awaited<ReturnType<typeof employeeOptions>>; value?: unknown; disabled?: boolean }) {
  return <div><label className="label">Assigned employee</label><select className="input" name="employee_id" defaultValue={String(value ?? "")} disabled={disabled} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label} {employee.detail ? `- ${employee.detail}` : ""}</option>)}</select></div>;
}

function Select({ name, label, value, options, disabled }: { name: string; label: string; value?: string; options: Array<string | { value: string; label: string }>; disabled?: boolean }) {
  return <div><label className="label">{label}</label><select className="input" name={name} defaultValue={value} disabled={disabled}>{options.map((option) => {
    const optionValue = typeof option === "string" ? option : option.value;
    const optionLabel = typeof option === "string" ? option : option.label;
    return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
  })}</select></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return <div className={`metricCard ${tone === "warn" ? "metricWarn" : ""}`}><div className="metricTop"><span>{label}</span></div><strong>{value}</strong></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Case Workspace</h1><p className="muted">You do not have permission to access this case.</p></div>;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function dateInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dateTimeInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  return String(value).replace(" ", "T").slice(0, 16);
}
