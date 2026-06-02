import Link from "next/link";
import Image from "next/image";
import { Activity, BellRing, BriefcaseBusiness, CalendarClock, GraduationCap, LayoutDashboard, UsersRound, WalletCards } from "lucide-react";
import { SidebarActiveLink } from "./SidebarActiveLink";
import type { CurrentUser } from "@/lib/auth";
import { allowedResources, canViewFinance, canViewResource } from "@/lib/permissions";

export function Sidebar({ user }: { user: CurrentUser }){
  const visibleResources = allowedResources(user);
  const workflowModules = [
    { href: "/admin/cases", label: "Client Management", icon: <BriefcaseBusiness size={18}/>, show: canViewResource(user, "cases") || canViewResource(user, "clients") },
    { href: "/admin/appointments", label: "Appointments", icon: <CalendarClock size={18}/>, show: canViewResource(user, "appointments") },
    { href: "/admin/expenses", label: "Money Trail", icon: <WalletCards size={18}/>, show: canViewFinance(user) },
    { href: "/admin/employees", label: "Team Management", icon: <UsersRound size={18}/>, show: canViewResource(user, "employees") },
  ].filter((item) => item.show);
  const workflowResourceKeys = new Set(["clients", "cases", "appointments", "employees", "incomes", "expenses", "case-installments"]);
  const tableResources = visibleResources.filter((resource) => !workflowResourceKeys.has(resource.key));
  const studentResource = tableResources.find((resource) => resource.key === "life-skills") || tableResources.find((resource) => resource.key === "ielts");
  const preferredTables = [
    { key: "activity-log", label: "Activity Log", icon: <Activity size={18}/> },
    { key: "reminders", label: "Reminders", icon: <BellRing size={18}/> },
  ];
  const tableModules = preferredTables
    .map((item) => ({ ...item, resource: tableResources.find((resource) => resource.key === item.key) }))
    .filter((item) => item.resource);
  if (studentResource) {
    tableModules.push({ key: studentResource.key, label: "Students", icon: <GraduationCap size={18}/>, resource: studentResource });
  }

  return <aside className="sideBar">
    <Link href="/admin" className="brandMark" aria-label="MVC Dashboard">
      <Image src="/mvc-logo.jpg" alt="Mirpur Visa Consultant" width={96} height={96} priority />
    </Link>
    <nav className="sideNav">
      <SidebarActiveLink href="/admin" exact label="Dashboard"><LayoutDashboard size={18}/></SidebarActiveLink>
      {workflowModules.map((item) => (
        <SidebarActiveLink key={item.href} href={item.href} label={item.label}>{item.icon}</SidebarActiveLink>
      ))}
      {tableModules.map((item) => (
        <SidebarActiveLink
          key={item.key}
          href={`/admin/${item.key}`}
          label={item.label}
          matchHrefs={item.key === studentResource?.key ? ["/admin/life-skills", "/admin/ielts"] : undefined}
        >
          {item.icon}
        </SidebarActiveLink>
      ))}
    </nav>
  </aside>
}
