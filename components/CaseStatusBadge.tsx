import { caseStatusLabel, isCaseCompleted } from "@/lib/caseStatus";

export function CaseStatusBadge({ status }: { status: unknown }) {
  return <span className={`caseStatusBadge ${isCaseCompleted(status) ? "caseStatusCompleted" : "caseStatusOngoing"}`}>{caseStatusLabel(status)}</span>;
}
