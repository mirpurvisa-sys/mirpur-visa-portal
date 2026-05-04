import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canEditResource, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateTimeValue, localDateTime, money, nullableText, numberValue, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const resource = getResource("appointments");
  if (!resource || !canViewResource(user, "appointments")) return <AccessDenied />;

  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const casesResource = getResource("cases");
  const canStartCase = casesResource ? canCreateResource(user, casesResource) : false;
  const params = await searchParams;
  const paymentStatus = (params.status || "").trim();
  const [appointments, stats] = await Promise.all([getAppointments(paymentStatus), getStats()]);

  async function createAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create appointments.");
    const db = getDb();
    const now = new Date();
    const client = await db.query(
      `
        INSERT INTO "clients" (
          ref_id, firstname, lastname, email, phone, phone2, cnic, gender, avatar,
          city, province, country, address, destination_country, visa_category,
          passport_no, passport_issue, passport_expiry, documents, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)
        RETURNING id
      `,
      [
        nullableText(formData, "ref_id"),
        text(formData, "firstname"),
        text(formData, "lastname"),
        nullableText(formData, "email"),
        text(formData, "phone"),
        nullableText(formData, "phone2"),
        nullableText(formData, "cnic"),
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

    await getDb().query(
      `INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [Number(client.rows[0].id), numberValue(formData, "fee"), text(formData, "appointmentstatus", "Unpaid"), text(formData, "category", "visit"), dateTimeValue(formData, "appointmentdate")],
    );
    redirect("/admin/appointments");
  }

  async function changeAppointmentStatus(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to update appointment status.");
    await getDb().query(`UPDATE "appointments" SET appointmentstatus=$1, updated_at=NOW() WHERE id=$2`, [text(formData, "appointmentstatus"), numberValue(formData, "id")]);
    redirect("/admin/appointments");
  }

  async function updateAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to update appointments.");
    await getDb().query(
      `UPDATE "appointments" SET fee=$1, appointmentstatus=$2, category=$3, appointmentdate=$4, updated_at=NOW() WHERE id=$5`,
      [numberValue(formData, "fee"), text(formData, "appointmentstatus"), text(formData, "category"), dateTimeValue(formData, "appointmentdate"), numberValue(formData, "id")],
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

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Scheduling</div>
        <h1>Appointments</h1>
        <p>Schedule consultations, update appointment status, and jump into linked cases.</p>
      </div>
    </div>

    <div className="metricGrid">
      <Metric label="Total" value={stats.total.toLocaleString()} icon={<CalendarClock size={20}/>} />
      <Metric label="Paid" value={stats.paid.toLocaleString()} />
      <Metric label="Unpaid" value={stats.unpaid.toLocaleString()} />
      <Metric label="Fees" value={money(stats.fees)} />
    </div>

    <div className="panel">
      <form className="filterBar">
        <select className="input" name="status" defaultValue={paymentStatus}>
          <option value="">All payment statuses</option>
          <option value="Paid">Paid</option>
          <option value="Unpaid">Unpaid</option>
        </select>
        <button className="btn">Filter</button>
      </form>
    </div>

    {canCreate ? <form action={createAppointment} className="panel formSection">
      <div className="sectionHeader"><h2>Book Appointment</h2><span className="badge">Creates client + appointment</span></div>
      <h3 className="formSubhead">Client Details</h3>
      <div className="formGrid">
        <Field name="ref_id" label="Reference ID" />
        <Field name="firstname" label="First name" required />
        <Field name="lastname" label="Last name" required />
        <Field name="email" label="Email" type="email" />
        <Field name="phone" label="Phone" required />
        <Field name="phone2" label="Second phone" />
        <Field name="cnic" label="CNIC" />
        <Select name="gender" label="Gender" options={["Male", "Female", "Other"]} />
        <Field name="address" label="Address" required wide />
        <Field name="city" label="City" />
        <Field name="province" label="Province" />
        <Field name="country" label="Country" />
        <Field name="destination_country" label="Destination country" />
        <Field name="visa_category" label="Visa category" />
        <Field name="passport_no" label="Passport no" />
        <Field name="passport_issue" label="Passport issue" type="date" />
        <Field name="passport_expiry" label="Passport expiry" type="date" />
        <Field name="documents" label="Documents" />
      </div>
      <h3 className="formSubhead">Appointment Details</h3>
      <div className="formGrid">
        <Field name="fee" label="Fee" type="number" defaultValue="0" required />
        <Select name="appointmentstatus" label="Payment status" options={["Paid", "Unpaid"]} defaultValue="Unpaid" />
        <Select name="category" label="Appointment type" options={[{ value: "online", label: "Online" }, { value: "visit", label: "Physical / Visit" }]} defaultValue="visit" />
        <Field name="appointmentdate" label="Appointment date" type="datetime-local" defaultValue={localDateTime()} required />
      </div>
      <button className="btn btnPrimary"><Plus size={16}/> Book Appointment</button>
    </form> : null}

    <div className="appointmentList">
      {appointments.map((item) => <article className="panel appointmentItem" key={item.id}>
        <div>
          <strong>{item.firstname} {item.lastname}</strong>
          <p className="muted">{item.phone} - {appointmentTypeLabel(item.category)}</p>
        </div>
        <div>{canEdit ? <form action={changeAppointmentStatus} className="statusForm">
          <input type="hidden" name="id" value={item.id} />
          <select className="input" name="appointmentstatus" defaultValue={item.appointmentstatus}>
            {["Paid", "Unpaid"].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button className="btn">Save</button>
        </form> : <span className="statusPill">{item.appointmentstatus}</span>}<p className="muted">{formatDateTime(item.appointmentdate)}</p></div>
        <div><strong>{money(item.fee)}</strong><p className="muted">Fee</p></div>
        <div className="headerActions">
          {item.case_id ? <Link className="btn" href={`/admin/cases/${item.case_id}`}>Open Case</Link> : null}
          {!item.case_id && canStartCase ? <Link className="btn btnPrimary" href={`/admin/cases/new?appointment_id=${item.id}`}>Start Case</Link> : null}
          {canDelete ? <form action={deleteAppointment}><input type="hidden" name="id" value={item.id}/><button className="btn dangerButton" disabled={Boolean(item.case_id)}>Delete</button></form> : null}
        </div>
        {canEdit ? <details className="editDrawer">
          <summary>Edit appointment</summary>
          <form action={updateAppointment} className="inlineForm">
            <input type="hidden" name="id" value={item.id} />
            <input className="input" name="fee" type="number" step="0.01" defaultValue={item.fee} required />
            <select className="input" name="appointmentstatus" defaultValue={item.appointmentstatus}>{["Paid", "Unpaid"].map((option) => <option key={option} value={option}>{option}</option>)}</select>
            <select className="input" name="category" defaultValue={item.category}>{appointmentTypeOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <input className="input" name="appointmentdate" type="datetime-local" defaultValue={formatDateTime(item.appointmentdate)} required />
            <button className="btn btnPrimary">Save</button>
          </form>
        </details> : null}
      </article>)}
    </div>
  </>;
}

async function getAppointments(paymentStatus: string) {
  const values: unknown[] = [];
  const where = paymentStatus ? `WHERE a.appointmentstatus = $1` : "";
  if (paymentStatus) values.push(paymentStatus);
  const result = await getDb().query(
    `
      SELECT a.*, c.firstname, c.lastname, c.phone, cc.id AS case_id
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
      LEFT JOIN "client_cases" cc ON cc.appointment_id = a.id
      ${where}
      ORDER BY a.appointmentdate DESC
      LIMIT 80
    `,
    values,
  );
  return result.rows;
}

async function getStats() {
  const result = await getDb().query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE appointmentstatus = 'Paid')::int AS paid,
      COUNT(*) FILTER (WHERE appointmentstatus = 'Unpaid')::int AS unpaid,
      COALESCE(SUM(fee), 0) AS fees
    FROM "appointments"
  `);
  const row = result.rows[0] || {};
  return { total: Number(row.total || 0), paid: Number(row.paid || 0), unpaid: Number(row.unpaid || 0), fees: Number(row.fees || 0) };
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="metricCard"><div className="metricTop"><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
}

function Field({ name, label, type = "text", required, defaultValue, wide }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; wide?: boolean }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} step={type === "number" ? "0.01" : undefined}/></div>;
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: Array<string | { value: string; label: string }>; defaultValue?: string }) {
  return <div><label className="label">{label}</label><select className="input" name={name} defaultValue={defaultValue}>{options.map((option) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return <option key={value} value={value}>{label}</option>;
  })}</select></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Appointments</h1><p className="muted">You do not have permission to access appointments.</p></div>;
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  return String(value).replace(" ", "T").slice(0, 16);
}

function appointmentTypeOptions() {
  return [{ value: "online", label: "Online" }, { value: "visit", label: "Physical / Visit" }];
}

function appointmentTypeLabel(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "online") return "Online";
  if (normalized === "visit" || normalized === "physical") return "Physical / Visit";
  return String(value || "-");
}
