import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canCreateResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { checkboxValue, dateTimeValue, dateValue, employeeOptions, localDateTime, nullableText, numberValue, syncCaseTotals, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ appointment_id?: string }> }) {
  const user = await requireUser();
  const resource = getResource("cases");
  if (!canViewResource(user, "cases") || !resource || !canCreateResource(user, resource)) return <AccessDenied />;
  const showFinance = canViewFinance(user);

  const params = await searchParams;
  const appointmentId = Number(params.appointment_id || 0);
  const [employees, appointment] = await Promise.all([
    employeeOptions(),
    appointmentId > 0 ? getAppointmentIntake(appointmentId) : Promise.resolve(null),
  ]);
  if (appointment?.case_id) redirect(`/admin/cases/${appointment.case_id}`);

  async function createCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create cases.");
    const currentCanViewFinance = canViewFinance(currentUser);

    const db = getDb();
    const now = new Date();
    const total = currentCanViewFinance ? numberValue(formData, "total") : 0;
    const initialPayment = currentCanViewFinance ? numberValue(formData, "initial_payment") : 0;
    const clientName = `${text(formData, "firstname")} ${text(formData, "lastname")}`.trim();
    const existingClientId = numberValue(formData, "existing_client_id");
    const existingAppointmentId = numberValue(formData, "existing_appointment_id");
    let clientId = existingClientId;
    let appointmentIdForCase = existingAppointmentId;

    if (clientId > 0) {
      await db.query(
        `
          UPDATE "clients"
          SET ref_id=$1, firstname=$2, lastname=$3, email=$4, phone=$5, phone2=$6, cnic=$7,
              gender=$8, avatar=$9, city=$10, province=$11, country=$12, address=$13,
              destination_country=$14, visa_category=$15, passport_no=$16, passport_issue=$17,
              passport_expiry=$18, documents=$19, updated_at=$20
          WHERE id=$21
        `,
        clientValues(formData, now, clientId),
      );
    } else {
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
        clientValues(formData, now),
      );
      clientId = Number(client.rows[0].id);
    }

    if (appointmentIdForCase > 0) {
      const existingCase = await db.query(`SELECT id FROM "client_cases" WHERE appointment_id=$1 LIMIT 1`, [appointmentIdForCase]);
      if (existingCase.rows[0]?.id) redirect(`/admin/cases/${existingCase.rows[0].id}`);
      const existingAppointment = await db.query(`SELECT fee, appointmentstatus FROM "appointments" WHERE id=$1 LIMIT 1`, [appointmentIdForCase]);
      const existingAppointmentRow = existingAppointment.rows[0] || {};
      await db.query(
        `UPDATE "appointments" SET fee=$1, appointmentstatus=$2, category=$3, appointmentdate=$4, updated_at=$5 WHERE id=$6`,
        [
          currentCanViewFinance ? numberValue(formData, "appointment_fee") : Number(existingAppointmentRow.fee || 0),
          currentCanViewFinance ? text(formData, "appointmentstatus", "Unpaid") : textFromValue(existingAppointmentRow.appointmentstatus, "Unpaid"),
          text(formData, "appointment_category", "visit"),
          dateTimeValue(formData, "appointmentdate"),
          now,
          appointmentIdForCase,
        ],
      );
    } else {
      const appointment = await db.query(
        `
          INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$6)
          RETURNING id
        `,
        [
          clientId,
          currentCanViewFinance ? numberValue(formData, "appointment_fee") : 0,
          currentCanViewFinance ? text(formData, "appointmentstatus", "Unpaid") : "Unpaid",
          text(formData, "appointment_category", "visit"),
          dateTimeValue(formData, "appointmentdate"),
          now,
        ],
      );
      appointmentIdForCase = Number(appointment.rows[0].id);
    }

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
        clientId,
        appointmentIdForCase,
        numberValue(formData, "employee_id"),
        clientName,
        total,
        initialPayment,
        Math.max(total - initialPayment, 0),
        initialPayment,
        text(formData, "caseCategory", "Consultation"),
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
        now,
      ],
    );

    const caseId = Number(caseResult.rows[0].id);
    if (initialPayment > 0) {
      await db.query(
        `INSERT INTO "case_installments" (client_case_id, name, amount, time, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
        [caseId, text(formData, "installment_name", "Initial payment"), String(initialPayment), dateTimeValue(formData, "installment_time"), now],
      );
      await syncCaseTotals(caseId);
    }

    redirect(`/admin/cases/${caseId}`);
  }

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Case intake</div>
        <h1>{appointment ? "Start Case From Appointment" : "New Case"}</h1>
        <p>{appointment ? "Use the booked appointment and client details to open a full case." : showFinance ? "Create the client profile, appointment, case assignment, and first payment together." : "Create the client profile, appointment, and case assignment together."}</p>
      </div>
      <Link className="btn" href={appointment ? "/admin/appointments" : "/admin/cases"}>{appointment ? "Back to Appointments" : "Back to Cases"}</Link>
    </div>

    {employees.length === 0 ? <div className="panel dangerPanel">Create at least one employee before opening a case. The database requires every case to be assigned.</div> : null}

    <form action={createCase} className="erpForm">
      {appointment ? <>
        <input type="hidden" name="existing_client_id" value={appointment.client_id} />
        <input type="hidden" name="existing_appointment_id" value={appointment.id} />
      </> : null}
      <section className="panel formSection">
        <h2>Client</h2>
        <div className="formGrid">
          <Field name="ref_id" label="Reference ID" defaultValue={appointment?.ref_id} />
          <Field name="firstname" label="First name" defaultValue={appointment?.firstname} required />
          <Field name="lastname" label="Last name" defaultValue={appointment?.lastname} required />
          <Field name="email" label="Email" type="email" defaultValue={appointment?.email} />
          <Field name="phone" label="Phone" defaultValue={appointment?.phone} required />
          <Field name="phone2" label="Second phone" defaultValue={appointment?.phone2} />
          <Field name="cnic" label="CNIC" defaultValue={appointment?.cnic} />
          <Select name="gender" label="Gender" options={["Male", "Female", "Other"]} defaultValue={appointment?.gender || "Male"} />
          <Field name="address" label="Address" defaultValue={appointment?.address} required wide />
          <Field name="city" label="City" defaultValue={appointment?.city} />
          <Field name="province" label="Province" defaultValue={appointment?.province} />
          <Field name="country" label="Country" defaultValue={appointment?.country} />
          <Field name="destination_country" label="Destination country" defaultValue={appointment?.destination_country} />
          <Field name="visa_category" label="Visa category" defaultValue={appointment?.visa_category} />
          <Field name="passport_no" label="Passport no" defaultValue={appointment?.passport_no} />
          <Field name="passport_issue" label="Passport issue" type="date" defaultValue={dateInput(appointment?.passport_issue)} />
          <Field name="passport_expiry" label="Passport expiry" type="date" defaultValue={dateInput(appointment?.passport_expiry)} />
          <Field name="documents" label="Documents" defaultValue={appointment?.documents} />
        </div>
      </section>

      <section className="panel formSection">
        <h2>Case</h2>
        <div className="formGrid">
          <EmployeeSelect employees={employees} />
          <Field name="caseCategory" label="Case category" defaultValue={appointment?.visa_category || "Consultation"} required />
          <Select name="status" label="Status" options={["Open", "In Process", "Pending", "Completed", "Closed"]} />
          <Field name="startDate" label="Start date" type="date" defaultValue={today()} required />
          <Field name="endDate" label="End date" type="date" />
          <Field name="submitted_on" label="Submitted on" type="date" />
          <Field name="travel_dates" label="Travel dates" />
          <Field name="docs" label="Docs status" />
          {showFinance ? <>
            <Field name="total" label="Total amount" type="number" required />
            <Field name="initial_payment" label="Initial payment" type="number" defaultValue="0" />
            <Field name="appointment_fee" label="Appointment fee" type="number" defaultValue={appointment?.fee ?? "0"} />
            <Select name="appointmentstatus" label="Payment status" options={["Paid", "Unpaid"]} defaultValue={appointment?.appointmentstatus || "Unpaid"} />
          </> : null}
          <Select name="appointment_category" label="Appointment type" options={[{ value: "online", label: "Online" }, { value: "visit", label: "Physical / Visit" }]} defaultValue={appointment?.category || "visit"} />
          <Field name="appointmentdate" label="Appointment date" type="datetime-local" defaultValue={dateTimeInput(appointment?.appointmentdate) || localDateTime()} required />
          <Field name="documents_note" label="Document notes" wide />
          <Textarea name="description" label="Case description" />
        </div>
        <div className="checkGrid">
          {["email_gen", "travel_history", "previous_refusal", "vfa", "dfa", "personal_documents", "job_documents", "business_documents"].map((item) => (
            <label key={item}><input type="checkbox" name={item} /> {item.replace(/_/g, " ")}</label>
          ))}
        </div>
      </section>

      {showFinance ? <section className="panel formSection">
        <h2>First Installment</h2>
        <div className="formGrid">
          <Field name="installment_name" label="Installment name" defaultValue="Initial payment" />
          <Field name="installment_time" label="Installment time" type="datetime-local" defaultValue={localDateTime()} />
        </div>
      </section> : null}

      <div className="formActions"><button className="btn btnPrimary" disabled={employees.length === 0}>Create Case</button></div>
    </form>
  </>;
}

async function getAppointmentIntake(appointmentId: number) {
  const result = await getDb().query(
    `
      SELECT
        a.id,
        a.client_id,
        a.fee,
        a.appointmentstatus,
        a.category,
        a.appointmentdate,
        c.ref_id,
        c.firstname,
        c.lastname,
        c.email,
        c.phone,
        c.phone2,
        c.cnic,
        c.gender,
        c.address,
        c.city,
        c.province,
        c.country,
        c.destination_country,
        c.visa_category,
        c.passport_no,
        c.passport_issue,
        c.passport_expiry,
        c.documents,
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

function clientValues(formData: FormData, now: Date, existingClientId?: number) {
  const values = [
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
  ];
  return existingClientId ? [...values, existingClientId] : values;
}

function Field({ name, label, type = "text", required, wide, defaultValue }: { name: string; label: string; type?: string; required?: boolean; wide?: boolean; defaultValue?: unknown }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={inputValue(defaultValue)} step={type === "number" ? "0.01" : undefined} /></div>;
}

function Textarea({ name, label }: { name: string; label: string }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4} /></div>;
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: Array<string | { value: string; label: string }>; defaultValue?: unknown }) {
  return <div><label className="label">{label}</label><select className="input" name={name} defaultValue={inputValue(defaultValue)}>{options.map((option) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    return <option key={value} value={value}>{label}</option>;
  })}</select></div>;
}

function EmployeeSelect({ employees }: { employees: Awaited<ReturnType<typeof employeeOptions>> }) {
  return <div><label className="label">Assigned employee</label><select className="input" name="employee_id" required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label} {employee.detail ? `- ${employee.detail}` : ""}</option>)}</select></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>New Case</h1><p className="muted">You do not have permission to create cases.</p></div>;
}

function inputValue(value: unknown) {
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
