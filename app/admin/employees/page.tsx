import { redirect } from "next/navigation";
import { Plus, UserRoundCheck } from "lucide-react";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canEditResource, canViewResource, isAdmin } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, money, nullableText, numberValue, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ reset_error?: string; reset_success?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const resource = getResource("employees");
  if (!resource || !canViewResource(user, "employees")) return <AccessDenied />;

  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const canResetPasswords = isAdmin(user);
  const employees = await getEmployees();

  async function createEmployee(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("employees");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create employees.");
    await getDb().query(
      `
        INSERT INTO "employees" (user_id, emp_id, firstname, lastname, phone, designation, joining_date, city, province, country, address, salary, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
      `,
      [
        numberValue(formData, "user_id", currentUser.id),
        nullableText(formData, "emp_id"),
        text(formData, "firstname"),
        text(formData, "lastname"),
        text(formData, "phone"),
        text(formData, "designation"),
        dateValue(formData, "joining_date"),
        text(formData, "city", "-"),
        text(formData, "province", "-"),
        text(formData, "country", "-"),
        text(formData, "address", "-"),
        numberValue(formData, "salary"),
      ],
    );
    redirect("/admin/employees");
  }

  async function updateEmployee(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("employees");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to edit employees.");
    await getDb().query(
      `
        UPDATE "employees"
        SET user_id=$1, emp_id=$2, firstname=$3, lastname=$4, phone=$5, designation=$6,
            joining_date=$7, city=$8, province=$9, country=$10, address=$11, salary=$12, updated_at=NOW()
        WHERE id=$13
      `,
      [
        numberValue(formData, "user_id"),
        nullableText(formData, "emp_id"),
        text(formData, "firstname"),
        text(formData, "lastname"),
        text(formData, "phone"),
        text(formData, "designation"),
        dateValue(formData, "joining_date"),
        text(formData, "city", "-"),
        text(formData, "province", "-"),
        text(formData, "country", "-"),
        text(formData, "address", "-"),
        numberValue(formData, "salary"),
        numberValue(formData, "id"),
      ],
    );
    redirect("/admin/employees");
  }

  async function deleteEmployee(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("employees");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete employees.");
    const employeeId = numberValue(formData, "id");
    const assigned = await getDb().query(`SELECT COUNT(*)::int AS count FROM "client_cases" WHERE employee_id=$1`, [employeeId]);
    if (Number(assigned.rows[0]?.count || 0) > 0) throw new Error("Reassign this employee's cases before deleting the employee.");
    await getDb().query(`DELETE FROM "employees" WHERE id=$1`, [employeeId]);
    redirect("/admin/employees");
  }

  async function resetEmployeePassword(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    if (!isAdmin(currentUser)) redirect("/admin/employees?reset_error=not_allowed");

    const password = text(formData, "password");
    const confirmPassword = text(formData, "confirm_password");
    if (password.length < 8) redirect("/admin/employees?reset_error=short_password");
    if (password !== confirmPassword) redirect("/admin/employees?reset_error=mismatch");

    const employeeId = numberValue(formData, "employee_id");
    const employee = await getDb().query(`SELECT user_id FROM "employees" WHERE id=$1 LIMIT 1`, [employeeId]);
    const userId = Number(employee.rows[0]?.user_id || 0);
    if (!userId) redirect("/admin/employees?reset_error=not_linked");

    const hash = await bcrypt.hash(password, 10);
    await getDb().query(`UPDATE "users" SET password=$1, updated_at=NOW() WHERE id=$2`, [hash, userId]);
    redirect("/admin/employees?reset_success=1");
  }

  const totalSalary = employees.reduce((sum, employee) => sum + Number(employee.salary || 0), 0);

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Team</div>
        <h1>Employees</h1>
        <p>Manage employee profiles, salaries, and case workload from one team page.</p>
      </div>
    </div>

    <div className="metricGrid">
      <Metric label="Employees" value={employees.length.toLocaleString()} icon={<UserRoundCheck size={20}/>} />
      <Metric label="Assigned cases" value={employees.reduce((sum, row) => sum + Number(row.assigned_cases || 0), 0).toLocaleString()} />
      <Metric label="Monthly salary" value={money(totalSalary)} />
      <Metric label="Open workload" value={employees.reduce((sum, row) => sum + Number(row.open_cases || 0), 0).toLocaleString()} />
    </div>

    {params.reset_error ? <div className="notice errorNotice">{resetErrorMessage(params.reset_error)}</div> : null}
    {params.reset_success ? <div className="notice successNotice">Employee password was reset successfully.</div> : null}

    {canCreate ? <form action={createEmployee} className="panel formSection">
      <div className="sectionHeader"><h2>Add Employee</h2><span className="badge">HR record</span></div>
      <div className="formGrid">
        <Field name="user_id" label="User ID" type="number" defaultValue={String(user.id)} required />
        <Field name="emp_id" label="Employee code" />
        <Field name="firstname" label="First name" required />
        <Field name="lastname" label="Last name" required />
        <Field name="phone" label="Phone" required />
        <Field name="designation" label="Designation" required />
        <Field name="joining_date" label="Joining date" type="date" defaultValue={today()} required />
        <Field name="salary" label="Salary" type="number" required />
        <Field name="city" label="City" defaultValue="-" required />
        <Field name="province" label="Province" defaultValue="-" required />
        <Field name="country" label="Country" defaultValue="-" required />
        <Field name="address" label="Address" defaultValue="-" required wide />
      </div>
      <button className="btn btnPrimary"><Plus size={16}/> Add Employee</button>
    </form> : null}

    <div className="employeeGrid">
      {employees.map((employee) => <article className="employeeCard" key={employee.id}>
        <div className="employeeTop">
          <div><strong>{employee.firstname} {employee.lastname}</strong><span>{employee.designation}</span></div>
          <span className="badge">{employee.emp_id || `#${employee.id}`}</span>
        </div>
        <div className="employeeStats">
          <span>Cases <strong>{employee.assigned_cases}</strong></span>
          <span>Open <strong>{employee.open_cases}</strong></span>
          <span>Salary <strong>{money(employee.salary)}</strong></span>
        </div>
        <p className="muted">{employee.phone} - {employee.city}, {employee.country}</p>
        <p className="muted">Login: {employee.user_email || `User #${employee.user_id}`}</p>

        {canEdit ? <details className="editDrawer">
          <summary>Edit employee</summary>
          <form action={updateEmployee} className="compactForm">
            <input type="hidden" name="id" value={employee.id} />
            <Field name="user_id" label="User ID" type="number" defaultValue={employee.user_id} required />
            <Field name="emp_id" label="Employee code" defaultValue={employee.emp_id} />
            <Field name="firstname" label="First name" defaultValue={employee.firstname} required />
            <Field name="lastname" label="Last name" defaultValue={employee.lastname} required />
            <Field name="phone" label="Phone" defaultValue={employee.phone} required />
            <Field name="designation" label="Designation" defaultValue={employee.designation} required />
            <Field name="joining_date" label="Joining date" type="date" defaultValue={formatDate(employee.joining_date)} required />
            <Field name="salary" label="Salary" type="number" defaultValue={employee.salary} required />
            <Field name="city" label="City" defaultValue={employee.city} required />
            <Field name="province" label="Province" defaultValue={employee.province} required />
            <Field name="country" label="Country" defaultValue={employee.country} required />
            <Field name="address" label="Address" defaultValue={employee.address} required wide />
            <button className="btn btnPrimary">Save</button>
          </form>
        </details> : null}

        {canResetPasswords ? <details className="editDrawer passwordReset">
          <summary>Reset login password</summary>
          <form action={resetEmployeePassword} className="compactForm">
            <input type="hidden" name="employee_id" value={employee.id} />
            <Field name="password" label="New password" type="password" required minLength={8} autoComplete="new-password" />
            <Field name="confirm_password" label="Confirm password" type="password" required minLength={8} autoComplete="new-password" />
            <button className="btn btnPrimary">Reset Password</button>
          </form>
        </details> : null}

        {canDelete ? <form action={deleteEmployee}><input type="hidden" name="id" value={employee.id}/><button className="btn dangerButton" disabled={Number(employee.assigned_cases) > 0}>Delete</button></form> : null}
      </article>)}
    </div>
  </>;
}

async function getEmployees() {
  const result = await getDb().query(`
    SELECT
      e.*,
      u.email AS user_email,
      COUNT(cc.id)::int AS assigned_cases,
      COUNT(cc.id) FILTER (WHERE COALESCE(cc.status, 'Open') NOT IN ('Completed', 'Closed'))::int AS open_cases
    FROM "employees" e
    LEFT JOIN "users" u ON u.id = e.user_id
    LEFT JOIN "client_cases" cc ON cc.employee_id = e.id
    GROUP BY e.id, u.email
    ORDER BY e.firstname ASC, e.lastname ASC
  `);
  return result.rows;
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="metricCard"><div className="metricTop"><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
}

function Field({ name, label, type = "text", defaultValue, required, wide, minLength, autoComplete }: { name: string; label: string; type?: string; defaultValue?: unknown; required?: boolean; wide?: boolean; minLength?: number; autoComplete?: string }) {
  return <div style={{gridColumn: wide ? "1 / -1" : undefined}}><label className="label">{label}</label><input className="input" name={name} type={type} defaultValue={value(defaultValue)} required={required} step={type === "number" ? "0.01" : undefined} minLength={minLength} autoComplete={autoComplete}/></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Employees</h1><p className="muted">You do not have permission to manage employees.</p></div>;
}

function value(input: unknown) {
  if (input === null || input === undefined) return "";
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input);
}

function formatDate(input: unknown) {
  return value(input).slice(0, 10);
}

function resetErrorMessage(code: string) {
  const messages: Record<string, string> = {
    mismatch: "Password confirmation does not match. Please enter the same password in both fields.",
    short_password: "Password must be at least 8 characters.",
    not_linked: "This employee is not linked to a login user.",
    not_allowed: "Only admins can reset employee passwords.",
  };
  return messages[code] || "Password could not be reset. Please try again.";
}
