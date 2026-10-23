export function isCaseCompleted(status: unknown) {
  return ["completed", "closed"].includes(String(status || "").trim().toLowerCase());
}

export function caseStatusLabel(status: unknown) {
  if (isCaseCompleted(status)) return String(status).trim().toLowerCase() === "closed" ? "Closed" : "Completed";
  const label = String(status || "In Progress").trim();
  return label.toLowerCase() === "in process" ? "In Progress" : label;
}

type CaseDatabase = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };

// Assignment is checked in the same UPDATE that changes status, including concurrent reassignments.
export async function completeAssignedCase(db: CaseDatabase, caseId: number, userId: number) {
  if (!Number.isSafeInteger(caseId) || caseId < 1) throw new Error("Invalid case.");
  const result = await db.query(`
    UPDATE public.client_cases cc SET status='Completed', updated_at=NOW()
    WHERE cc.id=$1
      AND lower(btrim(COALESCE(cc.status,''))) NOT IN ('completed','closed')
      AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id=cc.employee_id AND e.user_id=$2)
    RETURNING cc.id
  `, [caseId, userId]);
  return Boolean(result.rows[0]);
}

// Undo is allowed for the current assignee or an administrator, checked atomically.
export async function reopenCompletedCase(db: CaseDatabase, caseId: number, userId: number) {
  if (!Number.isSafeInteger(caseId) || caseId < 1) throw new Error("Invalid case.");
  const result = await db.query(`
    UPDATE public.client_cases cc SET status='In Progress', updated_at=NOW()
    WHERE cc.id=$1 AND lower(btrim(COALESCE(cc.status,''))) IN ('completed','closed')
      AND (EXISTS (SELECT 1 FROM public.employees e WHERE e.id=cc.employee_id AND e.user_id=$2)
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2 AND (
          lower(COALESCE(u.user_type,''))='admin' OR EXISTS (
            SELECT 1 FROM public.users_roles ur JOIN public.roles r ON r.id=ur.role_id
            WHERE ur.user_id=u.id AND r.slug='admin'))))
    RETURNING cc.id
  `, [caseId, userId]);
  return Boolean(result.rows[0]);
}
