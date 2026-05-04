import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canEditResource, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { clientOptions, dateTimeValue, localDateTime, money, numberValue, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const resource = getResource("appointments");
  if (!resource || !canViewResource(user, "appointments")) return <AccessDenied />;

  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const params = await searchParams;
  const status = (params.status || "").trim();
  const [appointments, clients, stats] = await Promise.all([getAppointments(status), clientOptions(), getStats()]);

  async function createAppointment(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create appointments.");
    await getDb().query(
      `INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
      [numberValue(formData, "client_id"), numberValue(formData, "fee"), text(formData, "appointmentstatus", "Scheduled"), text(formData, "category", "Consultation"), dateTimeValue(formData, "appointmentdate")],
    );
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
      <Metric label="Scheduled" value={stats.scheduled.toLocaleString()} />
      <Metric label="Completed" value={stats.completed.toLocaleString()} />
      <Metric label="Fees" value={money(stats.fees)} />
    </div>

    <div className="panel">
      <form className="filterBar">
        <select className="input" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button className="btn">Filter</button>
      </form>
    </div>

    {canCreate ? <form action={createAppointment} className="panel formSection">
      <div className="sectionHeader"><h2>New Appointment</h2><span className="badge">{clients.length} clients loaded</span></div>
      <div className="formGrid">
        <div><label className="label">Client</label><select className="input" name="client_id" required>{clients.map((client) => <option key={client.id} value={client.id}>{client.label} {client.detail ? `- ${client.detail}` : ""}</option>)}</select></div>
        <Field name="fee" label="Fee" type="number" defaultValue="0" required />
        <Field name="appointmentstatus" label="Status" defaultValue="Scheduled" required />
        <Field name="category" label="Category" defaultValue="Consultation" required />
        <Field name="appointmentdate" label="Appointment date" type="datetime-local" defaultValue={localDateTime()} required />
      </div>
      <button className="btn btnPrimary"><Plus size={16}/> Schedule Appointment</button>
    </form> : null}

    <div className="appointmentList">
      {appointments.map((item) => <article className="panel appointmentItem" key={item.id}>
        <div>
          <strong>{item.firstname} {item.lastname}</strong>
          <p className="muted">{item.phone} - {item.category}</p>
        </div>
        <div><span className="statusPill">{item.appointmentstatus}</span><p className="muted">{formatDateTime(item.appointmentdate)}</p></div>
        <div><strong>{money(item.fee)}</strong><p className="muted">Fee</p></div>
        <div className="headerActions">
          {item.case_id ? <Link className="btn" href={`/admin/cases/${item.case_id}`}>Open Case</Link> : null}
          {canDelete ? <form action={deleteAppointment}><input type="hidden" name="id" value={item.id}/><button className="btn dangerButton" disabled={Boolean(item.case_id)}>Delete</button></form> : null}
        </div>
        {canEdit ? <details className="editDrawer">
          <summary>Edit appointment</summary>
          <form action={updateAppointment} className="inlineForm">
            <input type="hidden" name="id" value={item.id} />
            <input className="input" name="fee" type="number" step="0.01" defaultValue={item.fee} required />
            <input className="input" name="appointmentstatus" defaultValue={item.appointmentstatus} required />
            <input className="input" name="category" defaultValue={item.category} required />
            <input className="input" name="appointmentdate" type="datetime-local" defaultValue={formatDateTime(item.appointmentdate)} required />
            <button className="btn btnPrimary">Save</button>
          </form>
        </details> : null}
      </article>)}
    </div>
  </>;
}

async function getAppointments(status: string) {
  const values: unknown[] = [];
  const where = status ? `WHERE a.appointmentstatus = $1` : "";
  if (status) values.push(status);
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
      COUNT(*) FILTER (WHERE appointmentstatus IN ('Scheduled', 'Pending'))::int AS scheduled,
      COUNT(*) FILTER (WHERE appointmentstatus = 'Completed')::int AS completed,
      COALESCE(SUM(fee), 0) AS fees
    FROM "appointments"
  `);
  const row = result.rows[0] || {};
  return { total: Number(row.total || 0), scheduled: Number(row.scheduled || 0), completed: Number(row.completed || 0), fees: Number(row.fees || 0) };
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="metricCard"><div className="metricTop"><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
}

function Field({ name, label, type = "text", required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <div><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} step={type === "number" ? "0.01" : undefined}/></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Appointments</h1><p className="muted">You do not have permission to access appointments.</p></div>;
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 16);
  return String(value).replace(" ", "T").slice(0, 16);
}
