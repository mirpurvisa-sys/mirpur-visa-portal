import { redirect } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canDeleteResource, canViewResource } from "@/lib/permissions";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { dateValue, money, nullableText, numberValue, text } from "@/lib/erp";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await requireUser();
  const canView = canViewResource(user, "incomes") || canViewResource(user, "expenses") || canViewResource(user, "case-installments");
  if (!canView) return <AccessDenied />;

  const incomeResource = getResource("incomes");
  const expenseResource = getResource("expenses");
  const canCreateIncome = incomeResource ? canCreateResource(user, incomeResource) : false;
  const canCreateExpense = expenseResource ? canCreateResource(user, expenseResource) : false;
  const canDeleteIncome = incomeResource ? canDeleteResource(user, incomeResource) : false;
  const canDeleteExpense = expenseResource ? canDeleteResource(user, expenseResource) : false;

  async function addIncome(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("incomes");
    if (!resource || !canCreateResource(currentUser, resource)) throw new Error("You do not have permission to add income.");
    await getDb().query(
      `INSERT INTO "incomes" ("Title", "IncomesType", "Amount", "Description", "Date", foreign_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [text(formData, "Title"), text(formData, "IncomesType", "General"), numberValue(formData, "Amount"), nullableText(formData, "Description"), dateValue(formData, "Date"), nullableText(formData, "foreign_id")],
    );
    redirect("/admin/payments");
  }

  async function addExpense(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("expenses");
    if (!resource || !canCreateResource(currentUser, resource)) throw new Error("You do not have permission to add expenses.");
    await getDb().query(
      `INSERT INTO "expenses" (voucher_no, "Title", "ExpenseType", "Amount", "Description", "Date", created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [nullableText(formData, "voucher_no"), text(formData, "Title"), text(formData, "ExpenseType", "General"), numberValue(formData, "Amount"), text(formData, "Description", "-"), dateValue(formData, "Date")],
    );
    redirect("/admin/payments");
  }

  async function deleteTransaction(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const type = text(formData, "type");
    const id = numberValue(formData, "id");
    if (type === "income") {
      const resource = getResource("incomes");
      if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete income.");
      await getDb().query(`DELETE FROM "incomes" WHERE id=$1`, [id]);
    }
    if (type === "expense") {
      const resource = getResource("expenses");
      if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete expenses.");
      await getDb().query(`DELETE FROM "expenses" WHERE id=$1`, [id]);
    }
    redirect("/admin/payments");
  }

  const [stats, transactions] = await Promise.all([getPaymentStats(), getTransactions()]);
  const net = stats.income + stats.installments - stats.expense;

  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Finance</div>
        <h1>Payments</h1>
        <p>Track income, expenses, and case installment collections in one finance workspace.</p>
      </div>
    </div>

    <div className="metricGrid">
      <Metric label="Income" value={money(stats.income)} icon={<ArrowUpCircle size={20}/>} />
      <Metric label="Installments" value={money(stats.installments)} />
      <Metric label="Expenses" value={money(stats.expense)} icon={<ArrowDownCircle size={20}/>} tone="warn" />
      <Metric label="Net" value={money(net)} />
    </div>

    <div className="workspaceGrid">
      {canCreateIncome ? <form action={addIncome} className="panel formSection">
        <h2>Add Income</h2>
        <div className="formGrid single">
          <Field name="Title" label="Title" required />
          <Field name="IncomesType" label="Income type" defaultValue="General" required />
          <Field name="Amount" label="Amount" type="number" required />
          <Field name="Date" label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <Field name="foreign_id" label="Reference / case ID" />
          <Textarea name="Description" label="Description" />
        </div>
        <button className="btn btnPrimary"><Plus size={16}/> Add Income</button>
      </form> : null}

      {canCreateExpense ? <form action={addExpense} className="panel formSection">
        <h2>Add Expense</h2>
        <div className="formGrid single">
          <Field name="voucher_no" label="Voucher no" />
          <Field name="Title" label="Title" required />
          <Field name="ExpenseType" label="Expense type" defaultValue="General" required />
          <Field name="Amount" label="Amount" type="number" required />
          <Field name="Date" label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
          <Textarea name="Description" label="Description" required />
        </div>
        <button className="btn btnPrimary"><Plus size={16}/> Add Expense</button>
      </form> : null}
    </div>

    <section className="panel tableWrap">
      <div className="sectionHeader"><h2>Recent Finance Activity</h2><span className="badge">{transactions.length} latest</span></div>
      <table className="table dataTable">
        <thead><tr><th>Type</th><th>Title</th><th>Category</th><th>Amount</th><th>Date</th><th>Reference</th><th className="actionColumn">Action</th></tr></thead>
        <tbody>{transactions.map((item) => <tr key={`${item.type}-${item.id}`}>
          <td><span className={`statusPill ${item.type === "expense" ? "dangerPill" : ""}`}>{item.type}</span></td>
          <td>{item.title}</td>
          <td>{item.category}</td>
          <td>{money(item.amount)}</td>
          <td>{formatDate(item.date)}</td>
          <td>{item.reference || "-"}</td>
          <td className="actionColumn">{(item.type === "income" && canDeleteIncome) || (item.type === "expense" && canDeleteExpense) ? <form action={deleteTransaction}><input type="hidden" name="type" value={item.type}/><input type="hidden" name="id" value={item.id}/><button className="btn dangerButton">Delete</button></form> : <span className="muted">Locked</span>}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}

async function getPaymentStats() {
  const result = await getDb().query(`
    SELECT
      (SELECT COALESCE(SUM("Amount"), 0) FROM "incomes") AS income,
      (SELECT COALESCE(SUM("Amount"), 0) FROM "expenses") AS expense,
      (SELECT COALESCE(SUM(NULLIF(regexp_replace(amount, '[^0-9.-]', '', 'g'), '')::numeric), 0) FROM "case_installments") AS installments
  `);
  const row = result.rows[0] || {};
  return { income: Number(row.income || 0), expense: Number(row.expense || 0), installments: Number(row.installments || 0) };
}

async function getTransactions() {
  const result = await getDb().query(`
    SELECT 'income' AS type, id::text AS id, "Title" AS title, "IncomesType" AS category, "Amount" AS amount, "Date" AS date, foreign_id AS reference
    FROM "incomes"
    UNION ALL
    SELECT 'expense' AS type, id::text AS id, "Title" AS title, "ExpenseType" AS category, "Amount" AS amount, "Date" AS date, voucher_no AS reference
    FROM "expenses"
    UNION ALL
    SELECT 'installment' AS type, ci.id::text AS id, ci.name AS title, 'Case installment' AS category, NULLIF(regexp_replace(ci.amount, '[^0-9.-]', '', 'g'), '')::numeric AS amount, ci.time::date AS date, ci.client_case_id::text AS reference
    FROM "case_installments" ci
    ORDER BY date DESC NULLS LAST
    LIMIT 80
  `);
  return result.rows;
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: "warn" }) {
  return <div className={`metricCard ${tone === "warn" ? "metricWarn" : ""}`}><div className="metricTop"><span>{label}</span>{icon}</div><strong>{value}</strong></div>;
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

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
