import Link from "next/link";
import { notFound } from "next/navigation";
import { getResource } from "@/lib/adminConfig";
import { buildWhere, delegate, formatCellValue, recordKey } from "@/lib/crud";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canEditResource, canSearch, requireResourceAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ResourcePage({ params, searchParams }: { params: Promise<{resource:string}>, searchParams: Promise<{q?:string}> }){
  const { resource: key } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource)) return <AccessDenied title={resource.title} message="You do not have permission to access this module." />;

  const userCanSearch = canSearch(user);
  const userCanCreate = canCreateResource(user, resource);
  const userCanEdit = canEditResource(user, resource);
  const q = userCanSearch ? sp.q || "" : "";
  let rows:any[] = [];
  let count = 0;
  try {
    const where = buildWhere(resource, q);
    count = await delegate(resource.model).count({ where });
    rows = await delegate(resource.model).findMany({ where, take: 50, orderBy: { [resource.primaryKey[0] || "id"]: "desc" } });
  } catch(e:any) {
    return <div className="card" style={{padding:24}}><h1>{resource.title}</h1><p>Database error. Check the Supabase connection in <b>.env</b>.</p><pre>{String(e.message || e)}</pre></div>
  }
  return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,marginBottom:20}}>
      <div><h1 style={{fontSize:30,fontWeight:900,margin:0}}>{resource.title}</h1><p style={{color:"#64748b"}}>{count.toLocaleString()} records found</p></div>
      {userCanCreate ? <Link className="btn btnPrimary" href={`/admin/${resource.key}/new`}>+ Add New</Link> : null}
    </div>
    {userCanSearch ? <div className="card" style={{padding:16,marginBottom:16}}>
      <form style={{display:"flex",gap:10}}><input className="input" name="q" defaultValue={q} placeholder={`Search ${resource.title}...`} /><button className="btn">Search</button></form>
    </div> : null}
    <div className="card tableWrap"><table className="table dataTable"><thead><tr>{resource.columns.map(c => <th key={c}>{c}</th>)}<th className="actionColumn">Action</th></tr></thead><tbody>
      {rows.map((row:any) => {
        const key = recordKey(resource, row);
        return <tr key={key}>{resource.columns.map(c => <td key={c}>{formatCellValue(c, row[c])}</td>)}<td className="actionColumn">{userCanEdit ? <Link className="btn" href={`/admin/${resource.key}/${key}/edit`}>Edit</Link> : <span style={{color:"#94a3b8"}}>View only</span>}</td></tr>;
      })}
    </tbody></table></div>
  </>;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="card" style={{padding:24}}>
    <h1 style={{fontSize:30,fontWeight:900,marginTop:0}}>{title}</h1>
    <p style={{color:"#64748b",marginBottom:0}}>{message}</p>
  </div>;
}
