"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { completeAssignedCase, reopenCompletedCase } from "@/lib/caseStatus";
import { canViewResource } from "@/lib/permissions";
import { recordActivity } from "@/lib/activityLog";

export async function completeCase(formData: FormData) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) throw new Error("You do not have permission to complete cases.");
  const caseId = Number(formData.get("case_id"));
  const changed = await completeAssignedCase(getDb(), caseId, user.id);
  if (changed) recordActivity({ user, action: "updated", resource: "cases", resourceTitle: "Case completed", subjectId: caseId });
  revalidatePath("/admin", "layout");
}

export async function undoCaseCompletion(formData: FormData) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) throw new Error("You do not have permission to reopen cases.");
  const caseId = Number(formData.get("case_id"));
  const changed = await reopenCompletedCase(getDb(), caseId, user.id);
  if (changed) recordActivity({ user, action: "updated", resource: "cases", resourceTitle: "Case completion undone", subjectId: caseId });
  revalidatePath("/admin", "layout");
}
