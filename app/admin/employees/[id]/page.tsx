import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Eye, MapPin, Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { money } from "@/lib/erp";

export const dynamic = "force-dynamic";

type EmployeeDetail = {
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
};

type AssignedCase = {
  id: number;
  client_name: string | null;
  firstname: string | null;
  lastname: string | null;
  phone: string | null;
  total: string | number | null;
  advance: string | number | null;
  remaining: string | number | null;
  caseCategory: string | null;
  startDate: string | Date | null;
  endDate: string | Date | null;
  status: string | null;
};

export default async function EmployeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId) || employeeId <= 0) notFound();

  const user = await requireUser();
  if (!canViewResource(user, "employees")) return <AccessDenied />;

  const employee = await getEmployee(employeeId);
  if (!employee) notFound();

  const casesResource = getResource("cases");
  const employeeResource = getResource("employees");
  const canEditEmployee = employeeResource ? canEditResource(user, employeeResource) : false;
  const canEditCases = casesResource ? canEditResource(user, casesResource) : false;
  const canDeleteCases = casesResource ? canDeleteResource(user, casesResource) : false;
  const showFinance = canViewFinance(user);
  const assignedCases = await getAssignedCases(employeeId);
  const name = employeeName(employee);

  async function deleteCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete cases.");
    const caseId = Number(formData.get("id") || 0);
    if (!Number.isFinite(caseId) || caseId <= 0) throw new Error("Invalid case.");
    await getDb().query(`DELETE FROM "case_installments" WHERE client_case_id=$1`, [caseId]);
    await getDb().query(`DELETE FROM "client_cases" WHERE id=$1 AND employee_id=$2`, [caseId, employeeId]);
    redirect(`/admin/employees/${employeeId}`);
  }

  return <>
    <section className="profileHero employeeDetailHero">
      <div>
        <img className="profilePhoto employeeDetailPhoto" src="/avatar.svg" alt="" />
      </div>

      <div className="employeeDetailInfo">
        <div className="profileTitle">
          <h1>{name}</h1>
          <span><MapPin size={22} fill="currentColor" /> {employee.province || employee.city || "-"}</span>
        </div>

        <h3>Employee Information</h3>
        <dl className="detailGrid employeeDetailGrid">
          <dt>CNIC</dt><dd>{employee.cnic || "-"}</dd>
          <dt>Employee ID</dt><dd>{employee.emp_id || "-"}</dd>
          <dt>Phone</dt><dd>{employee.phone || "-"}</dd>
          <dt>Address</dt><dd>{employee.address || "-"}</dd>
          <dt>City</dt><dd>{employee.city || "-"}</dd>
          <dt>Province/State</dt><dd>{employee.province || "-"}</dd>
          <dt>Country</dt><dd>{employee.country || "-"}</dd>
          <dt>Email</dt><dd>{employee.user_email || "-"}</dd>
          <dt>Joining Date</dt><dd>{formatDate(employee.joining_date)}</dd>
          <dt>Position</dt><dd>{employee.designation || "-"}</dd>
        </dl>

        {showFinance ? <>
          <h3 className="paymentInfoTitle">Payment Information</h3>
          <dl className="detailGrid employeeDetailGrid">
            <dt>Salary</dt><dd>{plainMoney(employee.salary)}</dd>
          </dl>
        </> : null}

        {canEditEmployee ? <div className="employeeDetailActions">
          <Link className="btn btnPrimary" href={`/admin/employees?edit=${employee.id}`}>Edit Employee Details</Link>
        </div> : null}
      </div>
    </section>

    <section className="assignedCaseSection">
      <h2>Assigned Cases</h2>
      <div className="panel tableWrap employeeCasePanel">
        <table className="table dataTable employeeAssignedTable">
          <thead><tr>
            <th>Client<br/>Photo</th>
            <th>Client Name</th>
            <th>Phone</th>
            {showFinance ? <><th>Total<br/>Fee</th><th>Advance<br/>Fee</th><th>Remaining<br/>Fee</th></> : null}
            <th>Category</th>
            <th>Start<br/>Date</th>
            <th>End<br/>Date</th>
            <th className="actionColumn">Action</th>
          </tr></thead>
          <tbody>
            {assignedCases.map((caseRow) => {
              const clientName = caseRow.client_name || `${caseRow.firstname || ""} ${caseRow.lastname || ""}`.trim() || "-";
              return <tr key={caseRow.id}>
                <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
                <td>{clientName}</td>
                <td>{caseRow.phone || "-"}</td>
                {showFinance ? <>
                  <td>{plainMoney(caseRow.total)}</td>
                  <td>{plainMoney(caseRow.advance)}</td>
                  <td>{plainMoney(caseRow.remaining)}</td>
                </> : null}
                <td>{caseRow.caseCategory || "-"}</td>
                <td>{formatDate(caseRow.startDate)}</td>
                <td>{formatDate(caseRow.endDate)}</td>
                <td className="actionColumn">
                  <div className="actionStack vertical">
                    <Link className="actionBtn view" href={`/admin/cases/${caseRow.id}`} aria-label={`View case for ${clientName}`}><Eye size={18} /></Link>
                    {canEditCases ? <Link className="actionBtn edit" href={`/admin/cases/${caseRow.id}?mode=edit`} aria-label={`Edit case for ${clientName}`}><Pencil size={18} /></Link> : null}
                    {canDeleteCases ? <form action={deleteCase}><input type="hidden" name="id" value={caseRow.id} /><button className="actionBtn delete" aria-label={`Delete case for ${clientName}`}><Trash2 size={18} /></button></form> : null}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {assignedCases.length === 0 ? <div className="emptyState">No assigned cases found.</div> : null}
      </div>
    </section>
  </>;
}

async function getEmployee(id: number): Promise<EmployeeDetail | null> {
  const result = await getDb().query(
    `
      SELECT
        e.id, e.user_id, e.emp_id, e.firstname, e.lastname, e.phone, e.designation,
        e.joining_date, e.city, e.province, e.country, e.address, e.salary,
        u.email AS user_email, u.cnic, u.gender, u.avatar
      FROM "employees" e
      LEFT JOIN "users" u ON u.id = e.user_id
      WHERE e.id=$1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] || null;
}

async function getAssignedCases(employeeId: number): Promise<AssignedCase[]> {
  const result = await getDb().query(
    `
      SELECT
        cc.id, cc.client_name, cc.total, cc.advance, cc.remaining, cc."caseCategory", cc."startDate", cc."endDate", cc.status,
        c.firstname, c.lastname, c.phone
      FROM "client_cases" cc
      LEFT JOIN "clients" c ON c.id = cc.client_id
      WHERE cc.employee_id=$1
      ORDER BY cc."startDate" DESC NULLS LAST, cc.id DESC
      LIMIT 100
    `,
    [employeeId],
  );
  return result.rows;
}

function AccessDenied() {
  return <div className="panel"><h1>Employees</h1><p className="muted">You do not have permission to manage employees.</p></div>;
}

function employeeName(employee: Pick<EmployeeDetail, "firstname" | "lastname">) {
  return `${employee.firstname || ""} ${employee.lastname || ""}`.trim() || "Employee";
}

function formatDate(value: unknown) {
  if (!value) return "-";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function plainMoney(value: unknown) {
  return money(value).replace("PKR", "").trim();
}
