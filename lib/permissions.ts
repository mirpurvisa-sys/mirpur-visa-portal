import type { CurrentUser } from "./auth";
import { resources, type Resource } from "./adminConfig";

const ROLE_RESOURCES: Record<string, string[]> = {
  admin: resources.map((resource) => resource.key),
  accountant: ["incomes", "expenses", "case-installments", "cases", "clients"],
  case_officer: ["clients", "cases", "case-installments", "appointments", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

const ROLE_CREATE_RESOURCES: Record<string, string[]> = {
  accountant: ["incomes", "expenses", "case-installments"],
  case_officer: ["cases", "case-installments", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

const ROLE_EDIT_RESOURCES: Record<string, string[]> = {
  accountant: ["incomes", "expenses", "case-installments"],
  case_officer: ["cases", "case-installments", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

export function isAdmin(user: CurrentUser) {
  return user.roleSlugs.includes("admin") || user.userType?.toLowerCase() === "admin";
}

export function allowedResources(user: CurrentUser) {
  return resources.filter((resource) => canViewResource(user, resource.key));
}

export function canViewResource(user: CurrentUser, resourceKey: string) {
  if (isAdmin(user)) return true;
  return user.roleSlugs.some((role) => ROLE_RESOURCES[role]?.includes(resourceKey));
}

export function requireResourceAccess(user: CurrentUser, resource: Resource) {
  if (!canViewResource(user, resource.key)) return false;
  return true;
}

export function canSearch(user: CurrentUser) {
  return isAdmin(user) || user.permissionSlugs.includes("global-search");
}

export function canCreateResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (!canViewResource(user, resource.key)) return false;

  if (resource.key === "cases") return user.permissionSlugs.includes("start-cases");
  if (resource.key === "case-installments") return user.permissionSlugs.includes("add-installment");
  if (resource.key === "incomes") return user.permissionSlugs.includes("add-installment") || hasRoleResource(user, resource.key, ROLE_CREATE_RESOURCES);

  return hasRoleResource(user, resource.key, ROLE_CREATE_RESOURCES);
}

export function canEditResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (!canViewResource(user, resource.key)) return false;

  if (resource.key === "clients") return user.permissionSlugs.includes("edit-clients");
  if (resource.key === "cases") return user.permissionSlugs.includes("assign-cases") || user.roleSlugs.includes("case_officer");
  if (resource.key === "case-installments") return user.permissionSlugs.includes("add-installment");

  return hasRoleResource(user, resource.key, ROLE_EDIT_RESOURCES);
}

export function canDeleteResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (!canViewResource(user, resource.key)) return false;
  if (resource.key === "clients") return user.permissionSlugs.includes("delete-client");
  return user.permissionSlugs.includes("delete");
}

function hasRoleResource(user: CurrentUser, resourceKey: string, map: Record<string, string[]>) {
  return user.roleSlugs.some((role) => map[role]?.includes(resourceKey));
}
