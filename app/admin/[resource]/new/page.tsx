import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getResource } from "@/lib/adminConfig";
import { delegate, formToData } from "@/lib/crud";
import { ResourceForm } from "@/components/ResourceForm";
import { requireUser } from "@/lib/auth";
import { canCreateResource, protectFinanceData, requireResourceAccess, visibleResourceForUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewPage({ params }: { params: Promise<{resource:string}> }){
  const { resource: key } = await params;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource) || !canCreateResource(user, resource)) {
    return <AccessDenied title={resource.title} message="You do not have permission to create records in this module." />;
  }
  const visibleResource = visibleResourceForUser(user, resource);
  async function createAction(formData: FormData){
    "use server";
    const res = getResource(key); if(!res) throw new Error("Invalid resource");
    const currentUser = await requireUser();
    if(!canCreateResource(currentUser, res)) throw new Error("You do not have permission to create this record.");
    const visibleRes = visibleResourceForUser(currentUser, res);
    const data = protectFinanceData(currentUser, res, await formToData(visibleRes, formData, "create"), "create");
    await delegate(res.model).create({ data });
    redirect(`/admin/${res.key}`);
  }
  return <>
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Create</div>
        <h1>Add {resource.title}</h1>
        <p>Add a new record using the database fields available to your role.</p>
      </div>
      <Link className="btn" href={`/admin/${resource.key}`}><ArrowLeft size={16}/> Back</Link>
    </div>
    <ResourceForm resource={visibleResource} action={createAction} button="Create Record" />
  </>;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="panel">
    <h1>{title}</h1>
    <p className="muted">{message}</p>
  </div>;
}
