import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getResource } from "@/lib/adminConfig";
import { delegate, formToData, parseRecordWhere } from "@/lib/crud";
import { ResourceForm } from "@/components/ResourceForm";
import { requireUser } from "@/lib/auth";
import { canDeleteResource, canEditResource, requireResourceAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{resource:string; id:string}> }){
  const { resource: key, id } = await params;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource) || !canEditResource(user, resource)) {
    return <AccessDenied title={resource.title} message="You do not have permission to edit records in this module." />;
  }
  const userCanDelete = canDeleteResource(user, resource);
  const where = parseRecordWhere(resource, id);
  const row = await delegate(resource.model).findUnique({ where });
  if(!row) notFound();
  async function updateAction(formData: FormData){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canEditResource(currentUser, res)) throw new Error("You do not have permission to edit this record.");
    const data = await formToData(res, formData, "edit"); delete data.created_at;
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
  return <><p><Link href={`/admin/${resource.key}`}>Back</Link></p><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h1 style={{fontSize:30,fontWeight:900}}>Edit {resource.title}</h1>{userCanDelete ? <form action={deleteAction}><button className="btn" style={{color:"#dc2626"}}>Delete</button></form> : null}</div><ResourceForm resource={resource} row={row} action={updateAction} button="Save Changes" /></>;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="card" style={{padding:24}}>
    <h1 style={{fontSize:30,fontWeight:900,marginTop:0}}>{title}</h1>
    <p style={{color:"#64748b",marginBottom:0}}>{message}</p>
  </div>;
}
