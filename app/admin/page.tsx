import Link from "next/link";
import { BriefcaseBusiness, CircleDollarSign, UsersRound, WalletCards } from "lucide-react";
import { DashboardLiveWidgets } from "@/components/DashboardLiveWidgets";
import { requireUser } from "@/lib/auth";
import { getResource } from "@/lib/adminConfig";
import { canCreateResource, canViewFinance, canViewResource } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import { money } from "@/lib/erp";

export const dynamic = "force-dynamic";

type MoneyPoint = {
  month: string;
  label: string;
  income: number;
  expense: number;
};

type DashboardItem = {
  id: number;
  title: string;
  category: string | null;
  description: string | null;
  meta: string | null;
};

export default async function AdminDashboard() {
  const user = await requireUser();
  const showFinance = canViewFinance(user);
  const canSeeActivities = canViewResource(user, "daily-activities");
  const canSeeLeads = canViewResource(user, "leads");
  const dailyResource = getResource("daily-activities");
  const leadsResource = getResource("leads");
  const canCreateActivity = Boolean(dailyResource && canCreateResource(user, dailyResource));
  const canCreateLead = Boolean(leadsResource && canCreateResource(user, leadsResource));

  const [stats, moneyTrail, activities, leads] = await Promise.all([
    getDashboardStats(showFinance),
    showFinance ? getMoneyTrail() : Promise.resolve([]),
    canSeeActivities ? getTodayActivities() : Promise.resolve([]),
    canSeeLeads ? getClientLeads() : Promise.resolve([]),
  ]);

  return <div className="dashboardPage">
    <div className="summaryGrid">
      <SummaryCard icon={<UsersRound size={54} />} title="Clients" lines={[`Total: ${stats.clients}`, `Today's: ${stats.todayClients}`]} href={canViewResource(user, "clients") ? "/admin/clients" : "/admin/cases"} />
      {showFinance ? <>
        <SummaryCard icon={<WalletCards size={58} />} title="Total Income" lines={[`This Month: ${money(stats.monthIncome)}`, `Today's: ${money(stats.todayIncome)}`]} href="/admin/payments?tab=income" />
        <SummaryCard icon={<CircleDollarSign size={58} />} title="Total Expense" lines={[`This Month: ${money(stats.monthExpense)}`, `Today's: ${money(stats.todayExpense)}`]} href="/admin/payments?tab=expense" />
      </> : null}
      <SummaryCard icon={<BriefcaseBusiness size={56} />} title="Employees" lines={[`Total: ${stats.employees}`]} href="/admin/employees" />
    </div>

    <div className={showFinance ? "dashboardGrid" : "dashboardGrid single"}>
      {showFinance ? <section className="portalCard chartCard">
        <div className="chartHead">
          <div>
            <h2>Money Trail</h2>
            <p>Month-wise total income and expense</p>
          </div>
          <div className="chartLegend">
            <span><i className="blueDot" /> Income</span>
            <span><i className="yellowDot" /> Expense</span>
          </div>
        </div>
        <MoneyTrailChart data={moneyTrail} />
      </section> : null}

      <DashboardLiveWidgets />
    </div>

    <div className="lowerGrid">
      <DashboardList
        title="Today's Activity"
        href="/admin/daily-activities/new"
        actionLabel="Add Task"
        canCreate={canCreateActivity}
        items={activities}
        emptyText={canSeeActivities ? "No activity scheduled for today." : "You do not have access to activities."}
      />
      <DashboardList
        title="Clients Leads"
        href="/admin/leads/new"
        actionLabel="Add Lead"
        canCreate={canCreateLead}
        items={leads}
        emptyText={canSeeLeads ? "No client leads found." : "You do not have access to client leads."}
      />
    </div>
  </div>;
}

function SummaryCard({ icon, title, lines, href }: { icon: React.ReactNode; title: string; lines: string[]; href: string }) {
  return <Link href={href} className="summaryCard">
    <div className="summaryIcon">{icon}</div>
    <div>
      <h2>{title}</h2>
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  </Link>;
}

function MoneyTrailChart({ data }: { data: MoneyPoint[] }) {
  const width = 720;
  const height = 360;
  const left = 70;
  const right = 32;
  const top = 42;
  const bottom = 56;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.income, point.expense]));
  const axisMax = niceAxisMax(maxValue);
  const incomePoints = data.map((point, index) => pointToSvg(point.income, index, data.length, axisMax, left, top, chartWidth, chartHeight));
  const expensePoints = data.map((point, index) => pointToSvg(point.expense, index, data.length, axisMax, left, top, chartWidth, chartHeight));
  const gridValues = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];
  const hoverWidth = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
  const tooltipWidth = 122;
  const tooltipHeight = 74;

  return <div className="moneyChart" aria-label="Money trail chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img">
      <title>Month-wise income and expense from database records</title>
      <g stroke="#e2e8f0" strokeWidth="1">
        {gridValues.map((value) => {
          const y = valueToY(value, axisMax, top, chartHeight);
          return <line key={value} x1={left} y1={y} x2={width - right} y2={y} />;
        })}
      </g>
      <g>
        {gridValues.map((value) => <text key={value} x={8} y={valueToY(value, axisMax, top, chartHeight) + 4}>{compactMoney(value)}</text>)}
      </g>
      {data.length ? <>
        <polyline points={incomePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#2da9df" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={expensePoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#f9b800" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {incomePoints.map((point, index) => <circle key={`income-${data[index].month}`} cx={point.x} cy={point.y} r="6" fill="#5f5364" />)}
        {expensePoints.map((point, index) => <circle key={`expense-${data[index].month}`} cx={point.x} cy={point.y} r="6" fill="#5f5364" />)}
        {data.map((point, index) => {
          const x = pointToSvg(0, index, data.length, axisMax, left, top, chartWidth, chartHeight).x;
          return <text key={point.month} x={x - 32} y={342}>{point.label}</text>;
        })}
        {data.map((point, index) => {
          const incomePoint = incomePoints[index];
          const expensePoint = expensePoints[index];
          const tooltip = tooltipPosition(incomePoint.x, Math.min(incomePoint.y, expensePoint.y), tooltipWidth, tooltipHeight, width, left, right, top);
          const hoverX = clamp(incomePoint.x - hoverWidth / 2, left, width - right - hoverWidth);
          return <g key={`tooltip-${point.month}`} className="chartHoverPoint" tabIndex={0} aria-label={`${point.label}: income ${formatChartMoney(point.income)}, expense ${formatChartMoney(point.expense)}`}>
            <rect className="chartHoverZone" x={hoverX} y={top} width={hoverWidth} height={chartHeight} rx="4" />
            <g className="moneyTooltip" transform={`translate(${tooltip.x} ${tooltip.y})`}>
              <rect width={tooltipWidth} height={tooltipHeight} rx="8" />
              <text className="tooltipTitle" x={tooltipWidth / 2} y="22" textAnchor="middle">{point.label}</text>
              <text className="tooltipIncome" x="12" y="44">Income: {formatChartMoney(point.income)}</text>
              <text className="tooltipExpense" x="12" y="62">Expense: {formatChartMoney(point.expense)}</text>
            </g>
          </g>;
        })}
      </> : <text x="245" y="185">No income or expense records yet</text>}
    </svg>
  </div>;
}

function DashboardList({ title, href, actionLabel, canCreate, items, emptyText }: { title: string; href: string; actionLabel: string; canCreate: boolean; items: DashboardItem[]; emptyText: string }) {
  return <section className="portalCard dashboardListCard">
    <div className="sectionHeader">
      <h2>{title}</h2>
      {canCreate ? <Link className="btn btnPrimary" href={href}>{actionLabel}</Link> : null}
    </div>
    <div className="dashboardList">
      {items.length ? items.map((item) => <Link key={item.id} href={title.includes("Activity") ? `/admin/daily-activities/${item.id}/edit` : `/admin/leads/${item.id}/edit`} className="dashboardListItem">
        <strong>{item.title}</strong>
        <span>{[item.category, item.meta].filter(Boolean).join(" - ") || "Open record"}</span>
        {item.description ? <p>{item.description}</p> : null}
      </Link>) : <p className="muted">{emptyText}</p>}
    </div>
  </section>;
}

async function getDashboardStats(includeFinance: boolean) {
  const result = await getDb().query(`
    SELECT
      (SELECT COUNT(*)::int FROM "clients") AS clients,
      (SELECT COUNT(*)::int FROM "clients" WHERE created_at::date = CURRENT_DATE) AS today_clients,
      (SELECT COUNT(*)::int FROM "employees") AS employees
  `);
  const base = result.rows[0] || {};
  if (!includeFinance) {
    return { clients: Number(base.clients || 0), todayClients: Number(base.today_clients || 0), employees: Number(base.employees || 0), monthIncome: 0, todayIncome: 0, monthExpense: 0, todayExpense: 0 };
  }

  const finance = await getDb().query(`
    SELECT
      (SELECT COALESCE(SUM("Amount"), 0) FROM "incomes" WHERE date_trunc('month', "Date") = date_trunc('month', CURRENT_DATE)) AS month_income,
      (SELECT COALESCE(SUM("Amount"), 0) FROM "incomes" WHERE "Date"::date = CURRENT_DATE) AS today_income,
      (SELECT COALESCE(SUM("Amount"), 0) FROM "expenses" WHERE date_trunc('month', "Date") = date_trunc('month', CURRENT_DATE)) AS month_expense,
      (SELECT COALESCE(SUM("Amount"), 0) FROM "expenses" WHERE "Date"::date = CURRENT_DATE) AS today_expense
  `);
  const row = finance.rows[0] || {};
  return {
    clients: Number(base.clients || 0),
    todayClients: Number(base.today_clients || 0),
    employees: Number(base.employees || 0),
    monthIncome: Number(row.month_income || 0),
    todayIncome: Number(row.today_income || 0),
    monthExpense: Number(row.month_expense || 0),
    todayExpense: Number(row.today_expense || 0),
  };
}

async function getMoneyTrail(): Promise<MoneyPoint[]> {
  const result = await getDb().query(`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', CURRENT_DATE) - interval '4 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      )::date AS month
    ),
    income AS (
      SELECT date_trunc('month', "Date")::date AS month, COALESCE(SUM("Amount"), 0) AS amount
      FROM "incomes"
      WHERE "Date" >= date_trunc('month', CURRENT_DATE) - interval '4 months'
      GROUP BY 1
    ),
    expense AS (
      SELECT date_trunc('month', "Date")::date AS month, COALESCE(SUM("Amount"), 0) AS amount
      FROM "expenses"
      WHERE "Date" >= date_trunc('month', CURRENT_DATE) - interval '4 months'
      GROUP BY 1
    )
    SELECT
      to_char(m.month, 'YYYY-MM') AS month,
      to_char(m.month, 'FMMonth-YYYY') AS label,
      COALESCE(income.amount, 0) AS income,
      COALESCE(expense.amount, 0) AS expense
    FROM months m
    LEFT JOIN income ON income.month = m.month
    LEFT JOIN expense ON expense.month = m.month
    ORDER BY m.month ASC
  `);

  return result.rows.map((row) => ({
    month: row.month,
    label: row.label,
    income: Number(row.income || 0),
    expense: Number(row.expense || 0),
  }));
}

async function getTodayActivities(): Promise<DashboardItem[]> {
  const result = await getDb().query(`
    SELECT id, title, category, priority, description, date_time
    FROM "daily_activities"
    WHERE date_time::date = CURRENT_DATE OR created_at::date = CURRENT_DATE
    ORDER BY date_time ASC NULLS LAST, id DESC
    LIMIT 5
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: textFromValue(row.title, "Untitled activity"),
    category: row.category,
    description: row.description,
    meta: [row.priority, displayDateTime(row.date_time)].filter(Boolean).join(" - "),
  }));
}

async function getClientLeads(): Promise<DashboardItem[]> {
  const result = await getDb().query(`
    SELECT id, title, category, description, created_at
    FROM "client_leads"
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 5
  `);

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: textFromValue(row.title, "Untitled lead"),
    category: row.category,
    description: row.description,
    meta: displayDate(row.created_at),
  }));
}

function pointToSvg(value: number, index: number, length: number, axisMax: number, left: number, top: number, chartWidth: number, chartHeight: number) {
  const x = left + (length <= 1 ? chartWidth / 2 : (chartWidth / (length - 1)) * index);
  return { x, y: valueToY(value, axisMax, top, chartHeight) };
}

function valueToY(value: number, axisMax: number, top: number, chartHeight: number) {
  return top + chartHeight - (Math.max(0, value) / axisMax) * chartHeight;
}

function niceAxisMax(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatChartMoney(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function tooltipPosition(x: number, y: number, width: number, height: number, chartWidth: number, left: number, right: number, top: number) {
  return {
    x: clamp(x - width / 2, left, chartWidth - right - width),
    y: Math.max(top + 4, y - height - 12),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function displayDate(value: unknown) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function displayDateTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}
