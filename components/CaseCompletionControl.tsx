import { completeCase, undoCaseCompletion } from "@/app/admin/cases/actions";
import { isCaseCompleted } from "@/lib/caseStatus";

export function CaseCompletionControl({ caseId, status, assignedToUser, admin = false }: {
  caseId: number; status: unknown; assignedToUser: boolean; admin?: boolean;
}) {
  const completed = isCaseCompleted(status);
  if (completed ? !assignedToUser && !admin : !assignedToUser) return null;
  return <form action={completed ? undoCaseCompletion : completeCase}>
    <input type="hidden" name="case_id" value={caseId} />
    <button className={completed ? "btn" : "btn caseCompleteButton"} type="submit"
      title={completed ? "Return this case to In Progress" : undefined}>
      {completed ? "Undo completed" : "Mark completed"}
    </button>
  </form>;
}
