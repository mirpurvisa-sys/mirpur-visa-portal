import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/activityLog";
import { canCreateResource, canDeleteResource, canViewFinance } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, money, nullableText, numberValue, text, today } from "@/lib/erp";
import { FINANCE_CACHE_TAG, getReceivedIncomeTotal, revalidateFinanceCache } from "@/lib/finance";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!canViewFinance(user)) return <AccessDenied />;

  const params = await searchParams;
  if (params.tab === "expense") redirect("/admin/expenses");

  const incomeResource = getResource("incomes");
  const canCreateIncome = incomeResource ? canCreateResource(user, incomeResource) : false;
  const canDeleteIncome = incomeResource ? canDeleteResource(user, incomeResource) : false;
  const [stats, transactions] = await Promise.all([
    getPaymentStats(),
    getTransactions(),
  ]);

  async function addIncome(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("incomes");
    if (!resource || !canCreateResource(currentUser, resource)) throw new Error("You do not have permission to add income.");
    const amount = numberValue(formData, "Amount");
    const created = await getDb().query(
      `INSERT INTO "incomes" ("Title", "IncomesType", "Amount", "Description", "Date", foreign_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
      [text(formData, "Title"), text(formData, "IncomesType", "Appointment"), amount, nullableText(formData, "Description"), dateValue(formData, "Date"), nullableText(formData, "foreign_id")],
    );
    revalidateFinanceCache();
    await recordActivity({
      user: currentUser,
      action: "created",
      resource: "incomes",
      resourceTitle: "Income",
      subjectId: created.rows[0]?.id,
      properties: { amount },
    });
    redirect("/admin/payments?tab=income");
  }

  async function deleteIncome(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("incomes");
    if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete income.");
    const incomeId = numberValue(formData, "income_id");
    const deleted = await getDb().query(`DELETE FROM "incomes" WHERE id=$1 RETURNING id, "Amount" AS amount`, [incomeId]);
    revalidateFinanceCache();
    await recordActivity({
      user: currentUser,
      action: "deleted",
      resource: "incomes",
      resourceTitle: "Income",
      subjectId: deleted.rows[0]?.id ?? incomeId,
      properties: { amount: deleted.rows[0]?.amount },
    });
    redirect("/admin/payments?tab=income");
  }

  return <>
    <div className="workflowGrid">
      <Link className="workflowCard" href="/admin/expenses"><strong>Expense</strong><span>Expense records</span></Link>
      <Link className="workflowCard active" href="/admin/payments?tab=income"><strong>Income</strong><span>Income records</span></Link>
    </div>

    <div className="erpHeader">
      <div>
        <div className="eyebrow">Finance</div>
        <h1>Income</h1>
        <p>Track every collected earning from cases, appointments, courses, services, and manual income.</p>
      </div>
      {canCreateIncome ? <a className="btn btnPrimary" href="#add-transaction"><Plus size={16}/> Add New Income</a> : null}
    </div>

    <div className="moneyToolbar">
      <strong>Collected Total: <span>{money(stats.income)}</span></strong>
      <div className="headerActions">
        <button className="btn btnYellow" type="button">Date Range</button>
        <input className="input monthInput" type="month" defaultValue={today().slice(0, 7)} aria-label="Date range month" />
      </div>
    </div>

    {canCreateIncome ? <details id="add-transaction" className="panel formSection createDrawer">
      <summary className="sectionHeader"><h2>Add New Income</h2><span className="badge">Income record</span></summary>
      <form action={addIncome} className="formSection">
        <div className="formGrid">
          <Field name="Title" label="Income Name" required />
          <Field name="IncomesType" label="Income Type" defaultValue="Appointment" required />
          <Field name="Amount" label="Amount" type="number" required />
          <Field name="Date" label="Date" type="date" defaultValue={today()} required />
          <Field name="foreign_id" label="Reference / case ID" />
          <Textarea name="Description" label="Description" />
        </div>
        <button className="btn btnPrimary"><Plus size={16}/> Add Income</button>
      </form>
    </details> : null}

    <section className="panel tableWrap">
      <div className="tableTools">
        <div className="headerActions">
          <label>Show <select className="input smallSelect" defaultValue="10" aria-label="Entries per page"><option>10</option><option>25</option><option>50</option></select> entries</label>
          <button className="btn" type="button">PDF</button>
          <button className="btn" type="button">Excel</button>
        </div>
        <label className="searchLabel">Search:<input className="input" aria-label="Search income records" /></label>
      </div>

      <table className="table dataTable">
        <thead><tr>
          <th>Serial #</th>
          <th>Title</th>
          <th>Income Type</th>
          <th>Amount</th>
          <th>Description</th>
          <th>Reference</th>
          <th>Date</th>
          <th className="actionColumn">Actions</th>
        </tr></thead>
        <tbody>{transactions.map((item, index) => <tr key={item.id}>
          <td>{index + 1}</td>
          <td>{item.title}</td>
          <td>{item.category}</td>
          <td>{money(item.amount)}</td>
          <td>{item.description || "--"}</td>
          <td>{item.reference || "--"}</td>
          <td>{formatDate(item.date)}</td>
          <td className="actionColumn"><div className="actionStack">
            {item.source_type === "manual_income" ? <>
              <Link className="actionBtn edit" href={item.href} aria-label="Edit manual income"><Pencil size={18}/></Link>
              {canDeleteIncome ? <form action={deleteIncome}>
                <input type="hidden" name="income_id" value={item.record_id}/>
                <button className="actionBtn delete" aria-label="Delete manual income"><Trash2 size={18}/></button>
              </form> : <span className="muted">Locked</span>}
            </> : <Link className="actionBtn view" href={item.href} aria-label="Open earning source"><Eye size={18}/></Link>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {transactions.length === 0 ? <div className="emptyState">No income records found.</div> : null}
      <div className="tableFoot">Showing latest {transactions.length} collected earnings from all source types <span>Cases&nbsp;&nbsp;Appointments&nbsp;&nbsp;Manual</span></div>
    </section>
  </>;
}

async function getPaymentStats() {
  return { income: await getReceivedIncomeTotal() };
}

const getTransactions = unstable_cache(async function getTransactions() {
  const result = await getDb().query(`
    WITH parsed_case_installments AS (
      SELECT
        ci.id,
        ci.client_case_id,
        ci.name,
        COALESCE(NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric, 0) AS amount,
        COALESCE(ci.time::date, ci.created_at::date) AS received_on
      FROM "case_installments" ci
    ),
    case_earnings AS (
      SELECT
        'case_installment:' || ci.id::text AS id,
        'case_installment' AS source_type,
        ci.id::text AS record_id,
        COALESCE(NULLIF(cc.client_name, ''), NULLIF(trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))), ''), 'Case #' || cc.id::text) AS title,
        'Case Installment' AS category,
        COALESCE(NULLIF(ci.name, ''), 'Case payment') AS description,
        ci.amount,
        COALESCE(ci.received_on, cc.created_at::date) AS date,
        'Case #' || cc.id::text AS reference,
        '/admin/cases/' || cc.id::text AS href,
        ci.id AS sort_id
      FROM parsed_case_installments ci
      JOIN "client_cases" cc ON cc.id = ci.client_case_id
      LEFT JOIN "appointments" a ON a.id = cc.appointment_id
      LEFT JOIN "clients" c ON c.id = cc.client_id
      WHERE ci.amount > 0
        AND NOT (
          ci.name ILIKE 'Appointment%'
          AND regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') <> 'paid'
        )
    ),
    appointment_earnings AS (
      SELECT
        'appointment:' || a.id::text AS id,
        'appointment' AS source_type,
        a.id::text AS record_id,
        COALESCE(NULLIF(trim(concat(COALESCE(c.firstname, ''), ' ', COALESCE(c.lastname, ''))), ''), 'Appointment #' || a.id::text) AS title,
        'Appointment' AS category,
        'Paid appointment fee' AS description,
        a.fee::numeric AS amount,
        COALESCE(a.appointmentdate::date, a.created_at::date) AS date,
        'Appointment #' || a.id::text AS reference,
        '/admin/appointments?edit=' || a.id::text AS href,
        a.id AS sort_id
      FROM "appointments" a
      JOIN "clients" c ON c.id = a.client_id
      WHERE regexp_replace(lower(COALESCE(a.appointmentstatus, '')), '[^a-z]', '', 'g') = 'paid'
        AND COALESCE(a.fee, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM "client_cases" cc
          JOIN parsed_case_installments ci ON ci.client_case_id = cc.id
          WHERE cc.appointment_id = a.id
            AND ci.name ILIKE 'Appointment%'
            AND ci.amount = COALESCE(a.fee, 0)
        )
    ),
    manual_earnings AS (
      SELECT
        'manual_income:' || i.id::text AS id,
        'manual_income' AS source_type,
        i.id::text AS record_id,
        COALESCE(NULLIF(i."Title", ''), 'Income #' || i.id::text) AS title,
        COALESCE(NULLIF(i."IncomesType", ''), 'Income') AS category,
        i."Description" AS description,
        i."Amount"::numeric AS amount,
        i."Date"::date AS date,
        COALESCE(NULLIF(i.foreign_id, ''), 'Income #' || i.id::text) AS reference,
        '/admin/incomes/' || i.id::text || '/edit' AS href,
        i.id AS sort_id
      FROM "incomes" i
      WHERE COALESCE(i."Amount", 0) > 0
        AND COALESCE(i."IncomesType", '') NOT ILIKE 'Appointment%'
        AND COALESCE(i."IncomesType", '') NOT ILIKE 'Case Installment%'
    ),
    all_earnings AS (
      SELECT * FROM case_earnings
      UNION ALL
      SELECT * FROM appointment_earnings
      UNION ALL
      SELECT * FROM manual_earnings
    )
    SELECT id, source_type, record_id, title, category, amount, description, date, reference, href
    FROM all_earnings
    ORDER BY date DESC NULLS LAST, sort_id DESC
    LIMIT 80
  `);
  return result.rows;
}, ["income-all-earnings-v1"], { revalidate: 60, tags: [FINANCE_CACHE_TAG] });

function Field({ name, label, type = "text", required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <div><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} step={type === "number" ? "0.01" : undefined}/></div>;
}

function Textarea({ name, label }: { name: string; label: string }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4}/></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Payments</h1><p className="muted">You do not have permission to access finance records.</p></div>;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
