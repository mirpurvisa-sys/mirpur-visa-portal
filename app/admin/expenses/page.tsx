import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/activityLog";
import { getResource } from "@/lib/adminConfig";
import { getDb } from "@/lib/db";
import { canCreateResource, canDeleteResource, canViewFinance } from "@/lib/permissions";
import { dateValue, money, nextExpenseVoucherNo, numberValue, text, today } from "@/lib/erp";

export const dynamic = "force-dynamic";

type ExpenseSearchParams = {
  month?: string;
  new?: string;
  q?: string;
  view?: string;
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<ExpenseSearchParams> }) {
  const user = await requireUser();
  if (!canViewFinance(user)) return <AccessDenied />;

  const params = await searchParams;
  const query = params.q?.trim() || "";
  const month = validMonth(params.month) ? params.month! : "";
  const viewId = numericId(params.view);
  const expenseResource = getResource("expenses");
  const canCreateExpense = expenseResource ? canCreateResource(user, expenseResource) : false;
  const canDeleteExpense = expenseResource ? canDeleteResource(user, expenseResource) : false;
  const [total, expenses, nextVoucherNo, selectedExpense] = await Promise.all([
    getExpenseTotal(month),
    getExpenses(query, month),
    canCreateExpense ? nextExpenseVoucherNo() : Promise.resolve(""),
    viewId ? getExpense(viewId) : Promise.resolve(null),
  ]);

  async function addExpense(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("expenses");
    if (!resource || !canCreateResource(currentUser, resource)) throw new Error("You do not have permission to add expenses.");

    const voucherNo = await nextExpenseVoucherNo();
    const amount = numberValue(formData, "Amount");
    const created = await getDb().query(
      `INSERT INTO "expenses" (voucher_no, "Title", "ExpenseType", "Amount", "Description", "Date", created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING id`,
      [voucherNo, text(formData, "Title"), text(formData, "ExpenseType", "Others"), amount, text(formData, "Description", "--"), dateValue(formData, "Date")],
    );
    await recordActivity({
      user: currentUser,
      action: "created",
      resource: "expenses",
      resourceTitle: "Expense",
      subjectId: created.rows[0]?.id,
      properties: { voucher_no: voucherNo, amount },
    });
    redirect("/admin/expenses");
  }

  async function deleteExpense(formData: FormData) {
    "use server";
    const currentUser = await requireUser();
    const resource = getResource("expenses");
    if (!resource || !canDeleteResource(currentUser, resource)) throw new Error("You do not have permission to delete expenses.");

    const expenseId = numberValue(formData, "expense_id");
    const deleted = await getDb().query(`DELETE FROM "expenses" WHERE id=$1 RETURNING id, voucher_no, "Amount" AS amount`, [expenseId]);
    await recordActivity({
      user: currentUser,
      action: "deleted",
      resource: "expenses",
      resourceTitle: "Expense",
      subjectId: deleted.rows[0]?.id ?? expenseId,
      properties: { voucher_no: deleted.rows[0]?.voucher_no, amount: deleted.rows[0]?.amount },
    });
    redirect("/admin/expenses");
  }

  return <>
    <div className="workflowGrid financeTabs">
      <Link className="workflowCard active" href="/admin/expenses"><strong>Expense</strong><span>Expense records</span></Link>
      <Link className="workflowCard" href="/admin/payments?tab=income"><strong>Income</strong><span>Income records</span></Link>
    </div>

    <form className="moneyToolbar financeToolbar" action="/admin/expenses">
      <strong>Total: <span>{money(total)}</span></strong>
      <div className="headerActions">
        <button className="btn btnYellow" type="submit">Date Range</button>
        <input className="input monthInput" name="month" type="month" defaultValue={month || today().slice(0, 7)} aria-label="Date range month" />
        {canCreateExpense ? <Link className="btn btnPrimary" href="/admin/expenses?new=expense"><Plus size={16}/> Add Expense</Link> : null}
      </div>
    </form>

    {canCreateExpense && params.new === "expense" ? <ExpenseFormModal action={addExpense} nextVoucherNo={nextVoucherNo} /> : null}
    {selectedExpense ? <ExpenseDetailModal expense={selectedExpense} /> : null}

    <section className="panel tableWrap">
      <div className="tableTools">
        <div className="headerActions">
          <label>Show <select className="input smallSelect" defaultValue="10" aria-label="Entries per page"><option>10</option><option>25</option><option>50</option></select> entries</label>
          <button className="btn" type="button">PDF</button>
          <button className="btn" type="button">Excel</button>
        </div>
        <form className="searchLabel" action="/admin/expenses">
          {month ? <input type="hidden" name="month" value={month} /> : null}
          <label>Search:<input className="input" name="q" defaultValue={query} aria-label="Search expenses" /></label>
        </form>
      </div>

      <table className="table dataTable expenseTable">
        <thead><tr>
          <th>Serial #</th>
          <th>Voucher No.</th>
          <th>Expense Name</th>
          <th>Expense Type</th>
          <th>Amount</th>
          <th>Description</th>
          <th>Date</th>
          <th className="actionColumn">Actions</th>
        </tr></thead>
        <tbody>{expenses.map((item, index) => <tr key={item.id}>
          <td>{index + 1}</td>
          <td>{item.voucher_no || "-"}</td>
          <td>{item.Title}</td>
          <td>{item.ExpenseType}</td>
          <td>{money(item.Amount)}</td>
          <td>{item.Description || "--"}</td>
          <td>{formatDate(item.Date)}</td>
          <td className="actionColumn">
            <div className="actionStack">
              <Link className="actionBtn view" href={`/admin/expenses?view=${item.id}`} aria-label="View expense"><Eye size={18}/></Link>
              <Link className="actionBtn edit" href={`/admin/expenses/${item.id}/edit`} aria-label="Edit expense"><Pencil size={18}/></Link>
              {canDeleteExpense ? <form action={deleteExpense}>
                <input type="hidden" name="expense_id" value={item.id} />
                <button className="actionBtn delete" aria-label="Delete expense"><Trash2 size={18}/></button>
              </form> : <span className="muted">Locked</span>}
            </div>
          </td>
        </tr>)}</tbody>
      </table>
      {expenses.length === 0 ? <div className="emptyState">No expense records found.</div> : null}
      <div className="tableFoot">Showing 1 to {Math.min(expenses.length, 10)} of {expenses.length} entries <span>Previous&nbsp;&nbsp;<b>1</b>&nbsp;&nbsp;Next</span></div>
    </section>
  </>;
}

async function getExpenseTotal(month: string) {
  const values: unknown[] = [];
  const where = monthWhere(month, values);
  const result = await getDb().query(`SELECT COALESCE(SUM("Amount"), 0) AS total FROM "expenses" ${where}`, values);
  return Number(result.rows[0]?.total || 0);
}

async function getExpenses(query: string, month: string) {
  const values: unknown[] = [];
  const filters: string[] = [];
  if (query) {
    values.push(`%${query}%`);
    filters.push(`(
      voucher_no ILIKE $${values.length}
      OR "Title" ILIKE $${values.length}
      OR "ExpenseType" ILIKE $${values.length}
      OR COALESCE("Description", '') ILIKE $${values.length}
    )`);
  }
  if (month) filters.push(monthFilter(month, values));
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await getDb().query(`
    SELECT id::text AS id, voucher_no, "Title", "ExpenseType", "Amount", "Description", "Date"
    FROM "expenses"
    ${where}
    ORDER BY NULLIF(substring(trim(voucher_no) from '([0-9]+)$'), '')::integer DESC NULLS LAST, id DESC
    LIMIT 80
  `, values);
  return result.rows;
}

async function getExpense(id: number) {
  const result = await getDb().query(`
    SELECT id::text AS id, voucher_no, "Title", "ExpenseType", "Amount", "Description", "Date"
    FROM "expenses"
    WHERE id=$1
    LIMIT 1
  `, [id]);
  return result.rows[0] ?? null;
}

function ExpenseFormModal({ action, nextVoucherNo }: { action: (formData: FormData) => Promise<void>; nextVoucherNo: string }) {
  return <div className="modalOverlay">
    <form action={action} className="mvcModal expenseModal">
      <Link className="modalClose" href="/admin/expenses" aria-label="Close">&times;</Link>
      <h2>Add Expense</h2>
      <div className="modalDivider" />
      <div className="modalGrid">
        <Field name="voucher_no" label="Voucher no" defaultValue={nextVoucherNo} readOnly />
        <Field name="Title" label="Expense Name" required />
        <Field name="ExpenseType" label="Expense Type" defaultValue="Others" required />
        <Field name="Amount" label="Amount" type="number" required />
        <Field name="Date" label="Date" type="date" defaultValue={today()} required />
        <Textarea name="Description" label="Description" required />
      </div>
      <button className="btn btnPrimary modalSubmit"><Plus size={16}/> Add Expense</button>
    </form>
  </div>;
}

function ExpenseDetailModal({ expense }: { expense: any }) {
  return <div className="modalOverlay">
    <div className="mvcModal expenseModal">
      <Link className="modalClose" href="/admin/expenses" aria-label="Close">&times;</Link>
      <h2>Expense Detail</h2>
      <div className="modalDivider" />
      <div className="expenseDetailGrid">
        <Detail label="Expense Name" value={expense.Title} />
        <Detail label="Voucher Number" value={expense.voucher_no} />
        <Detail label="Expense Type" value={expense.ExpenseType} />
        <Detail label="Amount" value={money(expense.Amount)} />
        <Detail label="Date" value={formatDate(expense.Date)} />
        <Detail label="Description" value={expense.Description || "--"} />
      </div>
    </div>
  </div>;
}

function Detail({ label, value }: { label: string; value: unknown }) {
  return <div className="detailPair"><span>{label}</span><strong>{value ? String(value) : "--"}</strong></div>;
}

function Field({ name, label, type = "text", required, defaultValue, readOnly }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; readOnly?: boolean }) {
  return <div><label className="label">{label}</label><input className="input" name={name} type={type} required={required} defaultValue={defaultValue} readOnly={readOnly} step={type === "number" ? "0.01" : undefined}/></div>;
}

function Textarea({ name, label, required }: { name: string; label: string; required?: boolean }) {
  return <div style={{gridColumn:"1 / -1"}}><label className="label">{label}</label><textarea className="input" name={name} rows={4} required={required}/></div>;
}

function AccessDenied() {
  return <div className="panel"><h1>Expenses</h1><p className="muted">You do not have permission to access expense records.</p></div>;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function validMonth(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function numericId(value: string | undefined) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function monthWhere(month: string, values: unknown[]) {
  if (!month) return "";
  return `WHERE ${monthFilter(month, values)}`;
}

function monthFilter(month: string, values: unknown[]) {
  values.push(`${month}-01`);
  const index = values.length;
  return `"Date" >= $${index}::date AND "Date" < ($${index}::date + INTERVAL '1 month')`;
}
