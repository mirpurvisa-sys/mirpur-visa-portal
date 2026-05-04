import Link from "next/link";
import { BriefcaseBusiness, Plus, WalletCards } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { money } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) return <AccessDenied />;

  const casesResource = getResource("cases");
  const canCreate = casesResource ? canCreateResource(user, casesResource) : false;
  const params = await searchParams;
  const q = (params.q || "").trim();
  const status = (params.status || "").trim();
  const values: unknown[] = [];
  const filters: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    filters.push(`(cc.client_name ILIKE $${values.length} OR c.firstname ILIKE $${values.length} OR c.lastname ILIKE $${values.length} OR c.phone ILIKE $${values.length} OR cc."caseCategory" ILIKE $${values.length})`);
  }

  if (status) {
    values.push(status);
    filters.push(`cc.status = $${values.length}`);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const stats = await getCaseStats();
  const result = await getDb().query(
    `
      SELECT
        cc.id,
        cc.client_name,
        cc."caseCategory",
        cc.status,
        cc.total,
        cc.advance,
        cc.total_paid,
        cc.remaining,
        cc."startDate",
        c.firstname,
        c.lastname,
        c.phone,
        e.firstname AS employee_firstname,
        e.lastname AS employee_lastname,
        COUNT(ci.id)::int AS installment_count,
        COALESCE(SUM(NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric), 0) AS installment_total
      FROM "client_cases" cc
      JOIN "clients" c ON c.id = cc.client_id
      LEFT JOIN "employees" e ON e.id = cc.employee_id
      LEFT JOIN "case_installments" ci ON ci.client_case_id = cc.id
      ${whereSql}
      GROUP BY cc.id, c.id, e.id
      ORDER BY cc.id DESC
      LIMIT 60
    `,
    values,
  );

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Case operations</div>
        <h1>Cases</h1>
        <p>Manage clients, assigned employees, case progress, and custom installments from one workspace.</p>
      </div>
      {canCreate ? <Link className="btn btnPrimary" href="/admin/cases/new"><Plus size={18}/> New Case</Link> : null}
    </div>

    <div className="metricGrid">
      <Metric label="Active cases" value={stats.total.toLocaleString()} icon={<BriefcaseBusiness size={20}/>} />
      <Metric label="Case value" value={money(stats.totalValue)} />
      <Metric label="Received" value={money(stats.paid)} icon={<WalletCards size={20}/>} />
      <Metric label="Outstanding" value={money(stats.remaining)} tone="warn" />
    </div>

    <div className="panel">
      <form className="filterBar">
        <input className="input" name="q" defaultValue={q} placeholder="Search by client, phone, or case category" />
        <select className="input" name="status" defaultValue={status}>
          <option value="">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Process">In Process</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Closed">Closed</option>
        </select>
        <button className="btn">Filter</button>
      </form>
    </div>

    <div className="panel tableWrap">
      <table className="table dataTable">
        <thead><tr><th>Case</th><th>Client</th><th>Assigned To</th><th>Status</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Installments</th><th className="actionColumn">Action</th></tr></thead>
        <tbody>
          {result.rows.map((row) => (
            <tr key={row.id}>
              <td><strong>#{row.id}</strong><div className="muted">{row.caseCategory || "General"} - {formatDate(row.startDate)}</div></td>
              <td><strong>{row.client_name || `${row.firstname} ${row.lastname}`}</strong><div className="muted">{row.phone}</div></td>
              <td>{[row.employee_firstname, row.employee_lastname].filter(Boolean).join(" ") || "-"}</td>
              <td><span className="statusPill">{row.status || "Open"}</span></td>
              <td>{money(row.total)}</td>
              <td>{money(row.total_paid ?? row.installment_total)}</td>
              <td>{money(row.remaining)}</td>
              <td>{row.installment_count}</td>
              <td className="actionColumn"><Link className="btn" href={`/admin/cases/${row.id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length === 0 ? <div className="emptyState">No cases matched your filters.</div> : null}
    </div>
  </>;
}

async function getCaseStats() {
  const result = await getDb().query(`
    SELECT
      COUNT(*)::int AS total,
      COALESCE(SUM(total), 0) AS total_value,
      COALESCE(SUM(total_paid), 0) AS paid,
      COALESCE(SUM(remaining), 0) AS remaining
    FROM "client_cases"
  `);
  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    totalValue: Number(row.total_value || 0),
    paid: Number(row.paid || 0),
    remaining: Number(row.remaining || 0),
  };
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: "warn" }) {
  return <div className={`metricCard ${tone === "warn" ? "metricWarn" : ""}`}>
    <div className="metricTop"><span>{label}</span>{icon}</div>
    <strong>{value}</strong>
  </div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Cases</h1><p className="muted">You do not have permission to access case operations.</p></div>;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
