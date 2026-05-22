import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canViewFinance } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, money, nullableText, numberValue, text, today } from "@/lib/erp";
import { getReceivedIncomeTotal } from "@/lib/finance";

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
    await getDb().query(
      `INSERT INTO "incomes" ("Title", "IncomesType", "Amount", "Description", "Date", foreign_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [text(formData, "Title"), text(formData, "IncomesType", "Appointment"), numberValue(formData, "Amount"), nullableText(formData, "Description"), dateValue(formData, "Date"), nullableText(formData, "foreign_id")],
    );
    redirect("/admin/payments?tab=income");
  }

  async function deleteIncome(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("incomes");
    if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete income.");
    await getDb().query(`DELETE FROM "incomes" WHERE id=$1`, [numberValue(formData, "income_id")]);
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
        <p>Track received appointment, service, and case income.</p>
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
          <th>Date</th>
          <th className="actionColumn">Actions</th>
        </tr></thead>
        <tbody>{transactions.map((item, index) => <tr key={item.id}>
          <td>{index + 1}</td>
          <td>{item.title}</td>
          <td>{item.category}</td>
          <td>{money(item.amount)}</td>
          <td>{item.description || "--"}</td>
          <td>{formatDate(item.date)}</td>
          <td className="actionColumn"><div className="actionStack">
            <Link className="actionBtn edit" href={`/admin/incomes/${item.id}/edit`} aria-label="Edit income"><Pencil size={18}/></Link>
            {canDeleteIncome ? <form action={deleteIncome}>
              <input type="hidden" name="income_id" value={item.id}/>
              <button className="actionBtn delete" aria-label="Delete income"><Trash2 size={18}/></button>
            </form> : <span className="muted">Locked</span>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {transactions.length === 0 ? <div className="emptyState">No income records found.</div> : null}
      <div className="tableFoot">Showing 1 to {Math.min(transactions.length, 10)} of {transactions.length} entries <span>Previous&nbsp;&nbsp;<b>1</b>&nbsp;&nbsp;Next</span></div>
    </section>
  </>;
}

async function getPaymentStats() {
  return { income: await getReceivedIncomeTotal() };
}

async function getTransactions() {
  const result = await getDb().query(`
    SELECT id::text AS id, "Title" AS title, "IncomesType" AS category, "Amount" AS amount, "Description" AS description, "Date" AS date, foreign_id AS reference
    FROM "incomes"
    ORDER BY "Date" DESC NULLS LAST, id DESC
    LIMIT 80
  `);
  return result.rows;
}

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
