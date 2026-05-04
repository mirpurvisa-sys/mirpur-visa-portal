import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { CurrentUser } from "@/lib/auth";
import { allowedResources } from "@/lib/permissions";

export function Sidebar({ user }: { user: CurrentUser }){
  const visibleResources = allowedResources(user);
  return <aside style={{width:280, minHeight:"100vh", background:"#0b1724", color:"white", padding:20, position:"sticky", top:0}}>
    <div style={{fontWeight:900, fontSize:22, marginBottom:6}}>MVC Admin</div>
    <div style={{color:"#94a3b8", fontSize:13, marginBottom:24}}>Next.js panel for Supabase Postgres</div>
    <Link href="/admin" style={{display:"flex",gap:10,padding:"12px 14px",borderRadius:14,background:"rgba(255,255,255,.08)",marginBottom:12}}><LayoutDashboard size={18}/> Dashboard</Link>
    <nav style={{display:"grid",gap:6}}>
      {visibleResources.map(r => <Link key={r.key} href={`/admin/${r.key}`} style={{padding:"10px 12px",borderRadius:12,color:"#dbeafe",fontSize:14}}>{r.title}</Link>)}
    </nav>
    <div style={{borderTop:"1px solid rgba(255,255,255,.12)",marginTop:24,paddingTop:16}}>
      <div style={{fontSize:13,fontWeight:800}}>{user.firstname} {user.lastname}</div>
      <div style={{color:"#94a3b8",fontSize:12,marginTop:4}}>{user.roleSlugs.join(", ") || user.userType}</div>
      <form action="/logout" method="post" style={{marginTop:12}}>
        <button className="btn" style={{width:"100%",justifyContent:"center",background:"rgba(255,255,255,.08)",borderColor:"rgba(255,255,255,.16)",color:"white"}}>Sign Out</button>
      </form>
    </div>
  </aside>
}
