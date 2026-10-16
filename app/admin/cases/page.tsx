import Link from "next/link";
import { CaseStatusBadge } from "@/components/CaseStatusBadge";
import { isCaseCompleted } from "@/lib/caseStatus";
import { completeCase } from "@/app/admin/cases/actions";

import { redirect } from "next/navigation";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/activityLog";
import { canDeleteResource, canEditResource, canViewFinance, canViewResource, isAccountant, isCaseOfficer } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { buildClientSearch, clientSearchOrderSql } from "@/lib/clientSearch";
import { money } from "@/lib/erp";
import { deleteCaseAutoIncome } from "@/lib/incomeSync";

export const dynamic = "force-dynamic";

const CASE_PAGE_SIZES = [25, 50, 100];

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; pageSize?: string; status?: string; assigned?: string }> }) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) return <AccessDenied />;

  const resource = getResource("cases");
  const canEdit = resource ? canEditResource(user, resource) : false;
  const canDelete = resource ? canDeleteResource(user, resource) : false;
  const showFinance = canViewFinance(user);
  const params = await searchParams;
  const q = (params.q || "").trim();
  const pageSize = parsePageSize(params.pageSize);
  const currentPage = parsePositiveInt(params.page, 1);
  const status = ["ongoing", "completed"].includes(params.status || "") ? params.status! : "all";
  const assigned = params.assigned === "me" ? "me" : "all";

  async function deleteCase(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const currentResource = getResource("cases");
    if (!currentResource || !canDeleteResource(currentUser, currentResource)) throw new Error("You do not have permission to delete cases.");
    const caseId = Number(formData.get("id") || 0);
    if (!Number.isFinite(caseId) || caseId <= 0) throw new Error("Invalid case.");
    await deleteCaseAutoIncome(caseId);
    await getDb().query(`DELETE FROM "case_installments" WHERE client_case_id=$1`, [caseId]);
    const deleted = await getDb().query(`DELETE FROM "client_cases" WHERE id=$1 RETURNING id, client_id`, [caseId]);
    await recordActivity({
      user: currentUser,
      action: "deleted",
      resource: "cases",
      resourceTitle: "Client Case",
      subjectId: deleted.rows[0]?.id ?? caseId,
      properties: { client_id: deleted.rows[0]?.client_id },
    });
    redirect("/admin/cases");
  }

  const { condition, values } = buildClientSearch(q, "c", 1, ["cc.id::text", "cc.client_name", 'cc."caseCategory"', "cc.status"]);
  const statusCondition = status === "all" ? "" : `lower(btrim(COALESCE(cc.status,''))) ${status === "completed" ? "IN" : "NOT IN"} ('completed','closed')`;
  let assignmentCondition = "";
  if (assigned === "me") {
    values.push(String(user.id));
    assignmentCondition = `EXISTS (SELECT 1 FROM employees own WHERE own.id=cc.employee_id AND own.user_id=$${values.length})`;
  }
  const filters = [condition, statusCondition, assignmentCondition].filter(Boolean);
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const searchOrder = clientSearchOrderSql(q);
  const db = getDb();
  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM "client_cases" cc JOIN "clients" c ON c.id = cc.client_id ${where}`,
    values,
  );
  const total = Number(countResult.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > totalPages) redirect(caseListHref({ q, status, assigned, page: totalPages, pageSize }));
  const offset = (currentPage - 1) * pageSize;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  const result = await db.query(
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
        EXISTS (SELECT 1 FROM employees assigned WHERE assigned.id=cc.employee_id AND assigned.user_id=$${values.length + 3}) AS is_assigned,
        c.id AS client_id,
        c.cnic,
        c.firstname,
        c.lastname,
        c.phone
      FROM "client_cases" cc
      JOIN "clients" c ON c.id = cc.client_id
      ${where}
      ORDER BY ${searchOrder ? `${searchOrder}, ` : ""}cc."startDate" DESC NULLS LAST, cc.id DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `,
    [...values, pageSize, offset, user.id],
  );

  return <>
    <div className="workflowGrid">
      {canViewResource(user, "clients") ? <Link className="workflowCard" href="/admin/clients"><strong>Clients</strong><span>Client records</span></Link> : null}
      {canViewResource(user, "appointments") ? <Link className="workflowCard" href="/admin/appointments"><strong>Appointments</strong><span>Bookings</span></Link> : null}
      <Link className="workflowCard active" href="/admin/cases"><strong>Cases</strong><span>Case files</span></Link>
    </div>

    <section className="panel tableWrap legacyCasePanel">
      <form className="legacySearch" action="/admin/cases" style={{ gap: 8, flexWrap: "wrap" }}>
        <input type="hidden" name="pageSize" value={pageSize} />
        <label>Cases:<select className="input smallSelect" name="status" defaultValue={status}><option value="all">All cases</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option></select></label>
        <label>Assigned:<select className="input" name="assigned" defaultValue={assigned}><option value="all">All cases</option><option value="me">My assigned cases</option></select></label>
        <label htmlFor="case-search">Search:<input id="case-search" className="input" name="q" defaultValue={q} placeholder="Name, ID, CNIC or phone" aria-describedby="case-search-help" /></label>
        <button className="btn" type="submit">Search</button>
      </form>
      <p id="case-search-help" className="muted">Search by client name, ID, reference, CNIC, phone, email, city, address, passport, visa details, or case ID, category and status.</p>
      <div className="tableControlBar">
        <p className="muted">Showing {result.rows.length ? offset + 1 : 0}-{result.rows.length ? offset + result.rows.length : 0} of {total} cases</p>
        <form className="pageSizeForm" action="/admin/cases">
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="assigned" value={assigned} />
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <label>Rows:
            <select className="input smallSelect" name="pageSize" defaultValue={pageSize}>
              {CASE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Apply</button>
        </form>
      </div>
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
          return <tr key={row.id} className={isCaseCompleted(row.status) ? "caseCompletedRow" : undefined}>
            <td><img className="tableAvatar" src="/avatar.svg" alt="" /></td>
            <td>{clientName || "-"}<br /><small className="muted">Case ID: {row.id} · Client ID: {row.client_id}</small>{row.cnic ? <><br /><small className="muted">CNIC: {row.cnic}</small></> : null}</td>
            <td>{row.phone || "-"}</td>
            {showFinance ? <>
              <td>{plainMoney(row.total)}</td>
              <td>{plainMoney(row.advance)}</td>
              <td>{plainMoney(row.remaining)}</td>
            </> : null}
            <td>{row.caseCategory || "-"}</td>
            <td>{formatDate(row.startDate)}</td>
            <td><CaseStatusBadge status={row.status} /></td>
            <td className="actionColumn"><div className="actionStack vertical">
              {row.is_assigned && !isCaseCompleted(row.status) ? <form action={completeCase}><input type="hidden" name="case_id" value={row.id} /><button className="btn caseCompleteButton" type="submit">Mark completed</button></form> : null}
              <Link className="actionBtn view" href={`/admin/cases/${row.id}`} aria-label={`View case for ${clientName}`}><Eye size={18}/></Link>
              {canEdit || ((isAccountant(user) || isCaseOfficer(user)) && row.is_assigned) ? <Link className="actionBtn edit" href={`/admin/cases/${row.id}?mode=edit`} aria-label={`Edit case for ${clientName}`}><Pencil size={18}/></Link> : null}
              {canDelete ? <form action={deleteCase}><input type="hidden" name="id" value={row.id}/><button className="actionBtn delete" aria-label={`Delete case for ${clientName}`}><Trash2 size={18}/></button></form> : null}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
      {result.rows.length === 0 ? <div className="emptyState">No data available in table</div> : null}
      <nav className="paginationBar" aria-label="Cases pages">
        {currentPage > 1 ? <Link className="btn" href={caseListHref({ q, status, assigned, page: currentPage - 1, pageSize })}>Previous</Link> : <span className="btn disabledBtn">Previous</span>}
        <span>Page {currentPage} of {totalPages}</span>
        {currentPage < totalPages ? <Link className="btn" href={caseListHref({ q, status, assigned, page: currentPage + 1, pageSize })}>Next</Link> : <span className="btn disabledBtn">Next</span>}
      </nav>
    </section>
  </>;
}

function AccessDenied() {
  return <div className="panel"><h1>Cases</h1><p className="muted">You do not have permission to access case operations.</p></div>;
}

function caseListHref(params: { q: string; page: number; pageSize: number; status?: string; assigned?: string }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status && params.status !== "all") search.set("status", params.status);
  if (params.assigned === "me") search.set("assigned", "me");
  if (params.page > 1) search.set("page", String(params.page));
  if (params.pageSize !== CASE_PAGE_SIZES[0]) search.set("pageSize", String(params.pageSize));
  const queryString = search.toString();
  return queryString ? `/admin/cases?${queryString}` : "/admin/cases";
}

function parsePageSize(value: unknown) {
  const parsed = Number(value);
  return CASE_PAGE_SIZES.includes(parsed) ? parsed : CASE_PAGE_SIZES[0];
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
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
