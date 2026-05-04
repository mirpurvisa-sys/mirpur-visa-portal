import { AdminShell } from "@/components/AdminShell";
import { requireUser } from "@/lib/auth";

export default async function Layout({children}:{children:React.ReactNode}){
  const user = await requireUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
