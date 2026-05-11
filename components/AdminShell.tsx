import { Sidebar } from "./Sidebar";
import { TopbarDropdowns } from "./TopbarDropdowns";
import type { CurrentUser } from "@/lib/auth";
import { canViewResource } from "@/lib/permissions";

export function AdminShell({children, user}:{children:React.ReactNode; user: CurrentUser}){
  const displayName = `${user.firstname} ${user.lastname}`.trim() || "Admin";
  const profileHref = canViewResource(user, "employees") ? "/admin/employees" : "/admin";

  return <div className="mvcShell">
    <Sidebar user={user}/>
    <header className="topBar">
      <h1>Welcome <span>{displayName}</span></h1>
      <TopbarDropdowns displayName={displayName} profileHref={profileHref} />
    </header>
    <main className="mvcMain">{children}</main>
  </div>
}
