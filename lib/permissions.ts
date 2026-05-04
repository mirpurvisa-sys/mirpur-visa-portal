import type { CurrentUser } from "./auth";
import { resources, type Resource } from "./adminConfig";

const ROLE_RESOURCES: Record<string, string[]> = {
  admin: resources.map((resource) => resource.key),
  accountant: ["incomes", "expenses", "cases", "clients"],
  case_officer: ["clients", "cases", "appointments", "documents", "families"],
  receptionist: ["clients", "appointments", "leads", "visitors"],
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
  if (resource.key === "incomes") return user.permissionSlugs.includes("add-installment") || user.roleSlugs.includes("accountant");
  if (resource.key === "expenses") return user.roleSlugs.includes("accountant");
  if (resource.key === "appointments") return user.roleSlugs.includes("receptionist");
  if (resource.key === "ielts" || resource.key === "life-skills") return user.roleSlugs.includes("teacher");

  return false;
}

export function canEditResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (!canViewResource(user, resource.key)) return false;

  if (resource.key === "clients") return user.permissionSlugs.includes("edit-clients");
  if (resource.key === "cases") return user.permissionSlugs.includes("assign-cases") || user.roleSlugs.includes("case_officer");
  if (resource.key === "incomes" || resource.key === "expenses") return user.roleSlugs.includes("accountant");
  if (resource.key === "appointments") return user.roleSlugs.includes("receptionist");
  if (resource.key === "documents" || resource.key === "families") return user.roleSlugs.includes("case_officer");
  if (resource.key === "ielts" || resource.key === "life-skills") return user.roleSlugs.includes("teacher");

  return false;
}

export function canDeleteResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (!canViewResource(user, resource.key)) return false;
  if (resource.key === "clients") return user.permissionSlugs.includes("delete-client");
  return user.permissionSlugs.includes("delete");
}
