import Link from "next/link";
import { resources } from "@/lib/adminConfig";
import { delegate } from "@/lib/crud";
import { requireUser } from "@/lib/auth";
import { allowedResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function safeCount(model:string){ try { return await delegate(model).count(); } catch { return 0; } }

export default async function AdminDashboard(){
  const user = await requireUser();
  const visibleResources = allowedResources(user);
  const counts = await Promise.all(visibleResources.slice(0,12).map(async r => ({...r, count: await safeCount(r.model)})));
  return <>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",marginBottom:24}}>
      <div><h1 style={{fontSize:34,fontWeight:900,margin:0}}>Dashboard</h1><p style={{color:"#64748b"}}>Mirpur Visa Consultant CRM overview</p></div>
      <span className="badge">Supabase Postgres Database</span>
    </div>
    {visibleResources.length === 0 ? <div className="card" style={{padding:24}}>No modules are assigned to your role.</div> : null}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>
      {counts.map(r => <Link href={`/admin/${r.key}`} key={r.key} className="card" style={{padding:20}}>
        <div style={{color:"#64748b",fontWeight:800,fontSize:13}}>{r.title}</div>
        <div style={{fontSize:32,fontWeight:900,marginTop:8}}>{r.count.toLocaleString()}</div>
      </Link>)}
    </div>
  </>;
}
