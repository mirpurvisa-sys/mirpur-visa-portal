import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { notFound } from "next/navigation";
import { getResource } from "@/lib/adminConfig";
import { buildWhere, delegate, formatCellValue, recordKey } from "@/lib/crud";
import { requireUser } from "@/lib/auth";
import { canCreateResource, canEditResource, canSearch, requireResourceAccess, visibleResourceForUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ResourcePage({ params, searchParams }: { params: Promise<{resource:string}>, searchParams: Promise<{q?:string}> }){
  const { resource: key } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const resource = getResource(key);
  if(!resource) notFound();
  if(!requireResourceAccess(user, resource)) return <AccessDenied title={resource.title} message="You do not have permission to access this module." />;
  const visibleResource = visibleResourceForUser(user, resource);

  const userCanSearch = canSearch(user);
  const userCanCreate = canCreateResource(user, resource);
  const userCanEdit = canEditResource(user, resource);
  const q = userCanSearch ? sp.q || "" : "";
  let rows:any[] = [];
  let count = 0;
  try {
    const where = buildWhere(visibleResource, q);
    count = await delegate(resource.model).count({ where });
    rows = await delegate(resource.model).findMany({ where, take: 50, orderBy: { [resource.primaryKey[0] || "id"]: "desc" } });
  } catch(e:any) {
    return <div className="panel"><h1>{resource.title}</h1><p>Database error. Check the Supabase connection in <b>.env</b>.</p><pre>{String(e.message || e)}</pre></div>
  }
  return <>
    <ResourceTabs activeKey={resource.key} />
    <div className="erpHeader">
      <div>
        <div className="eyebrow">Records</div>
        <h1>{resource.title}</h1>
        <p>{count.toLocaleString()} records found</p>
      </div>
      {userCanCreate ? <Link className="btn btnPrimary" href={`/admin/${resource.key}/new`}><Plus size={16}/> Add New</Link> : null}
    </div>
    {userCanSearch ? <div className="panel">
      <form className="filterBar"><input className="input" name="q" defaultValue={q} placeholder={`Search ${resource.title}...`} /><button className="btn">Search</button></form>
    </div> : null}
    <div className="panel tableWrap"><table className="table dataTable"><thead><tr>{visibleResource.columns.map(c => <th key={c}>{c}</th>)}<th className="actionColumn">Action</th></tr></thead><tbody>
      {rows.map((row:any) => {
        const key = recordKey(resource, row);
        return <tr key={key}>{visibleResource.columns.map(c => <td key={c}>{formatCellValue(c, row[c])}</td>)}<td className="actionColumn">{userCanEdit ? <Link className="actionBtn edit" href={`/admin/${resource.key}/${key}/edit`} aria-label={`Edit ${resource.title}`}><Pencil size={18}/></Link> : <span className="muted">View only</span>}</td></tr>;
      })}
    </tbody></table></div>
  </>;
}

function ResourceTabs({ activeKey }: { activeKey: string }) {
  const clientKeys = new Set(["clients", "appointments", "cases"]);
  const financeKeys = new Set(["incomes", "expenses"]);
  const studentKeys = new Set(["life-skills", "ielts"]);

  if (clientKeys.has(activeKey)) {
    return <div className="workflowGrid">
      <Link className={`workflowCard ${activeKey === "clients" ? "active" : ""}`} href="/admin/clients"><strong>Clients</strong><span>Client records</span></Link>
      <Link className={`workflowCard ${activeKey === "appointments" ? "active" : ""}`} href="/admin/appointments"><strong>Appointments</strong><span>Bookings</span></Link>
      <Link className={`workflowCard ${activeKey === "cases" ? "active" : ""}`} href="/admin/cases"><strong>Cases</strong><span>Case files</span></Link>
    </div>;
  }

  if (financeKeys.has(activeKey)) {
    return <div className="workflowGrid">
      <Link className={`workflowCard ${activeKey === "expenses" ? "active" : ""}`} href="/admin/expenses"><strong>Expense</strong><span>Expense records</span></Link>
      <Link className={`workflowCard ${activeKey === "incomes" ? "active" : ""}`} href="/admin/incomes"><strong>Income</strong><span>Income records</span></Link>
    </div>;
  }

  if (studentKeys.has(activeKey)) {
    return <div className="workflowGrid">
      <Link className={`workflowCard ${activeKey === "life-skills" ? "active" : ""}`} href="/admin/life-skills"><strong>Life Skills</strong><span>Life skills students</span></Link>
      <Link className={`workflowCard ${activeKey === "ielts" ? "active" : ""}`} href="/admin/ielts"><strong>IELTS</strong><span>IELTS students</span></Link>
    </div>;
  }

  return null;
}

function AccessDenied({ title, message }: { title: string; message: string }) {
  return <div className="panel">
    <h1>{title}</h1>
    <p className="muted">{message}</p>
  </div>;
}
