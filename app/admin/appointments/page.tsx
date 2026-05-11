import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { canCreateResource, canDeleteResource, canEditResource, canManageAppointmentPayments, canViewFinance, canViewResource } from "@/lib/permissions";
import { dateTimeValue, dateValue, employeeOptions, localDateTime, nullableText, numberValue, syncCaseTotals, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

type AppointmentSearchParams = {
  q?: string;
  new?: string;
  start_case?: string;
};

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<AppointmentSearchParams> }) {
  const user = await requireUser();
  const resource = getResource("appointments");
  if (!resource || !canViewResource(user, "appointments")) return <AccessDenied />;

  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const casesResource = getResource("cases");
  const canStartCase = casesResource ? canCreateResource(user, casesResource) : false;
  const canEditAppointmentPayments = canManageAppointmentPayments(user);
  const showFinance = canViewFinance(user);
  const params = await searchParams;
  const query = textFromValue(params.q, "");
  const startCaseId = Number(params.start_case || 0);

  const [appointments, employees, startCaseAppointment] = await Promise.all([
    getAppointments(query),
    employeeOptions(),
    startCaseId > 0 ? getAppointmentCaseSeed(startCaseId) : Promise.resolve(null),
  ]);

  if (startCaseAppointment?.case_id) redirect(`/admin/cases/${startCaseAppointment.case_id}`);

  async function createAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create appointments.");

    const currentCanEditAppointmentPayments = canManageAppointmentPayments(currentUser);
    const db = getDb();
    const now = new Date();
    const client = await db.query(
      `
        INSERT INTO "clients" (
          ref_id, firstname, lastname, email, epassword, phone, phone2, cnic, cnic_issue,
          cnic_expiry, gender, avatar, city, province, country, address, destination_country,
          visa_category, passport_no, passport_issue, passport_expiry, documents, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
        RETURNING id
      `,
      [
        nullableText(formData, "ref_id"),
        text(formData, "firstname"),
        text(formData, "lastname"),
        nullableText(formData, "email"),
        nullableText(formData, "epassword"),
        text(formData, "phone"),
        nullableText(formData, "phone2"),
        nullableText(formData, "cnic"),
        nullableText(formData, "cnic_issue"),
        nullableText(formData, "cnic_expiry"),
        text(formData, "gender", "Male"),
        text(formData, "avatar", "user.jpg"),
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
        now,
      ],
    );

    await db.query(
      `INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [
        Number(client.rows[0].id),
        currentCanEditAppointmentPayments ? numberValue(formData, "fee") : 0,
        currentCanEditAppointmentPayments ? text(formData, "appointmentstatus", "Unpaid") : "Unpaid",
        text(formData, "category", "visit"),
        dateTimeValue(formData, "appointmentdate"),
        now,
      ],
    );

    redirect("/admin/appointments");
  }

  async function updateAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to update appointments.");

    const db = getDb();
    const appointmentId = numberValue(formData, "id");
    const currentCanEditAppointmentPayments = canManageAppointmentPayments(currentUser);
    const existing = currentCanEditAppointmentPayments ? null : await db.query(`SELECT fee, appointmentstatus FROM "appointments" WHERE id=$1 LIMIT 1`, [appointmentId]);
    const existingRow = existing?.rows[0] || {};

    await db.query(
      `UPDATE "appointments" SET fee=$1, appointmentstatus=$2, category=$3, appointmentdate=$4, updated_at=NOW() WHERE id=$5`,
      [
        currentCanEditAppointmentPayments ? numberValue(formData, "fee") : Number(existingRow.fee || 0),
        currentCanEditAppointmentPayments ? text(formData, "appointmentstatus") : textFromValue(existingRow.appointmentstatus, "Unpaid"),
        text(formData, "category", "visit"),
        dateTimeValue(formData, "appointmentdate"),
        appointmentId,
      ],
    );

    redirect("/admin/appointments");
  }

  async function deleteAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete appointments.");

    const appointmentId = numberValue(formData, "id");
    const linked = await getDb().query(`SELECT COUNT(*)::int AS count FROM "client_cases" WHERE appointment_id=$1`, [appointmentId]);
    if (Number(linked.rows[0]?.count || 0) > 0) throw new Error("This appointment is linked to a case. Edit the case instead of deleting the appointment.");

    await getDb().query(`DELETE FROM "appointments" WHERE id=$1`, [appointmentId]);
    redirect("/admin/appointments");
  }

  async function createCaseFromAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create cases.");

    const appointmentId = numberValue(formData, "appointment_id");
    const seed = await getAppointmentCaseSeed(appointmentId);
    if (!seed) throw new Error("Appointment was not found.");
    if (seed.case_id) redirect(`/admin/cases/${seed.case_id}`);

    const currentCanViewFinance = canViewFinance(currentUser);
    const total = currentCanViewFinance ? numberValue(formData, "total") : 0;
    const advance = currentCanViewFinance ? numberValue(formData, "advance") : 0;
    const appointmentFee = currentCanViewFinance ? numberValue(formData, "appointment_fee") : Number(seed.fee || 0);
    const totalPaid = appointmentFee + advance;
    const clientName = `${seed.firstname || ""} ${seed.lastname || ""}`.trim();
    const now = new Date();
    const db = getDb();

    const caseResult = await db.query(
      `
        INSERT INTO "client_cases" (
          client_id, appointment_id, employee_id, client_name, total, advance, remaining, total_paid,
          "caseCategory", "startDate", "endDate", submitted_on, travel_dates, docs,
          email_gen, travel_history, previous_refusal, vfa, dfa, personal_documents,
          job_documents, business_documents, documents_note, status, description, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26)
        RETURNING id
      `,
      [
        Number(seed.client_id),
        appointmentId,
        numberValue(formData, "employee_id"),
        clientName,
        total,
        advance,
        Math.max(total - totalPaid, 0),
        totalPaid,
        text(formData, "caseCategory", textFromValue(seed.category, "Consultation")),
        dateValue(formData, "startDate"),
        nullableText(formData, "endDate"),
        null,
        null,
        "Pending",
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        null,
        "In Progress",
        nullableText(formData, "description"),
        now,
      ],
    );

    const caseId = Number(caseResult.rows[0].id);
    await db.query(
      `INSERT INTO "case_installments" (client_case_id, name, amount, time, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [caseId, "Appointment Fee", String(appointmentFee), dateTimeInput(seed.appointmentdate) || localDateTime(), now],
    );

    if (advance > 0) {
      await db.query(
        `INSERT INTO "case_installments" (client_case_id, name, amount, time, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
        [caseId, "Advance Payment", String(advance), localDateTime(), now],
      );
    }

    await syncCaseTotals(caseId);
    redirect(`/admin/cases/${caseId}`);
  }

  return <>
    <div className="workflowGrid">
      <Link className="workflowCard" href="/admin/clients"><strong>Clients</strong><span>Client records</span></Link>
      <Link className="workflowCard active" href="/admin/appointments"><strong>Appointments</strong><span>Bookings</span></Link>
      <Link className="workflowCard" href="/admin/cases"><strong>Cases</strong><span>Case files</span></Link>
    </div>

    <div className="appointmentTopActions">
      {canCreate ? <Link className="btn btnPrimary" href="/admin/appointments?new=appointment">New Client &amp; Appointment</Link> : null}
    </div>

    {canCreate && params.new === "appointment" ? <AppointmentModal action={createAppointment} canEditAppointmentPayments={canEditAppointmentPayments} /> : null}
    {canStartCase && startCaseAppointment ? <StartCaseModal action={createCaseFromAppointment} appointment={startCaseAppointment} employees={employees} showFinance={showFinance} /> : null}

    <section className="panel tableWrap appointmentPanel">
      <form className="legacySearch">
        <label>Search:<input className="input" name="q" defaultValue={query} /></label>
      </form>
      <table className="table dataTable appointmentLegacyTable">
        <thead>
          <tr>
            <th>Client<br />Photo</th>
            <th>ID</th>
            <th>Client Name</th>
            <th>Phone</th>
            <th>Appointment Date<br />&amp; Time</th>
            {canEditAppointmentPayments ? <th>Fee</th> : null}
            {canEditAppointmentPayments ? <th>Status</th> : null}
            <th>Category</th>
            <th>Actions</th>
            <th>Start Case</th>
          </tr>
        </thead>
        <tbody>
          {appointments.length === 0 ? <tr><td colSpan={canEditAppointmentPayments ? 10 : 8} className="emptyState">No data available in table</td></tr> : appointments.map((item) => (
            <tr key={item.id}>
              <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
              <td>{item.id}</td>
              <td>{item.firstname} {item.lastname}</td>
              <td>{item.phone}</td>
              <td>{displayDateTime(item.appointmentdate)}</td>
              {canEditAppointmentPayments ? <td>{moneyValue(item.fee)}</td> : null}
              {canEditAppointmentPayments ? <td>{appointmentStatusLabel(item.appointmentstatus)}</td> : null}
              <td>{appointmentTypeLabel(item.category)}</td>
              <td>
                <div className="actionStack vertical">
                  <Link className="actionBtn view" href={item.case_id ? `/admin/cases/${item.case_id}` : `/admin/appointments?start_case=${item.id}`} aria-label="Open appointment">
                    <Eye size={18} />
                  </Link>
                  {canEdit ? <details className="rowDetails">
                    <summary className="actionBtn edit" aria-label="Edit appointment"><Pencil size={18} /></summary>
                    <form action={updateAppointment} className="rowEditForm">
                      <input type="hidden" name="id" value={item.id} />
                      {canEditAppointmentPayments ? <>
                        <label><span className="srOnly">Fee</span><input className="input" name="fee" type="number" step="0.01" defaultValue={item.fee} required /></label>
                        <label><span className="srOnly">Status</span><select className="input" name="appointmentstatus" defaultValue={appointmentStatusInputValue(item.appointmentstatus)}>{["Paid", "Unpaid"].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                      </> : null}
                      <label><span className="srOnly">Category</span><select className="input" name="category" defaultValue={item.category}>{appointmentTypeOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                      <label><span className="srOnly">Appointment date</span><input className="input" name="appointmentdate" type="datetime-local" defaultValue={dateTimeInput(item.appointmentdate)} required /></label>
                      <button className="btn btnPrimary">Save</button>
                    </form>
                  </details> : null}
                  {canDelete ? <form action={deleteAppointment}><input type="hidden" name="id" value={item.id} /><button className="actionBtn delete" disabled={Boolean(item.case_id)} aria-label="Delete appointment"><Trash2 size={18} /></button></form> : null}
                </div>
              </td>
              <td>
                {!item.case_id && canStartCase ? <Link className="actionBtn start" href={`/admin/appointments?start_case=${item.id}`} aria-label="Start case"><Plus size={22} /></Link> : <span className="caseStartedText">Case already started</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  </>;
}

async function getAppointments(query: string) {
  const values: unknown[] = [];
  let where = "";
  if (query) {
    values.push(`%${query}%`);
    where = `
      WHERE c.firstname ILIKE $1
         OR c.lastname ILIKE $1
         OR c.phone ILIKE $1
         OR a.category ILIKE $1
         OR a.appointmentstatus ILIKE $1
         OR CAST(a.id AS TEXT) ILIKE $1
    `;
  }

  const result = await getDb().query(
    `
      SELECT a.*, c.firstname, c.lastname, c.phone, cc.id AS case_id
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
      LEFT JOIN "client_cases" cc ON cc.appointment_id = a.id
      ${where}
      ORDER BY a.appointmentdate DESC, a.id DESC
      LIMIT 80
    `,
    values,
  );
  return result.rows;
}

async function getAppointmentCaseSeed(appointmentId: number) {
  const result = await getDb().query(
    `
      SELECT
        a.id,
        a.client_id,
        a.fee,
        a.appointmentstatus,
        a.category,
        a.appointmentdate,
        c.firstname,
        c.lastname,
        c.phone,
        cc.id AS case_id
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
      LEFT JOIN "client_cases" cc ON cc.appointment_id = a.id
      WHERE a.id = $1
      LIMIT 1
    `,
    [appointmentId],
  );
  return result.rows[0] ?? null;
}

function AppointmentModal({ action, canEditAppointmentPayments }: { action: (formData: FormData) => Promise<void>; canEditAppointmentPayments: boolean }) {
  return <div className="modalOverlay">
    <form action={action} className="mvcModal appointmentCreateModal">
      <Link className="modalClose" href="/admin/appointments" aria-label="Close">×</Link>
      <h2>New Appointment</h2>
      <div className="modalDivider" />
      <div className="modalGrid">
        <Field name="firstname" label="First Name" required />
        <Field name="lastname" label="Last Name" required />
        <Field name="phone" label="Mobile Number" required />
        <Field name="phone2" label="Phone Number" />
        <Field name="cnic" label="CNIC Number" placeholder="XXXXX-XXXXXXX-X" />
        <Field name="cnic_issue" label="CNIC Issue" type="date" />
        <Field name="cnic_expiry" label="CNIC Expiry" type="date" />
        <Field name="email" label="Email" type="email" />
        <Field name="epassword" label="Email Passwords" wide />
        <Field name="city" label="City" />
        <Field name="province" label="State/Province" />
        <Field name="country" label="Country" />
        <RadioGroup name="gender" label="Gender" options={["Male", "Female"]} defaultValue="Male" />
        <Textarea name="address" label="Address" wide />
        <Field name="passport_no" label="Passport Number" />
        <Field name="passport_issue" label="Passport Issue" type="date" />
        <Field name="passport_expiry" label="Passport Expiry" type="date" />
        <Field name="visa_category" label="Visa Category" />
        <div>
          <span className="label mutedUploadLabel">Upload Profile Picture</span>
          <div className="uploadMock">⇧<span>Drag and drop a file here<br />or click</span></div>
        </div>
        <Field name="destination_country" label="Destination Country" />
        <Select name="category" label="Appointment Category" options={appointmentTypeOptions()} defaultValue="visit" />
        <Field name="appointmentdate" label="Appointment Date & Time" type="datetime-local" defaultValue={localDateTime()} required />
        {canEditAppointmentPayments ? <>
          <Select name="appointmentstatus" label="Status" options={["Paid", "Unpaid"]} defaultValue="Unpaid" />
          <Field name="fee" label="Appointment Fee" type="number" defaultValue="0" required />
        </> : null}
      </div>
      <button className="btn btnPrimary modalSubmit">New Client &amp; Appointment</button>
    </form>
  </div>;
}

function StartCaseModal({
  action,
  appointment,
  employees,
  showFinance,
}: {
  action: (formData: FormData) => Promise<void>;
  appointment: NonNullable<Awaited<ReturnType<typeof getAppointmentCaseSeed>>>;
  employees: Awaited<ReturnType<typeof employeeOptions>>;
  showFinance: boolean;
}) {
  const clientName = `${appointment.firstname || ""} ${appointment.lastname || ""}`.trim();
  return <div className="modalOverlay">
    <form action={action} className="mvcModal caseStartModal">
      <Link className="modalClose" href="/admin/appointments" aria-label="Close">×</Link>
      <h2>New Case</h2>
      <div className="modalDivider" />
      <input type="hidden" name="appointment_id" value={appointment.id} />
      <div className="modalGrid">
        <Field name="name_display" label="Name" defaultValue={clientName} readOnly />
        <Field name="phone_display" label="Phone Number" defaultValue={appointment.phone} readOnly />
        <Field name="caseCategory" label="Category" defaultValue={appointmentTypeLabel(appointment.category)} required />
        <EmployeeSelect employees={employees} />
        {showFinance ? <>
          <Field name="total" label="Total Payment" type="number" required />
          <Field name="advance" label="Advance Payment" type="number" defaultValue="0" required />
          <Field name="appointment_fee" label="Paid Appointment Fee" type="number" defaultValue={appointment.fee || "0.00"} readOnly />
          <Field name="remaining_display" label="Remaining Dues" type="number" defaultValue="0.00" readOnly />
        </> : null}
        <Field name="startDate" label="Start Date" type="date" defaultValue={today()} required />
        <Field name="endDate" label="End Date" type="date" />
        <Field name="description" label="Description" wide />
      </div>
      {employees.length === 0 ? <div className="notice errorNotice modalNotice">Create at least one employee before starting a case.</div> : null}
      <button className="btn btnPrimary modalSubmit" disabled={employees.length === 0}>Add</button>
    </form>
  </div>;
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  placeholder,
  readOnly,
  wide,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  readOnly?: boolean;
  wide?: boolean;
}) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}>
    <label className="label">{label}{required ? <span className="requiredMark"> *</span> : null}</label>
    <input className="input" name={name} type={type} required={required} defaultValue={inputValue(defaultValue)} placeholder={placeholder} readOnly={readOnly} step={type === "number" ? "0.01" : undefined} />
  </div>;
}

function Textarea({ name, label, wide }: { name: string; label: string; wide?: boolean }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}>
    <label className="label">{label}</label>
    <textarea className="input" name={name} rows={4} />
  </div>;
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: Array<string | { value: string; label: string }>; defaultValue?: unknown }) {
  return <div>
    <label className="label">{label}</label>
    <select className="input" name={name} defaultValue={inputValue(defaultValue)}>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        return <option key={value} value={value}>{label}</option>;
      })}
    </select>
  </div>;
}

function RadioGroup({ name, label, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue: string }) {
  return <div>
    <span className="label">{label}</span>
    <div className="radioGroup">
      {options.map((option) => <label key={option}><input type="radio" name={name} value={option} defaultChecked={option === defaultValue} /> {option}</label>)}
    </div>
  </div>;
}

function EmployeeSelect({ employees }: { employees: Awaited<ReturnType<typeof employeeOptions>> }) {
  return <div>
    <label className="label">Assign to<span className="requiredMark"> *</span></label>
    <select className="input" name="employee_id" required>
      {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label}</option>)}
    </select>
  </div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Appointments</h1><p className="muted">You do not have permission to access appointments.</p></div>;
}

function appointmentTypeOptions() {
  return [{ value: "visit", label: "Visit" }, { value: "online", label: "Online" }, { value: "physical", label: "Physical" }];
}

function appointmentTypeLabel(value: unknown) {
  const raw = textFromValue(value, "-");
  const normalized = raw.toLowerCase();
  if (normalized === "visit" || normalized === "physical") return "Visit";
  if (normalized === "online") return "online";
  return raw;
}

function appointmentStatusLabel(value: unknown) {
  const raw = textFromValue(value, "-");
  const normalized = raw.toLowerCase().replace("-", "");
  if (normalized === "unpaid") return "Un-Paid";
  if (normalized === "paid") return "Paid";
  return raw;
}

function appointmentStatusInputValue(value: unknown) {
  const normalized = textFromValue(value, "Unpaid").toLowerCase().replace(/[-\s]/g, "");
  return normalized === "paid" ? "Paid" : "Unpaid";
}

function moneyValue(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

function displayDateTime(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return formatLocalDateTime(value, true);
  return String(value).replace("T", " ").slice(0, 19);
}

function dateTimeInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return formatLocalDateTime(value, false).replace(" ", "T");
  return String(value).replace(" ", "T").slice(0, 16);
}

function inputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatLocalDateTime(value, false).slice(0, 10);
  return String(value);
}

function formatLocalDateTime(date: Date, withSeconds: boolean) {
  const parts = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]}${withSeconds ? `:${parts[5]}` : ""}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}
