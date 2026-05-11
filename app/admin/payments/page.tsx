import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canViewFinance } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, money, nullableText, numberValue, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

type FinanceTab = "income" | "expense";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (!canViewFinance(user)) return <AccessDenied />;

  const params = await searchParams;
  const activeTab: FinanceTab = params.tab === "expense" ? "expense" : "income";
  const incomeResource = getResource("incomes");
  const expenseResource = getResource("expenses");
  const canCreateIncome = incomeResource ? canCreateResource(user, incomeResource) : false;
  const canCreateExpense = expenseResource ? canCreateResource(user, expenseResource) : false;
  const canDeleteIncome = incomeResource ? canDeleteResource(user, incomeResource) : false;
  const canDeleteExpense = expenseResource ? canDeleteResource(user, expenseResource) : false;
  const [stats, transactions] = await Promise.all([getPaymentStats(), getTransactions(activeTab)]);
  const activeTotal = activeTab === "expense" ? stats.expense : stats.income;
  const activeCreate = activeTab === "expense" ? canCreateExpense : canCreateIncome;

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

  async function addExpense(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("expenses");
    if (!resource || !canCreateResource(currentUser, resource)) throw new Error("You do not have permission to add expenses.");
    await getDb().query(
      `INSERT INTO "expenses" (voucher_no, "Title", "ExpenseType", "Amount", "Description", "Date", created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [nullableText(formData, "voucher_no"), text(formData, "Title"), text(formData, "ExpenseType", "Others"), numberValue(formData, "Amount"), text(formData, "Description", "--"), dateValue(formData, "Date")],
    );
    redirect("/admin/payments?tab=expense");
  }

  async function deleteTransaction(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const type = text(formData, "type") as FinanceTab;
    const id = numberValue(formData, "id");
    if (type === "income") {
      const resource = getResource("incomes");
      if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete income.");
      await getDb().query(`DELETE FROM "incomes" WHERE id=$1`, [id]);
      redirect("/admin/payments?tab=income");
    }
    if (type === "expense") {
      const resource = getResource("expenses");
      if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete expenses.");
      await getDb().query(`DELETE FROM "expenses" WHERE id=$1`, [id]);
      redirect("/admin/payments?tab=expense");
    }
    redirect("/admin/payments");
  }

  return <>
    <div className="workflowGrid">
      <Link className={`workflowCard ${activeTab === "expense" ? "active" : ""}`} href="/admin/payments?tab=expense"><strong>Expense</strong><span>Expense records</span></Link>
      <Link className={`workflowCard ${activeTab === "income" ? "active" : ""}`} href="/admin/payments?tab=income"><strong>Income</strong><span>Income records</span></Link>
    </div>

    <div className="erpHeader">
      <div>
        <div className="eyebrow">Finance</div>
        <h1>{activeTab === "expense" ? "Expenses" : "Income"}</h1>
        <p>{activeTab === "expense" ? "Track operational spending and vouchers." : "Track appointment, service, and case income."}</p>
      </div>
      {activeCreate ? <a className="btn btnPrimary" href="#add-transaction"><Plus size={16}/> {activeTab === "expense" ? "Add Expense" : "Add New Income"}</a> : null}
    </div>

    <div className="moneyToolbar">
      <strong>Total: <span>{money(activeTotal)}</span></strong>
      <div className="headerActions">
        <button className="btn btnYellow" type="button">Date Range</button>
        <input className="input monthInput" type="month" defaultValue={new Date().toISOString().slice(0, 7)} aria-label="Date range month" />
      </div>
    </div>

    {activeTab === "income" && canCreateIncome ? <details id="add-transaction" className="panel formSection createDrawer">
      <summary className="sectionHeader"><h2>Add New Income</h2><span className="badge">Income record</span></summary>
      <form action={addIncome} className="formSection">
        <div className="formGrid">
          <Field name="Title" label="Income Name" required />
          <Field name="IncomesType" label="Income Type" defaultValue="Appointment" required />
          <Field name="Amount" label="Amount" type="number" required />
          <Field name="Date" label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <Field name="foreign_id" label="Reference / case ID" />
          <Textarea name="Description" label="Description" />
        </div>
        <button className="btn btnPrimary"><Plus size={16}/> Add Income</button>
      </form>
    </details> : null}

    {activeTab === "expense" && canCreateExpense ? <details id="add-transaction" className="panel formSection createDrawer">
      <summary className="sectionHeader"><h2>Add Expense</h2><span className="badge">Expense voucher</span></summary>
      <form action={addExpense} className="formSection">
        <div className="formGrid">
          <Field name="voucher_no" label="Voucher no" />
          <Field name="Title" label="Expense Name" required />
          <Field name="ExpenseType" label="Expense Type" defaultValue="Others" required />
          <Field name="Amount" label="Amount" type="number" required />
          <Field name="Date" label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <Textarea name="Description" label="Description" required />
        </div>
        <button className="btn btnPrimary"><Plus size={16}/> Add Expense</button>
      </form>
    </details> : null}

    <section className="panel tableWrap">
      <div className="tableTools">
        <div className="headerActions">
          <label>Show <select className="input smallSelect" defaultValue="10" aria-label="Entries per page"><option>10</option><option>25</option><option>50</option></select> entries</label>
          <button className="btn" type="button">PDF</button>
          <button className="btn" type="button">Excel</button>
        </div>
        <label className="searchLabel">Search:<input className="input" aria-label="Search finance records" /></label>
      </div>

      <table className="table dataTable">
        <thead><tr>
          <th>Serial #</th>
          {activeTab === "expense" ? <th>Voucher No.</th> : null}
          <th>{activeTab === "expense" ? "Expense Name" : "Title"}</th>
          <th>{activeTab === "expense" ? "Expense Type" : "Income Type"}</th>
          <th>Amount</th>
          <th>Description</th>
          <th>Date</th>
          <th className="actionColumn">Actions</th>
        </tr></thead>
        <tbody>{transactions.map((item, index) => <tr key={`${item.type}-${item.id}`}>
          <td>{index + 1}</td>
          {activeTab === "expense" ? <td>{item.reference || "-"}</td> : null}
          <td>{item.title}</td>
          <td>{item.category}</td>
          <td>{money(item.amount)}</td>
          <td>{item.description || "--"}</td>
          <td>{formatDate(item.date)}</td>
          <td className="actionColumn"><div className="actionStack">
            <Link className="actionBtn edit" href={`/admin/${activeTab === "expense" ? "expenses" : "incomes"}/${item.id}/edit`} aria-label={`Edit ${activeTab}`}><Pencil size={18}/></Link>
            {canDeleteForItem(item.type, canDeleteIncome, canDeleteExpense) ? <form action={deleteTransaction}><input type="hidden" name="type" value={item.type}/><input type="hidden" name="id" value={item.id}/><button className="actionBtn delete" aria-label={`Delete ${activeTab}`}><Trash2 size={18}/></button></form> : <span className="muted">Locked</span>}
          </div></td>
        </tr>)}</tbody>
      </table>
      {transactions.length === 0 ? <div className="emptyState">No {activeTab} records found.</div> : null}
      <div className="tableFoot">Showing 1 to {Math.min(transactions.length, 10)} of {transactions.length} entries <span>Previous&nbsp;&nbsp;<b>1</b>&nbsp;&nbsp;Next</span></div>
    </section>
  </>;
}

async function getPaymentStats() {
  const result = await getDb().query(`
    SELECT
      (SELECT COALESCE(SUM("Amount"), 0) FROM "incomes") AS income,
      (SELECT COALESCE(SUM("Amount"), 0) FROM "expenses") AS expense
  `);
  const row = result.rows[0] || {};
  return { income: Number(row.income || 0), expense: Number(row.expense || 0) };
}

async function getTransactions(type: FinanceTab) {
  if (type === "expense") {
    const result = await getDb().query(`
      SELECT 'expense' AS type, id::text AS id, "Title" AS title, "ExpenseType" AS category, "Amount" AS amount, "Description" AS description, "Date" AS date, voucher_no AS reference
      FROM "expenses"
      ORDER BY "Date" DESC NULLS LAST, id DESC
      LIMIT 80
    `);
    return result.rows;
  }

  const result = await getDb().query(`
    SELECT 'income' AS type, id::text AS id, "Title" AS title, "IncomesType" AS category, "Amount" AS amount, "Description" AS description, "Date" AS date, foreign_id AS reference
    FROM "incomes"
    ORDER BY "Date" DESC NULLS LAST, id DESC
    LIMIT 80
  `);
  return result.rows;
}

function Field({ name, label, type = "text", required, defaultValue }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string }) {
  return <div><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} step={type === "number" ? "0.01" : undefined}/></div>;
}

function Textarea({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4} required={required}/></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Payments</h1><p className="muted">You do not have permission to access finance records.</p></div>;
}

function canDeleteForItem(type: string, canDeleteIncome: boolean, canDeleteExpense: boolean) {
  return (type === "income" && canDeleteIncome) || (type === "expense" && canDeleteExpense);
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
