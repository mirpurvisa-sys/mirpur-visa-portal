import { redirectIfLoggedIn, login } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await redirectIfLoggedIn();
  const sp = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");
    const result = await login(email, password);

    if (!result.ok) redirect("/login?error=1");
    redirect("/admin");
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <form action={loginAction} className="card" style={{width:"min(440px,100%)",padding:28}}>
      <div style={{marginBottom:22}}>
        <h1 style={{fontSize:30,fontWeight:900,margin:"0 0 8px"}}>MVC Admin</h1>
        <p style={{color:"#64748b",margin:0}}>Sign in with your portal account.</p>
      </div>
      {sp.error ? <div style={{border:"1px solid #fecaca",background:"#fff1f2",color:"#be123c",borderRadius:12,padding:12,marginBottom:16,fontWeight:700}}>Invalid email or password.</div> : null}
      <div style={{display:"grid",gap:14}}>
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btnPrimary" style={{justifyContent:"center"}}>Sign In</button>
      </div>
    </form>
  </main>;
}
