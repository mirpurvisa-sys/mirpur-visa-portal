import { Sidebar } from "./Sidebar";
import type { CurrentUser } from "@/lib/auth";

export function AdminShell({children, user}:{children:React.ReactNode; user: CurrentUser}){
  return <div style={{display:"flex"}}><Sidebar user={user}/><main style={{flex:1,padding:28}}>{children}</main></div>
}
