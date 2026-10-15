import Link from "next/link";
import { CaseStatusBadge } from "@/components/CaseStatusBadge";
import { isCaseCompleted } from "@/lib/caseStatus";
import { redirect } from "next/navigation";
import { ListPlus, Pencil, Plus, Trash2, UploadCloud } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/activityLog";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { buildClientSearch, clientSearchOrderSql } from "@/lib/clientSearch";
import { canCreateResource, canDeleteResource, canEditResource, canManageAppointmentPayments, canViewResource } from "@/lib/permissions";
import { dateTimeValue, localDateTime, nullableText, numberValue, text } from "@/lib/erp";
import { syncAppointmentIncome } from "@/lib/incomeSync";

export const dynamic = "force-dynamic";

type ClientSearchParams = {
  q?: string;
  page?: string;
  pageSize?: string;
  new?: string;
  appointment_for?: string;
  view_client?: string;
  error?: string;
};

type DbRow = Record<string, any>;
const CLIENT_PAGE_SIZES = [25, 50, 100];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<ClientSearchParams> }) {
  const user = await requireUser();
  const resource = getResource("clients");
  if (!resource || !canViewResource(user, "clients")) return <AccessDenied />;

  const appointmentResource = getResource("appointments");
  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const canAddAppointment = appointmentResource ? canCreateResource(user, appointmentResource) : false;
  const canEditAppointmentPayments = canManageAppointmentPayments(user);
  const params = await searchParams;
  const query = textFromValue(params.q, "");
  const pageSize = parsePageSize(params.pageSize);
  const currentPage = parsePositiveInt(params.page, 1);
  const listHref = clientListHref({ q: query, page: currentPage, pageSize });
  const appointmentClientId = Number(params.appointment_for || 0);
  const viewClientId = Number(params.view_client || 0);
  const defaultDateTime = localDateTime();

  const [clients, appointmentClient, viewedClient] = await Promise.all([
    getClients(query, currentPage, pageSize),
    appointmentClientId > 0 ? getClient(appointmentClientId) : Promise.resolve(null),
    viewClientId > 0 ? getClient(viewClientId) : Promise.resolve(null),
  ]);
  if (clients.page !== currentPage) {
    redirect(clientListHref({ q: query, page: clients.page, pageSize }));
  }

  async function createClient(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("clients");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create clients.");

    const created = await getDb().query(
      `
        INSERT INTO "clients" (
          ref_id, firstname, lastname, email, epassword, phone, phone2, cnic, cnic_issue,
          cnic_expiry, gender, avatar, city, province, country, address, destination_country,
          visa_category, passport_no, passport_issue, passport_expiry, documents, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW())
        RETURNING id
      `,
      clientValues(formData),
    );
    await recordActivity({
      user: currentUser,
      action: "created",
      resource: "clients",
      resourceTitle: "Client",
      subjectId: created.rows[0]?.id,
      properties: { name: `${text(formData, "firstname")} ${text(formData, "lastname")}`.trim() },
    });

    redirect("/admin/clients");
  }

  async function createAppointmentForClient(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("appointments");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create appointments.");

    const currentCanEditAppointmentPayments = canManageAppointmentPayments(currentUser);
    const clientId = numberValue(formData, "client_id");
    const client = await getDb().query(`SELECT id FROM "clients" WHERE id=$1 LIMIT 1`, [clientId]);
    if (!client.rows[0]) throw new Error("Client was not found.");

    const created = await getDb().query(
      `INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id`,
      [
        clientId,
        currentCanEditAppointmentPayments ? numberValue(formData, "fee") : 0,
        currentCanEditAppointmentPayments ? text(formData, "appointmentstatus", "Unpaid") : "Unpaid",
        text(formData, "category", "visit"),
        dateTimeValue(formData, "appointmentdate"),
      ],
    );
    await syncAppointmentIncome(Number(created.rows[0]?.id || 0));
    await recordActivity({
      user: currentUser,
      action: "created",
      resource: "appointments",
      resourceTitle: "Appointment",
      subjectId: created.rows[0]?.id,
      properties: { client_id: clientId },
    });

    redirect("/admin/clients");
  }

  async function deleteClient(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("clients");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete clients.");

    const clientId = numberValue(formData, "id");
    const linked = await getDb().query(
      `
        SELECT
          (SELECT COUNT(*)::int FROM "appointments" WHERE client_id=$1) AS appointments,
          (SELECT COUNT(*)::int FROM "client_cases" WHERE client_id=$1) AS cases
      `,
      [clientId],
    );
    const row = linked.rows[0] || {};
    if (Number(row.appointments || 0) > 0 || Number(row.cases || 0) > 0) redirect("/admin/clients?error=linked");

    const deleted = await getDb().query(`DELETE FROM "clients" WHERE id=$1 RETURNING id, firstname, lastname`, [clientId]);
    await recordActivity({
      user: currentUser,
      action: "deleted",
      resource: "clients",
      resourceTitle: "Client",
      subjectId: deleted.rows[0]?.id ?? clientId,
      properties: { name: `${deleted.rows[0]?.firstname || ""} ${deleted.rows[0]?.lastname || ""}`.trim() },
    });
    redirect("/admin/clients");
  }

  return <>
    <div className="workflowGrid">
      <Link className="workflowCard active" href="/admin/clients"><strong>Clients</strong><span>Client records</span></Link>
      <Link className="workflowCard" href="/admin/appointments"><strong>Appointments</strong><span>Bookings</span></Link>
      <Link className="workflowCard" href="/admin/cases"><strong>Cases</strong><span>Case files</span></Link>
    </div>

    <div className="appointmentTopActions">
      {canCreate ? <Link className="btn btnPrimary" href={clientListHref({ q: query, page: currentPage, pageSize, new: "client" })}>Add New Client</Link> : null}
    </div>

    {params.error === "linked" ? <div className="notice errorNotice">This client already has appointments or cases, so it was not deleted.</div> : null}
    {canCreate && params.new === "client" ? <ClientModal action={createClient} closeHref={listHref} /> : null}
    {canAddAppointment && appointmentClient ? <AppointmentForClientModal action={createAppointmentForClient} client={appointmentClient} canEditAppointmentPayments={canEditAppointmentPayments} defaultDateTime={defaultDateTime} closeHref={listHref} /> : null}
    {viewedClient ? <ClientViewModal client={viewedClient} closeHref={listHref} /> : null}

    <section className="panel tableWrap clientPanel">
      <form className="legacySearch" action="/admin/clients" style={{ gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="pageSize" value={pageSize} />
        <label htmlFor="client-search">Search:<input id="client-search" className="input" name="q" defaultValue={query} placeholder="Name, ID, CNIC or phone" aria-describedby="client-search-help" /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      <p id="client-search-help" className="muted">Search by name, client ID, reference, CNIC, either phone, email, city, address, passport, or visa details.</p>
      <div className="tableControlBar">
        <p className="muted">Showing {clients.start}-{clients.end} of {clients.total} clients</p>
        <form className="pageSizeForm" action="/admin/clients">
          {query ? <input type="hidden" name="q" value={query} /> : null}
          <label>Rows:
            <select className="input smallSelect" name="pageSize" defaultValue={pageSize}>
              {CLIENT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
      </div>
      <table className="table dataTable clientLegacyTable">
        <thead>
          <tr>
            <th>Reference ID</th>
            <th>Client<br />Photo</th>
            <th>Name</th>
            <th>Phone No</th>
            <th>Email</th>
            <th>Address</th>
            <th>Actions</th>
            <th>Add<br />Appointment</th>
          </tr>
        </thead>
        <tbody>
          {clients.rows.length === 0 ? <tr><td colSpan={8} className="emptyState">No data available in table</td></tr> : clients.rows.map((client) => (
            <tr key={client.id} className={client.case_id && isCaseCompleted(client.case_status) ? "caseCompletedRow" : undefined}>
              <td>{client.ref_id || fallbackReference(client.id)}</td>
              <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
              <td>{client.firstname}<br />{client.lastname}{client.case_id ? <><br /><Link href={`/admin/cases/${client.case_id}`}><CaseStatusBadge status={client.case_status} /></Link></> : null}<br /><small className="muted">Client ID: {client.id}</small>{client.cnic ? <><br /><small className="muted">CNIC: {client.cnic}</small></> : null}</td>
              <td>{client.phone}</td>
              <td>{client.email || ""}</td>
              <td>{formatAddress(client)}</td>
              <td>
                <div className="actionStack vertical">
                  <Link className="actionBtn view" href={clientListHref({ q: query, page: currentPage, pageSize, view_client: client.id })} aria-label="View client"><ListPlus size={18} /></Link>
                  {canEdit ? <Link className="actionBtn edit" href={`/admin/clients/${client.id}/edit`} aria-label="Edit client"><Pencil size={18} /></Link> : null}
                  {canDelete ? <form action={deleteClient}><input type="hidden" name="id" value={client.id} /><button className="actionBtn delete" aria-label="Delete client"><Trash2 size={18} /></button></form> : null}
                </div>
              </td>
              <td>
                {client.appointment_id ? <span className="caseStartedText">Already booked</span> : canAddAppointment ? <Link className="actionBtn start" href={clientListHref({ q: query, page: currentPage, pageSize, appointment_for: client.id })} aria-label="Add appointment"><Plus size={22} /></Link> : <span className="muted">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav className="paginationBar" aria-label="Clients pages">
        {clients.page > 1 ? <Link className="btn" href={clientListHref({ q: query, page: clients.page - 1, pageSize })}>Previous</Link> : <span className="btn disabledBtn">Previous</span>}
        <span>Page {clients.page} of {clients.totalPages}</span>
        {clients.page < clients.totalPages ? <Link className="btn" href={clientListHref({ q: query, page: clients.page + 1, pageSize })}>Next</Link> : <span className="btn disabledBtn">Next</span>}
      </nav>
    </section>
  </>;
}

async function getClients(query: string, requestedPage: number, pageSize: number) {
  const { condition, values } = buildClientSearch(query);
  const where = condition ? `WHERE ${condition}` : "";
  const searchOrder = clientSearchOrderSql(query);
  const db = getDb();
  const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM "clients" c ${where}`, values);
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  const result = await db.query(
    `
      SELECT c.*, latest_appointment.id AS appointment_id, latest_case.id AS case_id, latest_case.status AS case_status
      FROM "clients" c
      LEFT JOIN LATERAL (
        SELECT a.id
        FROM "appointments" a
        WHERE a.client_id = c.id
        ORDER BY a.appointmentdate DESC, a.id DESC
        LIMIT 1
      ) latest_appointment ON TRUE
      LEFT JOIN LATERAL (SELECT cc.id, cc.status FROM client_cases cc WHERE cc.client_id=c.id ORDER BY cc.id DESC LIMIT 1) latest_case ON TRUE
      ${where}
      ORDER BY ${searchOrder ? `${searchOrder}, ` : ""}c.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `,
    [...values, pageSize, offset],
  );
  const rows = result.rows as DbRow[];
  return { rows, page, total, totalPages, start: rows.length ? offset + 1 : 0, end: rows.length ? offset + rows.length : 0 };
}

async function getClient(clientId: number) {
  const result = await getDb().query(`SELECT c.*,
    (SELECT id FROM client_cases WHERE client_id=c.id ORDER BY id DESC LIMIT 1) AS case_id,
    (SELECT status FROM client_cases WHERE client_id=c.id ORDER BY id DESC LIMIT 1) AS case_status
    FROM "clients" c WHERE c.id=$1 LIMIT 1`, [clientId]);
  return (result.rows[0] as DbRow | undefined) ?? null;
}

function ClientModal({ action, closeHref }: { action: (formData: FormData) => Promise<void>; closeHref: string }) {
  return <div className="modalOverlay">
    <form action={action} className="mvcModal appointmentCreateModal">
      <Link className="modalClose" href={closeHref} aria-label="Close">&times;</Link>
      <h2>New Client</h2>
      <div className="modalDivider" />
      <ClientFields />
      <button className="btn btnPrimary modalSubmit">Register</button>
    </form>
  </div>;
}

function AppointmentForClientModal({
  action,
  client,
  canEditAppointmentPayments,
  defaultDateTime,
  closeHref,
}: {
  action: (formData: FormData) => Promise<void>;
  client: DbRow;
  canEditAppointmentPayments: boolean;
  defaultDateTime: string;
  closeHref: string;
}) {
  return <div className="modalOverlay">
    <form action={action} className="mvcModal caseStartModal">
      <Link className="modalClose" href={closeHref} aria-label="Close">&times;</Link>
      <h2>New Appointment</h2>
      <div className="modalDivider" />
      <input type="hidden" name="client_id" value={client.id} />
      <div className="modalGrid">
        <Field name="name_display" label="Name" defaultValue={`${client.firstname || ""} ${client.lastname || ""}`.trim()} readOnly />
        <Field name="phone_display" label="Phone Number" defaultValue={client.phone} readOnly />
        <Select name="category" label="Appointment Category" options={appointmentTypeOptions()} defaultValue="visit" />
        <Field name="appointmentdate" label="Appointment Date & Time" type="datetime-local" defaultValue={defaultDateTime} required />
        {canEditAppointmentPayments ? <>
          <Select name="appointmentstatus" label="Status" options={["Paid", "Unpaid"]} defaultValue="Unpaid" />
          <Field name="fee" label="Appointment Fee" type="number" defaultValue="0" required />
        </> : null}
      </div>
      <button className="btn btnPrimary modalSubmit">Add Appointment</button>
    </form>
  </div>;
}

function ClientViewModal({ client, closeHref }: { client: DbRow; closeHref: string }) {
  return <div className="modalOverlay">
    <div className="mvcModal caseStartModal">
      <Link className="modalClose" href={closeHref} aria-label="Close">&times;</Link>
      <h2>Client Detail</h2>
      {client.case_id ? <Link href={`/admin/cases/${client.case_id}`}><CaseStatusBadge status={client.case_status} /></Link> : null}
      <div className="modalDivider" />
      <div className="clientDetailModal">
        <img className="profilePhoto" src="/avatar.svg" alt="" />
        <div className="detailGrid">
          <span>Client ID</span><strong>{client.id}</strong>
          <span>Reference ID</span><strong>{client.ref_id || fallbackReference(client.id)}</strong>
          <span>Name</span><strong>{client.firstname} {client.lastname}</strong>
          <span>Phone</span><strong>{client.phone}</strong>
          <span>Email</span><strong>{client.email || "-"}</strong>
          <span>CNIC</span><strong>{client.cnic || "-"}</strong>
          <span>Address</span><strong>{formatAddress(client)}</strong>
          <span>Visa Category</span><strong>{client.visa_category || "-"}</strong>
          <span>Destination</span><strong>{client.destination_country || "-"}</strong>
        </div>
      </div>
    </div>
  </div>;
}

function ClientFields() {
  return <div className="modalGrid">
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
      <div className="uploadMock"><UploadCloud size={44} /><span>Drag and drop a file here<br />or click</span></div>
    </div>
    <Field name="destination_country" label="Destination Country" />
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

function clientValues(formData: FormData) {
  return [
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
  ];
}

function appointmentTypeOptions() {
  return [{ value: "visit", label: "Visit" }, { value: "online", label: "Online" }, { value: "physical", label: "Physical" }];
}

function formatAddress(client: Record<string, unknown>) {
  const parts = [client.address, client.city, client.province, client.country].map((part) => textFromValue(part, "")).filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "-";
}

function fallbackReference(id: unknown) {
  return `${id}/MVC/2026`;
}

function clientListHref(params: {
  q: string;
  page: number;
  pageSize: number;
  new?: string;
  appointment_for?: number | string;
  view_client?: number | string;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page > 1) search.set("page", String(params.page));
  if (params.pageSize !== CLIENT_PAGE_SIZES[0]) search.set("pageSize", String(params.pageSize));
  if (params.new) search.set("new", params.new);
  if (params.appointment_for) search.set("appointment_for", String(params.appointment_for));
  if (params.view_client) search.set("view_client", String(params.view_client));
  const queryString = search.toString();
  return queryString ? `/admin/clients?${queryString}` : "/admin/clients";
}

function parsePageSize(value: unknown) {
  const parsed = Number(value);
  return CLIENT_PAGE_SIZES.includes(parsed) ? parsed : CLIENT_PAGE_SIZES[0];
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function inputValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatLocalDate(value);
  return String(value);
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function AccessDenied() {
  return <div className="panel"><h1>Clients</h1><p className="muted">You do not have permission to access clients.</p></div>;
}
