import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { getResource } from "@/lib/adminConfig";
import { delegate, formToData, parseRecordWhere } from "@/lib/crud";
import { ResourceForm } from "@/components/ResourceForm";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, protectFinanceData, requireResourceAccess, visibleResourceForUser } from "@/lib/permissions";

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
  async function updateAction(formData: FormData){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canEditResource(currentUser, res)) throw new Error("You do not have permission to edit this record.");
    const visibleRes = visibleResourceForUser(currentUser, res);
    const data = protectFinanceData(currentUser, res, await formToData(visibleRes, formData, "edit"), "edit"); delete data.created_at;
    await delegate(res.model).update({ where: parseRecordWhere(res, id), data });
    redirect(`/admin/${res.key}`);
  }
  async function deleteAction(){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canDeleteResource(currentUser, res)) throw new Error("You do not have permission to delete this record.");
    await delegate(res.model).delete({ where: parseRecordWhere(res, id) });
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
