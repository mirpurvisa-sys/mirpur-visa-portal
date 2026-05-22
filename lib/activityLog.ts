import type { CurrentUser } from "./auth";
import { getDb } from "./db";

type ActivityActor = Pick<CurrentUser, "id" | "firstname" | "lastname" | "email">;

type ActivityLogInput = {
  user?: ActivityActor | null;
  action: "created" | "updated" | "deleted" | "login" | "logout";
  resource: string;
  resourceTitle?: string;
  subjectId?: unknown;
  properties?: Record<string, unknown>;
};

const SENSITIVE_KEYS = new Set(["password", "epassword", "remember_token", "token"]);
const NOISY_KEYS = new Set(["created_at", "updated_at"]);

export async function recordActivity({
  action,
  properties,
  resource,
  resourceTitle,
  subjectId,
  user,
}: ActivityLogInput) {
  try {
    const label = resourceTitle || titleFromResource(resource);
    await getDb().query(
      `
        INSERT INTO "activity_log" (
          log_name, description, subject_type, subject_id, causer_type, causer_id,
          properties, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      `,
      [
        resource,
        `${label} ${action}`,
        resource,
        numericId(subjectId),
        user ? "users" : null,
        user?.id ?? null,
        serializeProperties({
          action,
          resource,
          subject_id: subjectId,
          user: user ? displayUser(user) : null,
          ...sanitizeProperties(properties),
        }),
      ],
    );
  } catch (error) {
    console.warn("Unable to record activity log", error);
  }
}

export function changedFields(data: Record<string, unknown>) {
  return Object.keys(data).filter((key) => {
    const normalized = key.toLowerCase();
    return !SENSITIVE_KEYS.has(normalized) && !NOISY_KEYS.has(normalized);
  });
}

function numericId(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function serializeProperties(value: Record<string, unknown>) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item instanceof Date) return item.toISOString();
    return item;
  });
}

function sanitizeProperties(value: Record<string, unknown> | undefined) {
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value || {})) {
    clean[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? "Hidden" : item;
  }
  return clean;
}

function displayUser(user: ActivityActor) {
  return [user.firstname, user.lastname].filter(Boolean).join(" ") || user.email || `User #${user.id}`;
}

function titleFromResource(resource: string) {
  return resource
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
