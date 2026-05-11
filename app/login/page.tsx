import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, UserRound } from "lucide-react";
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

  return <main className="loginPage">
    <form action={loginAction} className="loginCard">
      <Image className="loginLogo" src="/mvc-logo.jpg" alt="Mirpur Visa Consultant" width={112} height={112} priority />
      <h1>Login</h1>
      {sp.error ? <div className="notice errorNotice">Invalid email or password.</div> : null}
      <div className="loginGrid">
        <label className="loginRow">
          <span><UserRound size={22}/></span>
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="loginRow">
          <span><LockKeyhole size={22}/></span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <div className="loginMeta">
          <label><input type="checkbox" name="remember" /> Remember Me</label>
          <Link href="/login">Forgot Password?</Link>
        </div>
        <button className="btn btnPrimary">Login</button>
      </div>
    </form>
    <Link className="btn" href="/login" style={{position:"fixed",left:24,bottom:24,background:"#ffc107",borderColor:"#ffc107"}}>Book Appointment Now</Link>
  </main>;
}
