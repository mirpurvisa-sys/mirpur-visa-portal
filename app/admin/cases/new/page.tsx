import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canCreateResource, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { checkboxValue, dateTimeValue, dateValue, employeeOptions, localDateTime, nullableText, numberValue, syncCaseTotals, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const user = await requireUser();
  const resource = getResource("cases");
  if (!canViewResource(user, "cases") || !resource || !canCreateResource(user, resource)) return <AccessDenied />;

  const employees = await employeeOptions();

  async function createCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create cases.");

    const db = getDb();
    const now = new Date();
    const total = numberValue(formData, "total");
    const initialPayment = numberValue(formData, "initial_payment");
    const clientName = `${text(formData, "firstname")} ${text(formData, "lastname")}`.trim();

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

    const clientId = Number(client.rows[0].id);
    const appointment = await db.query(
      `
        INSERT INTO "appointments" (client_id, fee, appointmentstatus, category, appointmentdate, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$6)
        RETURNING id
      `,
      [
        clientId,
        numberValue(formData, "appointment_fee"),
        text(formData, "appointmentstatus", "Scheduled"),
        text(formData, "caseCategory", "Consultation"),
        dateTimeValue(formData, "appointmentdate"),
        now,
      ],
    );

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
        Number(appointment.rows[0].id),
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
        <h1>New Case</h1>
        <p>Create the client profile, appointment, case assignment, and first payment together.</p>
      </div>
      <Link className="btn" href="/admin/cases">Back to Cases</Link>
    </div>

    {employees.length === 0 ? <div className="panel dangerPanel">Create at least one employee before opening a case. The database requires every case to be assigned.</div> : null}

    <form action={createCase} className="erpForm">
      <section className="panel formSection">
        <h2>Client</h2>
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
      </section>

      <section className="panel formSection">
        <h2>Case</h2>
        <div className="formGrid">
          <EmployeeSelect employees={employees} />
          <Field name="caseCategory" label="Case category" required />
          <Select name="status" label="Status" options={["Open", "In Process", "Pending", "Completed", "Closed"]} />
          <Field name="startDate" label="Start date" type="date" defaultValue={today()} required />
          <Field name="endDate" label="End date" type="date" />
          <Field name="submitted_on" label="Submitted on" type="date" />
          <Field name="travel_dates" label="Travel dates" />
          <Field name="docs" label="Docs status" />
          <Field name="total" label="Total amount" type="number" required />
          <Field name="initial_payment" label="Initial payment" type="number" defaultValue="0" />
          <Field name="appointment_fee" label="Appointment fee" type="number" defaultValue="0" />
          <Field name="appointmentdate" label="Appointment date" type="datetime-local" defaultValue={localDateTime()} required />
          <Field name="documents_note" label="Document notes" wide />
          <Textarea name="description" label="Case description" />
        </div>
        <div className="checkGrid">
          {["email_gen", "travel_history", "previous_refusal", "vfa", "dfa", "personal_documents", "job_documents", "business_documents"].map((item) => (
            <label key={item}><input type="checkbox" name={item} /> {item.replace(/_/g, " ")}</label>
          ))}
        </div>
      </section>

      <section className="panel formSection">
        <h2>First Installment</h2>
        <div className="formGrid">
          <Field name="installment_name" label="Installment name" defaultValue="Initial payment" />
          <Field name="installment_time" label="Installment time" type="datetime-local" defaultValue={localDateTime()} />
        </div>
      </section>

      <div className="formActions"><button className="btn btnPrimary" disabled={employees.length === 0}>Create Case</button></div>
    </form>
  </>;
}

function Field({ name, label, type = "text", required, wide, defaultValue }: { name: string; label: string; type?: string; required?: boolean; wide?: boolean; defaultValue?: string }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} /></div>;
}

function Textarea({ name, label }: { name: string; label: string }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4} /></div>;
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return <div><label className="label">{label}</label><select className="input" name={name}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>;
}

function EmployeeSelect({ employees }: { employees: Awaited<ReturnType<typeof employeeOptions>> }) {
  return <div><label className="label">Assigned employee</label><select className="input" name="employee_id" required>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.label} {employee.detail ? `- ${employee.detail}` : ""}</option>)}</select></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>New Case</h1><p className="muted">You do not have permission to create cases.</p></div>;
}
