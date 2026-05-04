import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getResource } from "@/lib/adminConfig";
import { delegate, formToData } from "@/lib/crud";
import { ResourceForm } from "@/components/ResourceForm";
import { requireUser } from "@/lib/auth";
import { canCreateResource, requireResourceAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewPage({ params }: { params: Promise<{resource:string}> }){
  const { resource: key } = await params;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource) || !canCreateResource(user, resource)) {
    return <AccessDenied title={resource.title} message="You do not have permission to create records in this module." />;
  }
  async function createAction(formData: FormData){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canCreateResource(currentUser, res)) throw new Error("You do not have permission to create this record.");
    await delegate(res.model).create({ data: await formToData(res, formData, "create") });
    redirect(`/admin/${res.key}`);
  }
  return <><p><Link href={`/admin/${resource.key}`}>Back</Link></p><h1 style={{fontSize:30,fontWeight:900}}>Add {resource.title}</h1><ResourceForm resource={resource} action={createAction} button="Create Record" /></>;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="card" style={{padding:24}}>
    <h1 style={{fontSize:30,fontWeight:900,marginTop:0}}>{title}</h1>
    <p style={{color:"#64748b",marginBottom:0}}>{message}</p>
  </div>;
}
