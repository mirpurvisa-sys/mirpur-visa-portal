import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { assertManualIncome } from "@/lib/studentIncome";
import { getResource } from "@/lib/adminConfig";
import { delegate, formToData, parseRecordWhere } from "@/lib/crud";
import { ResourceForm } from "@/components/ResourceForm";
import { requireUser } from "@/lib/auth";
import { changedFields, recordActivity } from "@/lib/activityLog";
import { canDeleteResource, canEditResource, protectFinanceData, requireResourceAccess, visibleResourceForUser } from "@/lib/permissions";
import { revalidateFinanceCache } from "@/lib/finance";
import { syncCaseTotals } from "@/lib/erp";
import { deleteCaseInstallmentIncome, syncCaseInstallmentIncome } from "@/lib/incomeSync";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{resource:string; id:string}> }){
  const { resource: key, id } = await params;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource) || !canEditResource(user, resource)) {
    return <AccessDenied title={resource.title} message="You do not have permission to edit records in this module." />;
  }
  const visibleResource = visibleResourceForUser(user, resource);
  const userCanDelete = canDeleteResource(user, resource);
  const where = parseRecordWhere(resource, id);
  const row = await delegate(resource.model).findUnique({ where });
  if(!row) notFound();
  if (key === "incomes" && row.student_course && row.student_id) redirect(`/admin/${row.student_course}?edit=${row.student_id}`);
  async function updateAction(formData: FormData){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canEditResource(currentUser, res)) throw new Error("You do not have permission to edit this record.");
    if (res.key === "incomes") await assertManualIncome(Number(id));
    const visibleRes = visibleResourceForUser(currentUser, res);
    const data = protectFinanceData(currentUser, res, await formToData(visibleRes, formData, "edit"), "edit"); delete data.created_at;
    const previous = res.key === "case-installments" ? await delegate(res.model).findUnique({ where: parseRecordWhere(res, id) }) : null;
    const updated = await delegate(res.model).update({ where: parseRecordWhere(res, id), data });
    if (res.key === "case-installments" && updated) {
      await syncCaseInstallmentIncome(Number(updated.id));
      await syncCaseTotals(Number(updated.client_case_id));
      if (previous && Number(previous.client_case_id) !== Number(updated.client_case_id)) await syncCaseTotals(Number(previous.client_case_id));
    }
    if (shouldRevalidateFinance(res.key)) revalidateFinanceCache();
    await recordActivity({
      user: currentUser,
      action: "updated",
      resource: res.key,
      resourceTitle: res.title,
      subjectId: updated?.id ?? id,
      properties: { model: res.model, fields: changedFields(data) },
    });
    redirect(`/admin/${res.key}`);
  }
  async function deleteAction(){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canDeleteResource(currentUser, res)) throw new Error("You do not have permission to delete this record.");
    if (res.key === "incomes") await assertManualIncome(Number(id));
    const deleted = await delegate(res.model).delete({ where: parseRecordWhere(res, id) });
    if (res.key === "case-installments" && deleted) {
      await deleteCaseInstallmentIncome(Number(deleted.id));
      await syncCaseTotals(Number(deleted.client_case_id));
    }
    if (shouldRevalidateFinance(res.key)) revalidateFinanceCache();
    await recordActivity({
      user: currentUser,
      action: "deleted",
      resource: res.key,
      resourceTitle: res.title,
      subjectId: deleted?.id ?? id,
      properties: { model: res.model },
    });
    redirect(`/admin/${res.key}`);
  }
  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Edit</div>
        <h1>Edit {resource.title}</h1>
        <p>Update this record using the database fields available to your role.</p>
      </div>
      <div className="headerActions">
        <Link className="btn" href={`/admin/${resource.key}`}><ArrowLeft size={16}/> Back</Link>
        {userCanDelete ? <form action={deleteAction}><button className="btn dangerButton"><Trash2 size={16}/> Delete</button></form> : null}
      </div>
    </div>
    <ResourceForm resource={visibleResource} row={row} action={updateAction} button="Save Changes" />
  </>;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="panel">
    <h1>{title}</h1>
    <p className="muted">{message}</p>
  </div>;
}

function shouldRevalidateFinance(resourceKey: string) {
  return ["incomes", "expenses", "case-installments", "ielts", "life-skills"].includes(resourceKey);
}
