import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { money } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) return <AccessDenied />;

  const resource = getResource("cases");
  const canEdit = resource ? canEditResource(user, resource) : false;
  const canDelete = resource ? canDeleteResource(user, resource) : false;
  const showFinance = canViewFinance(user);
  const params = await searchParams;
  const q = (params.q || "").trim();

  async function deleteCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete cases.");
    const caseId = Number(formData.get("id") || 0);
    if (!Number.isFinite(caseId) || caseId <= 0) throw new Error("Invalid case.");
    await getDb().query(`DELETE FROM "case_installments" WHERE client_case_id=$1`, [caseId]);
    await getDb().query(`DELETE FROM "client_cases" WHERE id=$1`, [caseId]);
    redirect("/admin/cases");
  }

  const values: unknown[] = [];
  const where = q ? `WHERE (cc.client_name ILIKE $1 OR c.firstname ILIKE $1 OR c.lastname ILIKE $1 OR c.phone ILIKE $1 OR cc."caseCategory" ILIKE $1)` : "";
  if (q) values.push(`%${q}%`);
  const result = await getDb().query(
    `
      SELECT
        cc.id,
        cc.client_name,
        cc.total,
        cc.advance,
        cc.remaining,
        cc."caseCategory",
        cc."startDate",
        cc.status,
        c.firstname,
        c.lastname,
        c.phone
      FROM "client_cases" cc
      JOIN "clients" c ON c.id = cc.client_id
      ${where}
      ORDER BY cc."startDate" DESC NULLS LAST, cc.id DESC
      LIMIT 80
    `,
    values,
  );

  return <>
    <div className="workflowGrid">
      <Link className="workflowCard" href="/admin/clients"><strong>Clients</strong><span>Client records</span></Link>
      <Link className="workflowCard" href="/admin/appointments"><strong>Appointments</strong><span>Bookings</span></Link>
      <Link className="workflowCard active" href="/admin/cases"><strong>Cases</strong><span>Case files</span></Link>
    </div>

    <section className="panel tableWrap legacyCasePanel">
      <form className="legacySearch">
        <label>Search:<input className="input" name="q" defaultValue={q} aria-label="Search cases" /></label>
      </form>
      <table className="table dataTable legacyCaseTable">
        <thead><tr>
          <th>Client<br/>Photo</th>
          <th>Client<br/>Name</th>
          <th>Phone</th>
          {showFinance ? <><th>Total<br/>Fee</th><th>Advance<br/>Fee</th><th>Remaining<br/>Fee</th></> : null}
          <th>Category</th>
          <th>Start<br/>Date</th>
          <th>Status</th>
          <th className="actionColumn">Actions</th>
        </tr></thead>
        <tbody>{result.rows.map((row) => {
          const clientName = row.client_name || `${row.firstname || ""} ${row.lastname || ""}`.trim();
          return <tr key={row.id}>
            <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
            <td>{clientName || "-"}</td>
            <td>{row.phone || "-"}</td>
            {showFinance ? <>
              <td>{plainMoney(row.total)}</td>
              <td>{plainMoney(row.advance)}</td>
              <td>{plainMoney(row.remaining)}</td>
            </> : null}
            <td>{row.caseCategory || "-"}</td>
            <td>{formatDate(row.startDate)}</td>
            <td>{formatStatus(row.status)}</td>
            <td className="actionColumn"><div className="actionStack vertical">
              <Link className="actionBtn view" href={`/admin/cases/${row.id}`} aria-label={`View case for ${clientName}`}><Eye size={18}/></Link>
              {canEdit ? <Link className="actionBtn edit" href={`/admin/cases/${row.id}?mode=edit`} aria-label={`Edit case for ${clientName}`}><Pencil size={18}/></Link> : null}
              {canDelete ? <form action={deleteCase}><input type="hidden" name="id" value={row.id}/><button className="actionBtn delete" aria-label={`Delete case for ${clientName}`}><Trash2 size={18}/></button></form> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
      {result.rows.length === 0 ? <div className="emptyState">No data available in table</div> : null}
    </section>
  </>;
}

function AccessDenied() {
  return <div className="panel"><h1>Cases</h1><p className="muted">You do not have permission to access case operations.</p></div>;
}

function plainMoney(value: unknown) {
  const formatted = money(value).replace("PKR", "").trim();
  return formatted === "0" ? "0" : formatted;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function formatStatus(value: unknown) {
  const status = String(value || "In Progress").trim();
  return status === "In Process" ? "In Progress" : status;
}
