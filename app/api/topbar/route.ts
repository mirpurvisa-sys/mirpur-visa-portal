import { NextResponse } from "next/server";
import type { CurrentUser } from "@/lib/auth";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getCaseNotificationFeed } from "@/lib/caseNotifications";
import { buildClientSearch, clientReferenceSql, clientSearchOrderSql } from "@/lib/clientSearch";
import { canViewFinance, canViewResource } from "@/lib/permissions";
import type { TopbarSearchItem } from "@/components/TopbarDropdowns";

export const dynamic = "force-dynamic";

type TopbarScope = "all" | "notifications" | "profile" | "search";

export async function GET(request: Request) {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const scope = topbarScope(params.get("scope"));
  const query = (params.get("q") || "").trim();
  const [profileHref, searchItems, notifications] = await Promise.all([
    scope === "all" || scope === "profile" ? getProfileHref(user) : Promise.resolve(undefined),
    scope === "all" || scope === "search" ? getTopbarSearchItems(user, query) : Promise.resolve(undefined),
    scope === "all" || scope === "notifications" ? getTopbarNotifications(user) : Promise.resolve(undefined),
  ]);
  const clientSearchHref = (scope === "all" || scope === "search") && query && canViewResource(user, "clients")
    ? `/admin/clients?q=${encodeURIComponent(query)}`
    : undefined;

  return NextResponse.json(
    { profileHref, searchItems, notifications, clientSearchHref },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

function topbarScope(value: string | null): TopbarScope {
  return value === "notifications" || value === "profile" || value === "search" ? value : "all";
}

async function getProfileHref(user: CurrentUser) {
  if (!canViewResource(user, "employees")) return "/admin";
  const result = await getDb().query(`SELECT id FROM "employees" WHERE user_id=$1 LIMIT 1`, [user.id]);
  return result.rows[0]?.id ? `/admin/employees/${result.rows[0].id}` : "/admin/employees";
}

async function getTopbarSearchItems(user: CurrentUser, query: string): Promise<TopbarSearchItem[]> {
  const items: TopbarSearchItem[] = [
    { title: "Dashboard", subtitle: "Portal overview", href: "/admin", group: "Navigation" },
  ];

  if (canViewResource(user, "clients")) {
    items.push({ title: "Client Management", subtitle: "Clients, appointments and cases", href: "/admin/clients", group: "Navigation" });
  }
  if (canViewResource(user, "appointments")) {
    items.push({ title: "Appointments", subtitle: "Booked consultations", href: "/admin/appointments", group: "Navigation" });
  }
  if (canViewResource(user, "cases")) {
    items.push({ title: "Cases", subtitle: "Client case files", href: "/admin/cases", group: "Navigation" });
  }
  if (canViewResource(user, "employees")) {
    items.push({ title: "Team Management", subtitle: "Employees and assigned cases", href: "/admin/employees", group: "Navigation" });
  }
  if (canViewFinance(user)) {
    items.push({ title: "Expenses", subtitle: "Expense vouchers and records", href: "/admin/expenses", group: "Navigation" });
    items.push({ title: "Income", subtitle: "Income records", href: "/admin/payments?tab=income", group: "Navigation" });
  }
  if (canViewResource(user, "reminders")) {
    items.push({ title: "Reminders", subtitle: "Upcoming follow ups", href: "/admin/reminders", group: "Navigation" });
  }
  if (canViewResource(user, "life-skills")) {
    items.push({ title: "Life Skills Students", subtitle: "Student management", href: "/admin/life-skills", group: "Navigation" });
  }
  if (canViewResource(user, "ielts")) {
    items.push({ title: "IELTS Students", subtitle: "Student management", href: "/admin/ielts", group: "Navigation" });
  }

  const dynamicItems = await Promise.all([
    canViewResource(user, "clients") ? getClientSearchItems(query) : Promise.resolve([]),
    canViewResource(user, "cases") ? getCaseSearchItems(query) : Promise.resolve([]),
    canViewResource(user, "appointments") ? getAppointmentSearchItems(query) : Promise.resolve([]),
    canViewResource(user, "employees") ? getEmployeeSearchItems(query) : Promise.resolve([]),
  ]);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const navigationItems = items.filter((item) => words.every((word) => `${item.title} ${item.subtitle}`.toLowerCase().includes(word)));
  return [...navigationItems, ...dynamicItems.flat()];
}

async function getClientSearchItems(query: string): Promise<TopbarSearchItem[]> {
  const search = buildClientSearch(query);
  const searchOrder = clientSearchOrderSql(query);
  const result = await getDb().query(`
    SELECT c.id, ${clientReferenceSql()} AS reference, c.firstname, c.lastname, c.phone, c.phone2, c.email, c.cnic, c.city,
      (SELECT status FROM client_cases WHERE client_id=c.id ORDER BY id DESC LIMIT 1) AS case_status
    FROM "clients" c
    ${search.condition ? `WHERE ${search.condition}` : ""}
    ORDER BY ${searchOrder ? `${searchOrder}, ` : ""}c.id DESC
    LIMIT 8
  `, search.values);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Client #${row.id}`;
    return {
      title: name,
      subtitle: [`ID ${row.id}`, row.reference ? `Ref ${row.reference}` : "", [row.phone, row.phone2].filter(Boolean).join(" / "), row.email, row.cnic, row.city].filter(Boolean).join(" - "),
      href: `/admin/clients?view_client=${row.id}`,
      group: query ? "Clients" : "Recent Clients",
      caseStatus: row.case_status || undefined,
    };
  });
}

async function getCaseSearchItems(query: string): Promise<TopbarSearchItem[]> {
  const search = buildClientSearch(query, "c", 1, ["cc.id::text", "cc.client_name", 'cc."caseCategory"', "cc.status"]);
  const searchOrder = clientSearchOrderSql(query);
  const result = await getDb().query(`
    SELECT cc.id, cc.client_name, cc."caseCategory", cc.status, c.firstname, c.lastname
    FROM "client_cases" cc
    LEFT JOIN "clients" c ON c.id = cc.client_id
    ${search.condition ? `WHERE ${search.condition}` : ""}
    ORDER BY ${searchOrder ? `${searchOrder}, ` : ""}cc.id DESC
    LIMIT 8
  `, search.values);
  return result.rows.map((row) => ({
    title: row.client_name || `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Case #${row.id}`,
    subtitle: [`Case #${row.id}`, row.caseCategory, row.status].filter(Boolean).join(" - "),
    href: `/admin/cases/${row.id}`,
    group: query ? "Cases" : "Recent Cases",
    caseStatus: row.status || "In Progress",
  }));
}

async function getAppointmentSearchItems(query: string): Promise<TopbarSearchItem[]> {
  const search = buildClientSearch(query, "c", 1, ["a.id::text", "a.category", "a.appointmentstatus", "a.appointmentdate::text"]);
  const searchOrder = clientSearchOrderSql(query, "c", 1, "a.id::text");
  const result = await getDb().query(`
    SELECT a.id, a.category, a.appointmentdate, c.firstname, c.lastname, c.phone,
      (SELECT status FROM client_cases WHERE appointment_id=a.id ORDER BY id DESC LIMIT 1) AS case_status
    FROM "appointments" a
    JOIN "clients" c ON c.id = a.client_id
    ${search.condition ? `WHERE ${search.condition}` : ""}
    ORDER BY ${searchOrder ? `${searchOrder}, ` : ""}a.appointmentdate DESC, a.id DESC
    LIMIT 8
  `, search.values);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Appointment #${row.id}`;
    return {
      title: name,
      subtitle: [`Appointment #${row.id}`, displayDateTime(row.appointmentdate), row.category, row.phone].filter(Boolean).join(" - "),
      href: `/admin/appointments?q=${row.id}`,
      group: query ? "Appointments" : "Recent Appointments",
      caseStatus: row.case_status || undefined,
    };
  });
}

async function getEmployeeSearchItems(query: string): Promise<TopbarSearchItem[]> {
  const search = buildEmployeeSearch(query);
  const result = await getDb().query(`
    SELECT e.id, e.emp_id, e.firstname, e.lastname, e.designation, e.phone, u.email
    FROM "employees" e
    LEFT JOIN "users" u ON u.id = e.user_id
    ${search.condition ? `WHERE ${search.condition}` : ""}
    ORDER BY e.id DESC
    LIMIT 8
  `, search.values);
  return result.rows.map((row) => {
    const name = `${row.firstname || ""} ${row.lastname || ""}`.trim() || `Employee #${row.id}`;
    return {
      title: name,
      subtitle: [`Employee #${row.id}`, row.emp_id, row.designation, row.phone, row.email].filter(Boolean).join(" - "),
      href: `/admin/employees/${row.id}`,
      group: "Team",
    };
  });
}

function buildEmployeeSearch(query: string) {
  const fields = ["e.id::text", "e.emp_id::text", "e.firstname", "e.lastname", "concat_ws(' ', e.firstname, e.lastname)", "e.phone", "e.designation", "e.city", "e.province", "e.country", "e.address", "u.email", "u.cnic"];
  const identifiers = ["e.id::text", "e.emp_id::text", "e.phone", "u.cnic"];
  const values: string[] = [];
  const input = query.trim();
  const terms = /\d/.test(input) && /^[\d+()./#\-\s]+$/.test(input) ? [input] : input.split(/\s+/).filter(Boolean);
  const conditions = terms.map((word) => {
    values.push(`%${word.replace(/[\\%_]/g, "\\$&")}%`);
    const parameter = `$${values.length}`;
    const matches = fields.map((field) => `${field} ILIKE ${parameter} ESCAPE E'\\\\'`);
    if (/\d/.test(word) && /^[\d+()./#\-\s]+$/.test(word)) {
      const digits = word.replace(/\D/g, "");
      if (digits) {
        values.push(`%${digits}%`);
        matches.push(...identifiers.map((field) => `regexp_replace(${field}, '[^0-9]', '', 'g') LIKE $${values.length}`));
      }
    }
    return `(${matches.join(" OR ")})`;
  });
  return { condition: conditions.join(" AND "), values };
}

async function getTopbarNotifications(user: CurrentUser) {
  if (!canViewResource(user, "cases")) return [];
  return (await getCaseNotificationFeed(getDb(), user.id)).notifications;
}

function displayDateTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`;
}
