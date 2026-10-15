import type { CurrentUser } from "./auth";
import { resources, type Resource } from "./adminConfig";

const ROLE_RESOURCES: Record<string, string[]> = {
  admin: resources.map((resource) => resource.key),
  accountant: ["cases", "clients", "appointments", "incomes", "expenses", "case-installments", "employees", "ielts", "life-skills"],
  case_officer: ["clients", "cases", "appointments", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

const ROLE_CREATE_RESOURCES: Record<string, string[]> = {
  accountant: ["incomes", "expenses", "case-installments"],
  case_officer: ["cases", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

const ROLE_EDIT_RESOURCES: Record<string, string[]> = {
  accountant: ["incomes", "expenses", "case-installments"],
  case_officer: ["cases", "documents", "families", "reminders"],
  receptionist: ["clients", "appointments", "leads", "visitors", "daily-activities", "reminders"],
  teacher: ["ielts", "life-skills"],
};

const FINANCE_RESOURCE_KEYS = new Set(["incomes", "expenses", "case-installments"]);
const FINANCE_FIELD_NAMES = new Set([
  "amount",
  "advance",
  "appointmentstatus",
  "fee",
  "remaining",
  "salary",
  "total",
  "total_paid",
]);

export function isAdmin(user: CurrentUser) {
  return user.roleSlugs.includes("admin") || user.userType?.toLowerCase() === "admin";
}

export function isCaseOfficer(user: CurrentUser) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return user.roleSlugs.some((role) => normalize(role) === "case_officer") || normalize(user.userType || "") === "case_officer";
}

export function hasOwnCaseAccessOnly(user: CurrentUser) {
  return !isAdmin(user) && isCaseOfficer(user);
}

export function canAssignCases(user: CurrentUser) {
  return isAdmin(user);
}

export function canViewFinance(user: CurrentUser) {
  return isAdmin(user) || isAccountant(user);
}

export function isAccountant(user: CurrentUser) {
  return user.roleSlugs.some((role) => role.trim().toLowerCase() === "accountant") || user.userType?.trim().toLowerCase() === "accountant";
}

export function canManageCaseFinance(user: CurrentUser) {
  return canViewResource(user, "cases") && canViewFinance(user);
}

// Operational case work is always tied to assignment; global resource flags cannot grant it.
export function canWorkOnCase(user: CurrentUser, assignedUserId: unknown) {
  return isAdmin(user) || ((isCaseOfficer(user) || isAccountant(user)) && Number(assignedUserId) === user.id);
}

export function canManageAppointmentPayments(user: CurrentUser) {
  return canViewFinance(user) || user.roleSlugs.includes("receptionist");
}

export function isFinanceFieldName(fieldName: string) {
  const normalized = fieldName.toLowerCase();
  return FINANCE_FIELD_NAMES.has(normalized) || normalized.endsWith("_fee");
}

export function visibleResourceForUser(user: CurrentUser, resource: Resource): Resource {
  if (canViewFinance(user)) return resource;
  return {
    ...resource,
    columns: resource.columns.filter((column) => !isFinanceFieldName(column)),
    searchFields: resource.searchFields.filter((field) => !isFinanceFieldName(field)),
    fields: resource.fields.filter((field) => !isFinanceFieldName(field.name)),
  };
}

export function protectFinanceData(user: CurrentUser, resource: Resource, data: Record<string, unknown>, mode: "create" | "edit") {
  if (canViewFinance(user)) return data;
  const protectedData = { ...data };

  for (const field of resource.fields) {
    if (!isFinanceFieldName(field.name)) continue;
    if (mode === "edit") {
      delete protectedData[field.name];
      continue;
    }
    if (field.required || field.requiredOnCreate) {
      protectedData[field.name] = defaultFinanceFieldValue(field);
    }
  }

  return protectedData;
}

export function allowedResources(user: CurrentUser) {
  return resources.filter((resource) => canViewResource(user, resource.key));
}

export function canViewResource(user: CurrentUser, resourceKey: string) {
  if (isAdmin(user)) return true;
  if (isCaseOfficer(user) && !isAccountant(user)) return resourceKey === "cases";
  if (isAccountant(user) && ROLE_RESOURCES.accountant.includes(resourceKey)) return true;
  if (FINANCE_RESOURCE_KEYS.has(resourceKey)) return false;
  return user.roleSlugs.some((role) => ROLE_RESOURCES[role]?.includes(resourceKey));
}

export function requireResourceAccess(user: CurrentUser, resource: Resource) {
  if (!canViewResource(user, resource.key)) return false;
  return true;
}

export function canSearch(user: CurrentUser) {
  return isAdmin(user) || isAccountant(user) || user.permissionSlugs.includes("global-search");
}

export function canCreateResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (isAccountant(user) && ROLE_CREATE_RESOURCES.accountant.includes(resource.key)) return true;
  if (FINANCE_RESOURCE_KEYS.has(resource.key)) return false;
  if (!canViewResource(user, resource.key)) return false;

  if (resource.key === "cases") return canAssignCases(user);

  return hasRoleResource(user, resource.key, ROLE_CREATE_RESOURCES);
}

export function canEditResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (isAccountant(user) && ROLE_EDIT_RESOURCES.accountant.includes(resource.key)) return true;
  if (FINANCE_RESOURCE_KEYS.has(resource.key)) return false;
  if (!canViewResource(user, resource.key)) return false;

  if (resource.key === "clients") return user.permissionSlugs.includes("edit-clients");
  if (resource.key === "cases") return canAssignCases(user);

  return hasRoleResource(user, resource.key, ROLE_EDIT_RESOURCES);
}

export function canDeleteResource(user: CurrentUser, resource: Resource) {
  if (isAdmin(user)) return true;
  if (resource.key === "cases") return false;
  if (isAccountant(user) && FINANCE_RESOURCE_KEYS.has(resource.key)) return true;
  if (FINANCE_RESOURCE_KEYS.has(resource.key)) return false;
  if (!canViewResource(user, resource.key)) return false;
  if (resource.key === "clients") return user.permissionSlugs.includes("delete-client");
  return user.permissionSlugs.includes("delete");
}

function hasRoleResource(user: CurrentUser, resourceKey: string, map: Record<string, string[]>) {
  return user.roleSlugs.some((role) => map[role]?.includes(resourceKey));
}

function defaultFinanceFieldValue(field: Resource["fields"][number]) {
  const name = field.name.toLowerCase();
  if (name === "appointmentstatus") return "Unpaid";
  if (field.type === "number" || field.type === "checkbox") return 0;
  if (field.type === "datetime" || field.type === "date") return null;
  return "0";
}
