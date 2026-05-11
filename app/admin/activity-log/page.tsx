import Link from "next/link";
import { Activity, Clock3, Database, Fingerprint, Search, UserRound } from "lucide-react";
import { getResource } from "@/lib/adminConfig";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canSearch, canViewResource } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type ActivityLogSearchParams = {
  q?: string;
  type?: string;
};

type ActivityLogRow = {
  id: number;
  log_name: string | null;
  description: string | null;
  subject_type: string | null;
  subject_id: number | string | null;
  causer_type: string | null;
  causer_id: number | string | null;
  properties: unknown;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

type ActivityStats = {
  total: number;
  today: number;
  system: number;
  actors: number;
};

export default async function ActivityLogPage({ searchParams }: { searchParams: Promise<ActivityLogSearchParams> }) {
  const user = await requireUser();
  const resource = getResource("activity-log");
  if (!resource || !canViewResource(user, "activity-log")) return <AccessDenied />;

  const params = await searchParams;
  const userCanSearch = canSearch(user);
  const query = userCanSearch ? textFromValue(params.q, "") : "";
  const activeType = userCanSearch ? textFromValue(params.type, "all") : "all";

  const [logs, stats, filters] = await Promise.all([
    getActivityLogs(query, activeType),
    getActivityStats(),
    getActivityFilters(),
  ]);

  return (
    <section className="activityLogPage">
      <div className="activityHeader panel">
        <div>
          <span className="eyebrow">Audit Trail</span>
          <h1>Activity Log</h1>
          <p>Review recent system activity, user actions, and record changes in a cleaner timeline view.</p>
        </div>
        <Link className="btn" href="/admin">
          Dashboard
        </Link>
      </div>

      <div className="activityStatsGrid">
        <ActivityStatCard icon={<Activity size={36} />} label="Total Logs" value={stats.total} />
        <ActivityStatCard icon={<Clock3 size={36} />} label="Today" value={stats.today} />
        <ActivityStatCard icon={<Database size={36} />} label="System Events" value={stats.system} />
        <ActivityStatCard icon={<UserRound size={36} />} label="Actors" value={stats.actors} />
      </div>

      {userCanSearch ? (
        <form className="activityFilter panel">
          <label className="activitySearch">
            <Search size={18} aria-hidden="true" />
            <input name="q" defaultValue={query} placeholder="Search description, model, user or properties" />
          </label>
          <select className="input" name="type" defaultValue={activeType}>
            <option value="all">All activity types</option>
            {filters.map((filter) => (
              <option key={filter.name} value={filter.name}>
                {activityTypeLabel(filter.name)} ({filter.count})
              </option>
            ))}
          </select>
          <button className="btn btnPrimary">Search</button>
          {query || activeType !== "all" ? <Link className="btn" href="/admin/activity-log">Clear</Link> : null}
        </form>
      ) : null}

      <div className="activityLayout">
        <div className="activityTimeline">
          {logs.length === 0 ? (
            <div className="panel emptyState">No activity found.</div>
          ) : (
            logs.map((log) => <ActivityLogItem key={log.id} log={log} />)
          )}
        </div>

        <aside className="activitySidePanel panel">
          <h2>Activity Types</h2>
          {filters.length === 0 ? (
            <p className="muted">No types found yet.</p>
          ) : (
            <div className="activityTypeList">
              {filters.map((filter) => (
                <Link
                  className={activeType === filter.name ? "active" : ""}
                  href={`/admin/activity-log?type=${encodeURIComponent(filter.name)}`}
                  key={filter.name}
                >
                  <span>{activityTypeLabel(filter.name)}</span>
                  <strong>{filter.count}</strong>
                </Link>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function ActivityStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="activityStatCard">
      <span>{icon}</span>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <p>{label}</p>
      </div>
    </div>
  );
}

function ActivityLogItem({ log }: { log: ActivityLogRow }) {
  const properties = formatProperties(log.properties);
  return (
    <article className="activityLogItem">
      <div className="activityLogDot"><Fingerprint size={18} aria-hidden="true" /></div>
      <div className="activityLogCard">
        <div className="activityLogTop">
          <span className="activityTypeBadge">{activityTypeLabel(log.log_name)}</span>
          <time>{displayDateTime(log.created_at)}</time>
        </div>
        <h2>{textFromValue(log.description, "Activity recorded")}</h2>
        <div className="activityMetaGrid">
          <ActivityMeta label="Subject" value={recordReference(log.subject_type, log.subject_id)} />
          <ActivityMeta label="Causer" value={recordReference(log.causer_type, log.causer_id)} />
          <ActivityMeta label="Record ID" value={`#${log.id}`} />
          <ActivityMeta label="Updated" value={displayDateTime(log.updated_at) || "-"} />
        </div>
        {properties ? (
          <details className="activityProperties">
            <summary>View properties</summary>
            <pre>{properties}</pre>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function ActivityMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function getActivityLogs(query: string, type: string) {
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (query) {
    values.push(`%${query}%`);
    const index = values.length;
    conditions.push(`
      (
        COALESCE(log_name, '') ILIKE $${index}
        OR COALESCE(description, '') ILIKE $${index}
        OR COALESCE(subject_type, '') ILIKE $${index}
        OR COALESCE(causer_type, '') ILIKE $${index}
        OR COALESCE(properties::text, '') ILIKE $${index}
        OR COALESCE(subject_id::text, '') ILIKE $${index}
        OR COALESCE(causer_id::text, '') ILIKE $${index}
      )
    `);
  }

  if (type && type !== "all") {
    values.push(type);
    conditions.push(`COALESCE(NULLIF(log_name, ''), 'general') = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await getDb().query(
    `
      SELECT id, log_name, description, subject_type, subject_id, causer_type, causer_id, properties, created_at, updated_at
      FROM "activity_log"
      ${where}
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 80
    `,
    values,
  );

  return result.rows as ActivityLogRow[];
}

async function getActivityStats(): Promise<ActivityStats> {
  const result = await getDb().query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
      COUNT(*) FILTER (WHERE causer_id IS NULL)::int AS system,
      COUNT(DISTINCT causer_id)::int AS actors
    FROM "activity_log"
  `);
  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    today: Number(row.today || 0),
    system: Number(row.system || 0),
    actors: Number(row.actors || 0),
  };
}

async function getActivityFilters() {
  const result = await getDb().query(`
    SELECT COALESCE(NULLIF(log_name, ''), 'general') AS name, COUNT(*)::int AS count
    FROM "activity_log"
    GROUP BY 1
    ORDER BY count DESC, name ASC
    LIMIT 12
  `);
  return result.rows.map((row) => ({ name: String(row.name || "general"), count: Number(row.count || 0) }));
}

function AccessDenied() {
  return (
    <div className="panel">
      <h1>Activity Log</h1>
      <p className="muted">You do not have permission to access this module.</p>
    </div>
  );
}

function activityTypeLabel(value: unknown) {
  const raw = textFromValue(value, "general").replace(/[_-]/g, " ");
  return raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recordReference(type: unknown, id: unknown) {
  const cleanType = textFromValue(type, "System").split("\\").pop() || "System";
  const cleanId = textFromValue(id, "");
  return cleanId ? `${cleanType} #${cleanId}` : cleanType;
}

function formatProperties(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[]" || trimmed === "{}") return "";
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function displayDateTime(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Karachi",
  }).format(date);
}

function textFromValue(value: unknown, fallback: string) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}
