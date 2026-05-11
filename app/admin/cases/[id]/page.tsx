import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MapPin, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { checkboxValue, dateTimeValue, dateValue, employeeOptions, localDateTime, money, nullableText, numberValue, syncCaseTotals, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function CaseWorkspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
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

  const isEdit = sp.mode === "edit" && canEdit;
  const paid = Number(caseRow.total_paid || 0);
  const total = Number(caseRow.total || 0);
  const formId = `case-update-${caseRow.id}`;
  const assignedTo = [caseRow.employee_firstname, caseRow.employee_lastname].filter(Boolean).join(" ") || "-";
  const clientName = caseRow.client_name || `${caseRow.firstname} ${caseRow.lastname}`.trim();

  return <>
    <form id={formId} action={updateCase} />

    <section className="profileHero">
      <img className="profilePhoto" src="/avatar.svg" alt="" />
      <div>
        <div className="profileTitle">
          <h1>{caseRow.client_name || `${caseRow.firstname} ${caseRow.lastname}`}</h1>
          <span><MapPin size={22}/>{caseRow.province || caseRow.city || caseRow.country || "-"}</span>
        </div>
        <div className="detailGrid">
          <strong>Client Information</strong><span />
          <span>Reference ID</span><span>{caseRow.ref_id || "-"}</span>
          <span>CNIC</span><span>{caseRow.cnic || "-"}</span>
          <span>Phone</span><span>{caseRow.phone || "-"}</span>
          <span>Email</span><span>{caseRow.email || "-"}</span>
          {!isEdit ? <><span>Gender</span><span>{caseRow.gender || "-"}</span></> : null}
          <span>Address</span><span>{[caseRow.address, caseRow.city, caseRow.province, caseRow.country].filter(Boolean).join(", ") || "-"}</span>
        </div>
        <div className="profileActions">
          <Link className="btn btnYellow" href={isEdit ? `/admin/cases/${caseId}` : `/admin/cases/${caseId}?mode=edit`}>{isEdit ? "View Case" : "Edit Case"}</Link>
          <Link className="btn" href="/admin/cases">Back</Link>
          {canDelete ? <form action={deleteCase}><button className="btn dangerButton">Delete Case</button></form> : null}
        </div>
      </div>
    </section>

    <section className="caseLegacySection">
      <h2>{isEdit ? "Edit Case" : "View Case"}</h2>

      {showFinance ? <div className="casePaymentPanel">
        <div>
          <h3>Payment Details</h3>
          {isEdit ? <div className="paymentFormGrid">
            <Field formId={formId} name="total" label="Total Amount *" type="number" defaultValue={caseRow.total} required />
            <Field formId={formId} name="appointment_fee" label="Paid Appointment Fee" type="number" defaultValue={caseRow.appointment_fee} readOnly />
            <Field name="total_paid_display" label="Total Paid Installments" type="number" defaultValue={paid} readOnly />
            <Field name="remaining_display" label="Remaining Dues" type="number" defaultValue={caseRow.remaining} readOnly />
            <Field formId={formId} name="advance" label="Advance Amount *" type="number" defaultValue={caseRow.advance} required />
          </div> : <div className="paymentReadGrid">
            <span>Total Amount</span><strong>{plainMoney(total)}</strong>
            <span>Paid Appointment Fee</span><strong>{plainMoney(caseRow.appointment_fee)}</strong>
            <span>Total Paid Installments</span><strong>{plainMoney(paid)}</strong>
            <span>Remaining Amount</span><strong>{plainMoney(caseRow.remaining)}</strong>
            <span>Advance Amount</span><strong>{plainMoney(caseRow.advance)}</strong>
          </div>}
        </div>

        <div>
          <h3>Installment Details</h3>
          <table className="table dataTable installmentMiniTable">
            <thead><tr><th>Date & Time</th><th>Installment Name</th><th>Amount</th>{isEdit && canDelete ? <th>Action</th> : null}</tr></thead>
            <tbody>{installments.length ? installments.map((item) => <tr key={item.id}>
              <td><strong>{dateTimeInput(item.time).replace("T", " ")}</strong></td>
              <td>{item.name}</td>
              <td>{plainMoney(item.amount)}</td>
              {isEdit && canDelete ? <td><form action={deleteInstallment}><input type="hidden" name="installment_id" value={item.id}/><button className="actionBtn delete" aria-label="Delete installment"><Trash2 size={16}/></button></form></td> : null}
            </tr>) : <tr><td colSpan={isEdit && canDelete ? 4 : 3}>No installments added.</td></tr>}</tbody>
          </table>
          {isEdit ? <form action={addInstallment} className="installmentAddForm">
            <input className="input" name="name" placeholder="Installment name" required />
            <input className="input" name="amount" type="number" step="0.01" placeholder="Amount" required />
            <input className="input" name="time" type="datetime-local" defaultValue={localDateTime()} required />
            <button className="btn btnPrimary">Add Installment</button>
          </form> : null}
        </div>
      </div> : null}

      {isEdit ? <>
        <input form={formId} type="hidden" name="client_name" value={clientName} />
        <input form={formId} type="hidden" name="appointmentdate" value={dateTimeInput(caseRow.appointmentdate) || localDateTime()} />
        {!showFinance ? <>
          <input form={formId} type="hidden" name="total" value={caseRow.total || 0} />
          <input form={formId} type="hidden" name="advance" value={caseRow.advance || 0} />
          <input form={formId} type="hidden" name="appointment_fee" value={caseRow.appointment_fee || 0} />
          <input form={formId} type="hidden" name="appointmentstatus" value={caseRow.appointmentstatus || "Unpaid"} />
        </> : null}
        <div className="legacyCaseFormGrid">
          <Field name="email_display" label="Email *" type="email" defaultValue={caseRow.email} readOnly />
          <Field formId={formId} name="caseCategory" label="Case Category *" defaultValue={caseRow.caseCategory} required />
          <Select formId={formId} name="status" label="Case Status *" value={caseRow.status || "In Progress"} options={["Open", "In Progress", "In Process", "Pending", "Completed", "Closed"]} />
          <Field formId={formId} name="startDate" label="Start Date *" type="date" defaultValue={dateInput(caseRow.startDate)} required />
          <Field formId={formId} name="endDate" label="End Date" type="date" defaultValue={dateInput(caseRow.endDate)} />
          <Field formId={formId} name="submitted_on" label="Submitted on" type="date" defaultValue={dateInput(caseRow.submitted_on)} />
          <Field formId={formId} name="travel_dates" label="Travel Dates" defaultValue={caseRow.travel_dates} />
          <EmployeeSelect formId={formId} employees={employees} value={caseRow.employee_id} />
          <Field formId={formId} name="description" label="Description" defaultValue={caseRow.description} wide />
          <Select formId={formId} name="appointment_category" label="Appointment Type" value={caseRow.appointment_category || "visit"} options={[{ value: "online", label: "Online" }, { value: "visit", label: "Physical / Visit" }]} />
          {showFinance ? <Select formId={formId} name="appointmentstatus" label="Appointment Payment" value={caseRow.appointmentstatus || "Unpaid"} options={["Paid", "Unpaid"]} /> : null}
        </div>
        <div className="legacyCheckGrid">
          {["email_gen", "travel_history", "previous_refusal", "vfa", "dfa", "personal_documents", "job_documents", "business_documents"].map((item) => (
            <label key={item}><input form={formId} type="checkbox" name={item} defaultChecked={Boolean(Number(caseRow[item] || 0))} /> {labelFromKey(item)}</label>
          ))}
        </div>
        <div className="documentsBlock">
          <label>Documents</label>
          <div><label><input form={formId} type="radio" name="docs" value="Pending" defaultChecked={String(caseRow.docs || "Pending") === "Pending"} /> Pending</label> <label><input form={formId} type="radio" name="docs" value="Completed" defaultChecked={String(caseRow.docs || "") === "Completed"} /> Completed</label></div>
          <label>Documents Note</label>
          <input form={formId} className="input" name="documents_note" defaultValue={stringValue(caseRow.documents_note)} />
          <label>Attach New Documents</label>
          <input className="fileInput" type="file" multiple />
          <div className="fakeProgress"><span>0%</span></div>
        </div>
        <button form={formId} className="btn btnPrimary">Update</button>
      </> : <>
        <div className="caseFactsGrid">
          <div><span>Category</span><strong>{caseRow.caseCategory || "-"}</strong></div>
          <div><span>start Date</span><strong>{dateInput(caseRow.startDate) || "-"}</strong></div>
          <div><span>End Date</span><strong>{dateInput(caseRow.endDate) || "-"}</strong></div>
          <div><span>Submitted on</span><strong>{dateInput(caseRow.submitted_on) || "-"}</strong></div>
          <div><span>Assigned To</span><strong>{assignedTo}</strong></div>
          <div><span>Travel Dates</span><strong>{caseRow.travel_dates || "-"}</strong></div>
          <div><span>Description</span><strong>{caseRow.description || "-"}</strong></div>
          <div><span>Case Status</span><strong>{formatStatus(caseRow.status)}</strong></div>
          <div><span>Documents Note</span><strong>{caseRow.documents_note || "-"}</strong></div>
        </div>
        <table className="table dataTable statusMatrix">
          <thead><tr>{["Email Generated", "Travel History", "Previous Refusal", "VFA", "DFA", "Documents", "Personal Documents", "Job Documents", "Business Documents"].map((label) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody><tr>
            <td>{yesNo(caseRow.email_gen)}</td>
            <td>{yesNo(caseRow.travel_history)}</td>
            <td>{yesNo(caseRow.previous_refusal)}</td>
            <td>{yesNo(caseRow.vfa)}</td>
            <td>{yesNo(caseRow.dfa)}</td>
            <td>{caseRow.docs || "Pending"}</td>
            <td>{yesNo(caseRow.personal_documents)}</td>
            <td>{yesNo(caseRow.job_documents)}</td>
            <td>{yesNo(caseRow.business_documents)}</td>
          </tr></tbody>
        </table>
        <h3 className="attachmentsTitle">Attachments</h3>
        <div className="familyHeader"><h3>Family Details</h3><button className="btn btnPrimary" type="button">Add Member</button></div>
        <div className="panel tableWrap familyPanel"><table className="table dataTable"><thead><tr><th>Photo</th><th>Full Name</th><th>Phone</th><th>Relation</th><th>Destination Country</th><th>Action</th><th>Make Client</th></tr></thead><tbody /></table></div>
      </>}
    </section>
  </>;
}

async function getCase(caseId: number) {
  const result = await getDb().query(
    `
      SELECT
        cc.*,
        c.ref_id, c.firstname, c.lastname, c.email, c.phone, c.phone2, c.cnic, c.gender, c.city, c.province, c.country,
        c.address, c.destination_country, c.visa_category, c.passport_no, c.passport_issue, c.passport_expiry, c.documents,
        a.fee AS appointment_fee, a.appointmentstatus, a.category AS appointment_category, a.appointmentdate,
        e.firstname AS employee_firstname, e.lastname AS employee_lastname
      FROM "client_cases" cc
      JOIN "clients" c ON c.id = cc.client_id
      LEFT JOIN "appointments" a ON a.id = cc.appointment_id
      LEFT JOIN "employees" e ON e.id = cc.employee_id
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

function Field({ name, label, type = "text", defaultValue, disabled, required, wide, readOnly, formId }: { name: string; label: string; type?: string; defaultValue?: unknown; disabled?: boolean; required?: boolean; wide?: boolean; readOnly?: boolean; formId?: string }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input form={formId} className="input" name={name} type={type} defaultValue={stringValue(defaultValue)} disabled={disabled} required={required} readOnly={readOnly} step={type === "number" ? "0.01" : undefined} /></div>;
}

function Textarea({ name, label, defaultValue, disabled, formId }: { name: string; label: string; defaultValue?: unknown; disabled?: boolean; formId?: string }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea form={formId} className="input" name={name} rows={4} defaultValue={stringValue(defaultValue)} disabled={disabled} /></div>;
}

function EmployeeSelect({ employees, value, disabled, formId }: { employees: Awaited<ReturnType<typeof employeeOptions>>; value?: unknown; disabled?: boolean; formId?: string }) {
  return <div><label className="label">Assigned to *</label><select form={formId} className="input" name="employee_id" defaultValue={String(value ?? "")} disabled={disabled} required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label} {employee.detail ? `- ${employee.detail}` : ""}</option>)}</select></div>;
}

function Select({ name, label, value, options, disabled, formId }: { name: string; label: string; value?: string; options: Array<string | { value: string; label: string }>; disabled?: boolean; formId?: string }) {
  return <div><label className="label">{label}</label><select form={formId} className="input" name={name} defaultValue={value} disabled={disabled}>{options.map((option) => {
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

function plainMoney(value: unknown) {
  return money(value).replace("PKR", "").trim();
}

function yesNo(value: unknown) {
  return Number(value || 0) ? "YES" : "NO";
}

function labelFromKey(value: string) {
  const labels: Record<string, string> = {
    email_gen: "Email Generated",
    travel_history: "Travel History",
    previous_refusal: "Previous Refusal",
    vfa: "Visa Form Application",
    dfa: "Draft Form Approval",
    personal_documents: "Personal Documents",
    job_documents: "Job Documents",
    business_documents: "Business Documents",
  };
  return labels[value] || value.replace(/_/g, " ");
}

function formatStatus(value: unknown) {
  const status = String(value || "In Progress").trim();
  return status === "In Process" ? "In Progress" : status;
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
