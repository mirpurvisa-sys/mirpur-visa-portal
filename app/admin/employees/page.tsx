import Link from "next/link";
import { redirect } from "next/navigation";
import { EllipsisVertical, Eye, LockKeyhole, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canEditResource, canViewFinance, canViewResource, isAdmin } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, nullableText, numberValue, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

type EmployeeRow = {
  id: number;
  user_id: number | null;
  emp_id: string | null;
  firstname: string | null;
  lastname: string | null;
  phone: string | null;
  designation: string | null;
  joining_date: string | Date | null;
  city: string | null;
  province: string | null;
  country: string | null;
  address: string | null;
  salary: string | number | null;
  user_email: string | null;
  cnic: string | null;
  gender: string | null;
  avatar: string | null;
  assigned_cases: number;
  open_cases: number;
};

type PageParams = {
  edit?: string;
  employee_error?: string;
  new?: string;
  q?: string;
  reset?: string;
  reset_error?: string;
  reset_success?: string;
};

const DESIGNATIONS = ["Receptionist", "Case Officer", "Admin", "Accountant", "Teacher"];

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const user = await requireUser();
  const resource = getResource("employees");
  if (!resource || !canViewResource(user, "employees")) return <AccessDenied />;

  const params = await searchParams;
  const canCreate = canCreateResource(user, resource);
  const canEdit = canEditResource(user, resource);
  const canDelete = canDeleteResource(user, resource);
  const canResetPasswords = isAdmin(user);
  const showFinance = canViewFinance(user);
  const q = (params.q || "").trim();
  const employees = await getEmployees(q);
  const editEmployee = canEdit && params.edit ? await getEmployeeById(Number(params.edit)) : null;
  const resetEmployee = canResetPasswords && params.reset ? await getEmployeeById(Number(params.reset)) : null;

  async function createEmployee(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("employees");
    if (!currentResource || !canCreateResource(currentUser, currentResource)) throw new Error("You do not have permission to create employees.");

    const email = text(formData, "email").toLowerCase();
    const password = text(formData, "password");
    if (!email) redirect("/admin/employees?new=1&employee_error=missing_email");
    if (password.length < 8) redirect("/admin/employees?new=1&employee_error=short_password");

    const db = getDb();
    const existing = await db.query(`SELECT id FROM "users" WHERE lower(email)=lower($1) LIMIT 1`, [email]);
    if (existing.rows[0]) redirect("/admin/employees?new=1&employee_error=email_exists");

    const firstname = text(formData, "firstname");
    const lastname = text(formData, "lastname");
    const phone = text(formData, "phone");
    const cnic = text(formData, "cnic", "-");
    const gender = text(formData, "gender", "-");
    const designation = text(formData, "designation", "Case Officer");
    const avatar = text(formData, "avatar", "user.jpg");
    const hash = await bcrypt.hash(password, 10);

    const createdUser = await db.query(
      `
        INSERT INTO "users" (user_type, firstname, lastname, email, phone, cnic, gender, avatar, password, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
        RETURNING id
      `,
      [designation, firstname, lastname, email, phone, cnic, gender, avatar, hash],
    );
    const userId = Number(createdUser.rows[0]?.id);
    await syncUserRole(userId, designation);

    await db.query(
      `
        INSERT INTO "employees" (user_id, emp_id, firstname, lastname, phone, designation, joining_date, city, province, country, address, salary, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
      `,
      [
        userId,
        nullableText(formData, "emp_id"),
        firstname,
        lastname,
        phone,
        designation,
        dateValue(formData, "joining_date"),
        text(formData, "city", "-"),
        text(formData, "province", "-"),
        text(formData, "country", "-"),
        text(formData, "address", "-"),
        canViewFinance(currentUser) ? numberValue(formData, "salary") : 0,
      ],
    );
    redirect("/admin/employees");
  }

  async function updateEmployee(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("employees");
    if (!currentResource || !canEditResource(currentUser, currentResource)) throw new Error("You do not have permission to edit employees.");

    const employeeId = numberValue(formData, "id");
    const userId = numberValue(formData, "user_id");
    const email = text(formData, "email").toLowerCase();
    const firstname = text(formData, "firstname");
    const lastname = text(formData, "lastname");
    const phone = text(formData, "phone");
    const cnic = text(formData, "cnic", "-");
    const gender = text(formData, "gender", "-");
    const designation = text(formData, "designation", "Case Officer");
    const avatar = text(formData, "avatar", "user.jpg");

    if (!email) redirect(`/admin/employees?edit=${employeeId}&employee_error=missing_email`);
    const duplicate = await getDb().query(`SELECT id FROM "users" WHERE lower(email)=lower($1) AND id<>$2 LIMIT 1`, [email, userId]);
    if (duplicate.rows[0]) redirect(`/admin/employees?edit=${employeeId}&employee_error=email_exists`);

    await getDb().query(
      `
        UPDATE "employees"
        SET emp_id=$1, firstname=$2, lastname=$3, phone=$4, designation=$5,
            joining_date=$6, city=$7, province=$8, country=$9, address=$10, salary=$11, updated_at=NOW()
        WHERE id=$12
      `,
      [
        nullableText(formData, "emp_id"),
        firstname,
        lastname,
        phone,
        designation,
        dateValue(formData, "joining_date"),
        text(formData, "city", "-"),
        text(formData, "province", "-"),
        text(formData, "country", "-"),
        text(formData, "address", "-"),
        canViewFinance(currentUser) ? numberValue(formData, "salary") : numberValue(formData, "existing_salary"),
        employeeId,
      ],
    );

    if (userId) {
      await getDb().query(
        `
          UPDATE "users"
          SET user_type=$1, firstname=$2, lastname=$3, email=$4, phone=$5, cnic=$6, gender=$7, avatar=$8, updated_at=NOW()
          WHERE id=$9
        `,
        [designation, firstname, lastname, email, phone, cnic, gender, avatar, userId],
      );
      await syncUserRole(userId, designation);
    }
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
    const employeeId = numberValue(formData, "employee_id");
    if (password.length < 8) redirect(`/admin/employees?reset=${employeeId}&reset_error=short_password`);
    if (password !== confirmPassword) redirect(`/admin/employees?reset=${employeeId}&reset_error=mismatch`);

    const employee = await getDb().query(`SELECT user_id FROM "employees" WHERE id=$1 LIMIT 1`, [employeeId]);
    const userId = Number(employee.rows[0]?.user_id || 0);
    if (!userId) redirect(`/admin/employees?reset=${employeeId}&reset_error=not_linked`);

    const hash = await bcrypt.hash(password, 10);
    await getDb().query(`UPDATE "users" SET password=$1, updated_at=NOW() WHERE id=$2`, [hash, userId]);
    redirect("/admin/employees?reset_success=1");
  }

  return <>
    <section className="teamToolbar employeeToolbar">
      <form className="employeeSearchForm">
        <label className="teamSearch">
          <Search size={20} />
          <input name="q" defaultValue={q} placeholder="Search team members" aria-label="Search team members" />
        </label>
      </form>
      {canCreate ? <Link className="btn btnPrimary" href="/admin/employees?new=1">Add Employee</Link> : null}
    </section>

    {params.employee_error ? <div className="notice errorNotice">{employeeErrorMessage(params.employee_error)}</div> : null}
    {params.reset_error ? <div className="notice errorNotice">{resetErrorMessage(params.reset_error)}</div> : null}
    {params.reset_success ? <div className="notice successNotice">Employee password was reset successfully.</div> : null}

    <section className="employeeGrid">
      {employees.map((employee) => {
        const name = employeeName(employee);
        return <article className="employeeCard" key={employee.id}>
          <details className="employeeMenu">
            <summary aria-label={`Open actions for ${name}`}><EllipsisVertical size={22} /></summary>
            <div className="employeeMenuPanel">
              <Link href={`/admin/employees/${employee.id}`}><Eye size={16} /> View</Link>
              {canEdit ? <Link href={`/admin/employees?edit=${employee.id}`}><Pencil size={16} /> Edit</Link> : null}
              {canResetPasswords ? <Link href={`/admin/employees?reset=${employee.id}`}><LockKeyhole size={16} /> Reset password</Link> : null}
              {canDelete ? <form action={deleteEmployee}>
                <input type="hidden" name="id" value={employee.id} />
                <button className="employeeMenuDanger" disabled={Number(employee.assigned_cases) > 0}><Trash2 size={16} /> Delete</button>
              </form> : null}
            </div>
          </details>
          <Link className="employeeProfileLink" href={`/admin/employees/${employee.id}`}>
            <div className="employeeTop">
              <div>
                <strong>{name}</strong>
                <span>{employee.designation || "-"}</span>
              </div>
            </div>
          </Link>
        </article>;
      })}
      {employees.length === 0 ? <div className="emptyState employeeEmpty">No team members found.</div> : null}
    </section>

    {canCreate && params.new ? <EmployeeModal title="Employee Form" closeHref="/admin/employees">
      <EmployeeForm action={createEmployee} showFinance={showFinance} submitLabel="Register" />
    </EmployeeModal> : null}

    {canEdit && editEmployee ? <EmployeeModal title="Employee Form" closeHref="/admin/employees">
      <EmployeeForm action={updateEmployee} employee={editEmployee} showFinance={showFinance} submitLabel="Update" />
    </EmployeeModal> : null}

    {canResetPasswords && resetEmployee ? <EmployeeModal title={`Reset Password - ${employeeName(resetEmployee)}`} closeHref="/admin/employees">
      <form action={resetEmployeePassword} className="modalStack">
        <input type="hidden" name="employee_id" value={resetEmployee.id} />
        <Field name="password" label="New Password" type="password" required minLength={8} autoComplete="new-password" />
        <Field name="confirm_password" label="Confirm Password" type="password" required minLength={8} autoComplete="new-password" />
        <button className="btn btnPrimary modalSubmit">Reset Password</button>
      </form>
    </EmployeeModal> : null}
  </>;
}

async function getEmployees(q: string): Promise<EmployeeRow[]> {
  const values: unknown[] = [];
  const where = q
    ? `WHERE (
        e.emp_id::text ILIKE $1 OR e.firstname ILIKE $1 OR e.lastname ILIKE $1 OR e.phone ILIKE $1
        OR e.designation ILIKE $1 OR e.city ILIKE $1 OR u.email ILIKE $1 OR u.cnic ILIKE $1
      )`
    : "";
  if (q) values.push(`%${q}%`);

  const result = await getDb().query(
    `
      SELECT
        e.id, e.user_id, e.emp_id, e.firstname, e.lastname, e.phone, e.designation,
        e.joining_date, e.city, e.province, e.country, e.address, e.salary,
        u.email AS user_email, u.cnic, u.gender, u.avatar,
        COUNT(cc.id)::int AS assigned_cases,
        COUNT(cc.id) FILTER (WHERE COALESCE(cc.status, 'Open') NOT IN ('Completed', 'Closed'))::int AS open_cases
      FROM "employees" e
      LEFT JOIN "users" u ON u.id = e.user_id
      LEFT JOIN "client_cases" cc ON cc.employee_id = e.id
      ${where}
      GROUP BY e.id, u.id
      ORDER BY e.firstname ASC, e.lastname ASC
      LIMIT 80
    `,
    values,
  );
  return result.rows;
}

async function getEmployeeById(id: number): Promise<EmployeeRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const result = await getDb().query(
    `
      SELECT
        e.id, e.user_id, e.emp_id, e.firstname, e.lastname, e.phone, e.designation,
        e.joining_date, e.city, e.province, e.country, e.address, e.salary,
        u.email AS user_email, u.cnic, u.gender, u.avatar,
        COUNT(cc.id)::int AS assigned_cases,
        COUNT(cc.id) FILTER (WHERE COALESCE(cc.status, 'Open') NOT IN ('Completed', 'Closed'))::int AS open_cases
      FROM "employees" e
      LEFT JOIN "users" u ON u.id = e.user_id
      LEFT JOIN "client_cases" cc ON cc.employee_id = e.id
      WHERE e.id=$1
      GROUP BY e.id, u.id
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] || null;
}

async function syncUserRole(userId: number, designation: string) {
  if (!userId) return;
  const roleSlug = roleSlugFromDesignation(designation);
  await getDb().query(`DELETE FROM "users_roles" WHERE user_id=$1`, [userId]);
  await getDb().query(
    `
      INSERT INTO "users_roles" (user_id, role_id)
      SELECT $1, id FROM "roles" WHERE slug=$2
      ON CONFLICT DO NOTHING
    `,
    [userId, roleSlug],
  );
}

function EmployeeModal({ children, closeHref, title }: { children: React.ReactNode; closeHref: string; title: string }) {
  return <div className="modalOverlay">
    <section className="mvcModal employeeModal">
      <Link className="modalClose" href={closeHref} aria-label="Close">&times;</Link>
      <h2>{title}</h2>
      <div className="modalDivider" />
      {children}
    </section>
  </div>;
}

function EmployeeForm({
  action,
  employee,
  showFinance,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  employee?: EmployeeRow;
  showFinance: boolean;
  submitLabel: string;
}) {
  const isEdit = Boolean(employee);
  return <form action={action} className="employeeModalForm">
    {employee ? <>
      <input type="hidden" name="id" value={employee.id} />
      <input type="hidden" name="user_id" value={String(employee.user_id || "")} />
      <input type="hidden" name="existing_salary" value={stringValue(employee.salary)} />
    </> : null}
    <input type="hidden" name="avatar" value={employee?.avatar || "user.jpg"} />

    <div className="modalGrid">
      <Field name="firstname" label="First Name" defaultValue={employee?.firstname} required />
      <Field name="lastname" label="Last Name" defaultValue={employee?.lastname} required />
      <Field name="phone" label="Phone Number" defaultValue={employee?.phone} required />
      <Field name="cnic" label="CNIC Number" defaultValue={employee?.cnic} placeholder="XXXXX-XXXXXXX-X" required />
      <Field name="email" label="Email" type="email" defaultValue={employee?.user_email} required />
      {!isEdit ? <Field name="password" label="Temporary Password" type="password" required minLength={8} autoComplete="new-password" /> : <div />}
      <SelectField name="designation" label="Designation" value={employee?.designation || ""} options={DESIGNATIONS} required />
      <Field name="joining_date" label="Joining Date" type="date" defaultValue={dateInput(employee?.joining_date) || today()} required />
      {showFinance ? <Field name="salary" label="Salary" type="number" defaultValue={employee?.salary ?? 0} required /> : <input type="hidden" name="salary" value={stringValue(employee?.salary || 0)} />}
      <Field name="city" label="City" defaultValue={employee?.city} required />
      <Field name="province" label="State/Province" defaultValue={employee?.province} required />
      <Field name="country" label="Country" defaultValue={employee?.country} required />
      <RadioGroup name="gender" label="Gender" value={employee?.gender || ""} options={["Male", "Female"]} />
      <Field name="emp_id" label="Employee ID" defaultValue={employee?.emp_id} />
      <Textarea name="address" label="Address" defaultValue={employee?.address} />
      <div className="employeeUploadField">
        <label className="label mutedUploadLabel">Upload Profile Picture</label>
        <div className="uploadMock"><UploadCloud size={48} /><span>Drag and drop a file here or click</span></div>
      </div>
    </div>

    <button className="btn btnPrimary modalSubmit"><Plus size={16} /> {submitLabel}</button>
  </form>;
}

function Field({
  autoComplete,
  defaultValue,
  label,
  minLength,
  name,
  placeholder,
  required,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: unknown;
  label: string;
  minLength?: number;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return <div>
    <label className="label">{label}</label>
    <input
      autoComplete={autoComplete}
      className="input"
      defaultValue={stringValue(defaultValue)}
      minLength={minLength}
      name={name}
      placeholder={placeholder}
      required={required}
      step={type === "number" ? "0.01" : undefined}
      type={type}
    />
  </div>;
}

function Textarea({ defaultValue, label, name }: { defaultValue?: unknown; label: string; name: string }) {
  return <div className="modalWide">
    <label className="label">{label}</label>
    <textarea className="input" name={name} rows={4} defaultValue={stringValue(defaultValue)} required />
  </div>;
}

function SelectField({ label, name, options, required, value }: { label: string; name: string; options: string[]; required?: boolean; value: string }) {
  return <div>
    <label className="label">{label}</label>
    <select className="input" name={name} defaultValue={value} required={required}>
      <option value="">Select one</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </div>;
}

function RadioGroup({ label, name, options, value }: { label: string; name: string; options: string[]; value: string }) {
  return <div>
    <label className="label">{label}</label>
    <div className="radioGroup">
      {options.map((option) => <label key={option}>{option}<input name={name} type="radio" value={option} defaultChecked={value === option} /></label>)}
    </div>
  </div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Employees</h1><p className="muted">You do not have permission to manage employees.</p></div>;
}

function employeeName(employee: Pick<EmployeeRow, "firstname" | "lastname">) {
  return `${employee.firstname || ""} ${employee.lastname || ""}`.trim() || "Employee";
}

function stringValue(input: unknown) {
  if (input === null || input === undefined) return "";
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input);
}

function dateInput(input: unknown) {
  if (!input) return "";
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input).slice(0, 10);
}

function roleSlugFromDesignation(designation: string) {
  const normalized = designation.trim().toLowerCase();
  const roles: Record<string, string> = {
    accountant: "accountant",
    admin: "admin",
    "case officer": "case_officer",
    receptionist: "receptionist",
    teacher: "teacher",
  };
  return roles[normalized] || normalized.replace(/\s+/g, "_");
}

function employeeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    email_exists: "That email is already linked to another user.",
    missing_email: "Email is required for an employee login.",
    short_password: "Temporary password must be at least 8 characters.",
  };
  return messages[code] || "Employee could not be saved. Please try again.";
}

function resetErrorMessage(code: string) {
  const messages: Record<string, string> = {
    mismatch: "Password confirmation does not match. Please enter the same password in both fields.",
    not_allowed: "Only admins can reset employee passwords.",
    not_linked: "This employee is not linked to a login user.",
    short_password: "Password must be at least 8 characters.",
  };
  return messages[code] || "Password could not be reset. Please try again.";
}
