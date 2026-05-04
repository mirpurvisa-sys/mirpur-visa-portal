import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getDb } from "./db";

const SESSION_COOKIE = "mvc_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type CurrentUser = {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  userType: string;
  roleSlugs: string[];
  permissionSlugs: string[];
};

export async function login(email: string, password: string) {
  const result = await getDb().query(
    `SELECT id, firstname, lastname, email, password, user_type FROM "users" WHERE lower("email") = lower($1) LIMIT 1`,
    [email],
  );
  const user = result.rows[0];
  if (!user) return { ok: false, message: "Invalid email or password." };

  const hash = normalizeLaravelBcryptHash(user.password);
  const matches = await bcrypt.compare(password, hash);
  if (!matches) return { ok: false, message: "Invalid email or password." };

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return { ok: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;

  const result = await getDb().query(
    `
      SELECT
        u.id,
        u.firstname,
        u.lastname,
        u.email,
        u.user_type,
        COALESCE(array_remove(array_agg(DISTINCT r.slug), NULL), '{}') AS role_slugs,
        COALESCE(array_remove(array_agg(DISTINCT p.slug), NULL), '{}') AS permission_slugs
      FROM "users" u
      LEFT JOIN "users_roles" ur ON ur.user_id = u.id
      LEFT JOIN "roles" r ON r.id = ur.role_id
      LEFT JOIN "roles_permissions" rp ON rp.role_id = r.id
      LEFT JOIN "permissions" p ON p.id = rp.permission_id
      WHERE u.id = $1
      GROUP BY u.id
      LIMIT 1
    `,
    [session.userId],
  );

  const user = result.rows[0];
  if (!user) return null;

  return {
    id: Number(user.id),
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    userType: user.user_type,
    roleSlugs: user.role_slugs ?? [],
    permissionSlugs: user.permission_slugs ?? [],
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function redirectIfLoggedIn() {
  const user = await getCurrentUser();
  if (user) redirect("/admin");
}

function signSession(userId: number) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function verifySession(token: string | undefined) {
  if (!token) return null;
  const [payload, providedSignature] = token.split(".");
  if (!payload || !providedSignature) return null;

  const expectedSignature = signature(payload);
  if (!safeEqual(providedSignature, expectedSignature)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.userId || Date.now() > session.expiresAt) return null;
    return { userId: Number(session.userId) };
  } catch {
    return null;
  }
}

function signature(payload: string) {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeLaravelBcryptHash(hash: string) {
  return hash.startsWith("$2y$") ? `$2b$${hash.slice(4)}` : hash;
}
