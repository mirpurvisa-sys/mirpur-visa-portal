import type { CurrentUser } from "./auth";
import { hasOwnCaseAccessOnly } from "./permissions";

// Returns a mandatory SQL predicate. The account ID is always from the session.
export function caseVisibilitySql(user: CurrentUser, alias: string, values: any[]) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid case alias.");
  if (!hasOwnCaseAccessOnly(user)) return "TRUE";
  values.push(user.id);
  return `EXISTS (SELECT 1 FROM employees case_owner WHERE case_owner.id=${alias}.employee_id AND case_owner.user_id=$${values.length})`;
}
