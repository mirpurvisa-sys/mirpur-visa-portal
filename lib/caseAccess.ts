import type { CurrentUser } from "./auth";
import { canViewResource } from "./permissions";

// Case readers may browse all cases. Mutations separately require current assignment.
export function caseVisibilitySql(user: CurrentUser, alias: string, _values: any[]) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error("Invalid case alias.");
  return canViewResource(user, "cases") ? "TRUE" : "FALSE";
}
