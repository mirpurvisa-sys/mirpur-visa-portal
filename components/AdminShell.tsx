import { Sidebar } from "./Sidebar";
import { TopbarDropdowns, type TopbarNotification, type TopbarSearchItem } from "./TopbarDropdowns";
import type { CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canViewFinance, canViewResource } from "@/lib/permissions";

export async function AdminShell({children, user}:{children:React.ReactNode; user: CurrentUser}){
  const displayName = `${user.firstname} ${user.lastname}`.trim() || "Admin";
  const [profileHref, searchItems, notifications] = await Promise.all([
    getProfileHref(user),
    getTopbarSearchItems(user),
    getTopbarNotifications(user),
  ]);

  return <div className="mvcShell">
    <Sidebar user={user}/>
    <header className="topBar">
      <h1>Welcome <span>{displayName}</span></h1>
      <TopbarDropdowns displayName={displayName} notifications={notifications} profileHref={profileHref} searchItems={searchItems} />
    </header>
    <main className="mvcMain">{children}</main>
  </div>
}

async function getProfileHref(user: CurrentUser) {
  if (!canViewResource(user, "employees")) return "/admin";
  const result = await getDb().query(`SELECT id FROM "employees" WHERE user_id=$1 LIMIT 1`, [user.id]);
  return result.rows[0]?.id ? `/admin/employees/${result.rows[0].id}` : "/admin/employees";
}

async function getTopbarSearchItems(user: CurrentUser): Promise<TopbarSearchItem[]> {
  const items: TopbarSearchItem[] = [
    { title: "Dashboard", subtitle: "Portal overview", href: "/admin", group: "Navigation" },
  ];

  if (canViewResource(user, "clients")) items.push({ title: "Client Management", subtitle: "Clients, appointments and cases", href: "/admin/clients", group: "Navigation" });
  if (canViewResource(user, "appointments")) items.push({ title: "Appointments", subtitle: "Booked consultations", href: "/admin/appointments", group: "Navigation" });
  if (canViewResource(user, "cases")) items.push({ title: "Cases", subtitle: "Client case files", href: "/admin/cases", group: "Navigation" });
  if (canViewResource(user, "employees")) items.push({ title: "Team Management", subtitle: "Employees and assigned cases", href: "/admin/employees", group: "Navigation" });
  if (canViewFinance(user)) items.push({ title: "Money Trail", subtitle: "Income and expenses", href: "/admin/payments", group: "Navigation" });
  if (canViewResource(user, "reminders")) items.push({ title: "Reminders", subtitle: "Upcoming follow ups", href: "/admin/reminders", group: "Navigation" });
  if (canViewResource(user, "life-skills")) items.push({ title: "Life Skills Students", subtitle: "Student management", href: "/admin/life-skills", group: "Navigation" });
  if (canViewResource(user, "ielts")) items.push({ title: "IELTS Students", subtitle: "Student management", href: "/admin/ielts", group: "Navigation" });

  const dynamicItems = await Promise.all([
    canViewResource(user, "clients") ? getClientSearchItems() : Promise.resolve([]),
    canViewResource(user, "cases") ? getCaseSearchItems() : Promise.resolve([]),
    canViewResource(user, "appointments") ? getAppointmentSearchItems() : Promise.resolve([]),
    canViewResource(user, "employees") ? getEmployeeSearchItems() : Promise.resolve([]),
  ]);

  return [...items, ...dynamicItems.flat()];
}

async function getClientSearchItems(): Promise<TopbarSearchItem[]> {
  const result = await getDb().query(`
    SELECT id, ref_id, firstname, lastname, phone
    FROM "clients"
    ORDER BY id DESC
    LIMIT 8
  `);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Client #${row.id}`;
    return {
      title: name,
      subtitle: [row.ref_id, row.phone].filter(Boolean).join(" - ") || "Client record",
      href: `/admin/clients?q=${encodeURIComponent(name)}`,
      group: "Recent Clients",
    };
  });
}

async function getCaseSearchItems(): Promise<TopbarSearchItem[]> {
  const result = await getDb().query(`
    SELECT id, client_name, "caseCategory", status
    FROM "client_cases"
    ORDER BY id DESC
    LIMIT 8
  `);
  return result.rows.map((row) => ({
    title: row.client_name || `Case #${row.id}`,
    subtitle: [row.caseCategory, row.status].filter(Boolean).join(" - ") || `Case #${row.id}`,
    href: `/admin/cases/${row.id}`,
    group: "Recent Cases",
  }));
}

async function getAppointmentSearchItems(): Promise<TopbarSearchItem[]> {
  const result = await getDb().query(`
    SELECT a.id, a.category, a.appointmentdate, c.firstname, c.lastname, c.phone
    FROM "appointments" a
    JOIN "clients" c ON c.id = a.client_id
    ORDER BY a.appointmentdate DESC, a.id DESC
    LIMIT 8
  `);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Appointment #${row.id}`;
    return {
      title: name,
      subtitle: [displayDateTime(row.appointmentdate), row.category, row.phone].filter(Boolean).join(" - "),
      href: `/admin/appointments?q=${row.id}`,
      group: "Recent Appointments",
    };
  });
}

async function getEmployeeSearchItems(): Promise<TopbarSearchItem[]> {
  const result = await getDb().query(`
    SELECT id, firstname, lastname, designation, phone
    FROM "employees"
    ORDER BY id DESC
    LIMIT 8
  `);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Employee #${row.id}`;
    return {
      title: name,
      subtitle: [row.designation, row.phone].filter(Boolean).join(" - ") || "Employee profile",
      href: `/admin/employees/${row.id}`,
      group: "Team",
    };
  });
}

async function getTopbarNotifications(user: CurrentUser): Promise<TopbarNotification[]> {
  const [cases, appointments, reminders] = await Promise.all([
    canViewResource(user, "cases") ? getCaseNotifications() : Promise.resolve([]),
    canViewResource(user, "appointments") ? getAppointmentNotifications() : Promise.resolve([]),
    canViewResource(user, "reminders") ? getReminderNotifications() : Promise.resolve([]),
  ]);

  return [...cases, ...appointments, ...reminders]
    .sort((left, right) => right.sortTime - left.sortTime)
    .slice(0, 12)
    .map(({ sortTime, ...notification }) => notification);
}

async function getCaseNotifications(): Promise<Array<TopbarNotification & { sortTime: number }>> {
  const result = await getDb().query(`
    SELECT id, client_name, "caseCategory", created_at
    FROM "client_cases"
    ORDER BY created_at DESC NULLS LAST, id DESC
    LIMIT 8
  `);
  return result.rows.map((row) => ({
    id: `case-${row.id}`,
    type: "Case",
    title: "Case",
    message: `Attention! New Case started with ID: ${row.id}${row.client_name ? ` for ${row.client_name}` : ""}`,
    href: `/admin/cases/${row.id}`,
    time: displayDateTime(row.created_at),
    sortTime: toTime(row.created_at),
  }));
}

async function getAppointmentNotifications(): Promise<Array<TopbarNotification & { sortTime: number }>> {
  const result = await getDb().query(`
    SELECT a.id, a.appointmentdate, a.category, c.firstname, c.lastname
    FROM "appointments" a
    JOIN "clients" c ON c.id = a.client_id
    ORDER BY a.appointmentdate DESC NULLS LAST, a.id DESC
    LIMIT 5
  `);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Client #${row.id}`;
    return {
      id: `appointment-${row.id}`,
      type: "Appointment",
      title: "Appointment",
      message: `${name} has an appointment${row.category ? ` (${row.category})` : ""}`,
      href: `/admin/appointments?q=${row.id}`,
      time: displayDateTime(row.appointmentdate),
      sortTime: toTime(row.appointmentdate),
    };
  });
}

async function getReminderNotifications(): Promise<Array<TopbarNotification & { sortTime: number }>> {
  const result = await getDb().query(`
    SELECT id, title, category, date
    FROM "reminders"
    ORDER BY date DESC NULLS LAST, id DESC
    LIMIT 5
  `);
  return result.rows.map((row) => ({
    id: `reminder-${row.id}`,
    type: "Reminder",
    title: "Reminder",
    message: row.title || row.category || `Reminder #${row.id}`,
    href: `/admin/reminders/${row.id}/edit`,
    time: displayDate(row.date),
    sortTime: toTime(row.date),
  }));
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

function toTime(value: unknown) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
