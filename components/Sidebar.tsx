import Link from "next/link";
import { BriefcaseBusiness, CalendarClock, Database, LayoutDashboard, UsersRound, WalletCards } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { allowedResources, canViewResource } from "@/lib/permissions";

export function Sidebar({ user }: { user: CurrentUser }){
  const visibleResources = allowedResources(user);
  const workflowModules = [
    { href: "/admin/cases", label: "Cases", icon: <BriefcaseBusiness size={18}/>, show: canViewResource(user, "cases") || canViewResource(user, "clients") },
    { href: "/admin/appointments", label: "Appointments", icon: <CalendarClock size={18}/>, show: canViewResource(user, "appointments") },
    { href: "/admin/payments", label: "Payments", icon: <WalletCards size={18}/>, show: canViewResource(user, "incomes") || canViewResource(user, "expenses") || canViewResource(user, "case-installments") },
    { href: "/admin/employees", label: "Employees", icon: <UsersRound size={18}/>, show: canViewResource(user, "employees") },
  ].filter((item) => item.show);
  const workflowResourceKeys = new Set(["cases", "appointments", "employees", "incomes", "expenses", "case-installments"]);
  const tableResources = visibleResources.filter((resource) => !workflowResourceKeys.has(resource.key));

  return <aside style={{width:280, minHeight:"100vh", background:"#0b1724", color:"white", padding:20, position:"sticky", top:0}}>
    <div style={{fontWeight:900, fontSize:22, marginBottom:6}}>MVC Admin</div>
    <div style={{color:"#94a3b8", fontSize:13, marginBottom:24}}>Next.js panel for Supabase Postgres</div>
    <Link href="/admin" style={{display:"flex",gap:10,padding:"12px 14px",borderRadius:14,background:"rgba(255,255,255,.08)",marginBottom:12}}><LayoutDashboard size={18}/> Dashboard</Link>
    <nav style={{display:"grid",gap:6}}>
      {workflowModules.map((item) => <Link key={item.href} href={item.href} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,color:"#dbeafe",fontSize:14,fontWeight:800}}>{item.icon}{item.label}</Link>)}
    </nav>
    {tableResources.length ? <div style={{marginTop:18}}>
      <div style={{display:"flex",alignItems:"center",gap:8,color:"#94a3b8",fontSize:12,fontWeight:900,textTransform:"uppercase",letterSpacing:".08em",margin:"0 0 8px 12px"}}><Database size={14}/> Database Tables</div>
      <nav style={{display:"grid",gap:4}}>
        {tableResources.map(r => <Link key={r.key} href={`/admin/${r.key}`} style={{padding:"8px 12px",borderRadius:12,color:"#cbd5e1",fontSize:13}}>{r.title}</Link>)}
      </nav>
    </div> : null}
    <div style={{borderTop:"1px solid rgba(255,255,255,.12)",marginTop:24,paddingTop:16}}>
      <div style={{fontSize:13,fontWeight:800}}>{user.firstname} {user.lastname}</div>
      <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>{user.roleSlugs.join(", ") || user.userType}</div>
      <form action="/logout" method="post" style={{marginTop:12}}>
        <button className="btn" style={{width:"100%",justifyContent:"center",background:"rgba(255,255,255,.08)",borderColor:"rgba(255,255,255,.16)",color:"white"}}>Sign Out</button>
      </form>
    </div>
  </aside>
}
