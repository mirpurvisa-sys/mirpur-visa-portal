type NotificationDatabase = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>;
};

// The user ID comes from the server session, never from request data.
// Recheck assignment so former assignees cannot view alerts for reassigned cases.
const ownNotifications = `
  n.recipient_user_id = $1
  AND ((n.audience = 'admin' AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=$1 AND (
      lower(COALESCE(u.user_type,''))='admin' OR EXISTS (
        SELECT 1 FROM public.users_roles ur JOIN public.roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.slug='admin'
      )
    )
  )) OR (n.audience = 'assignee' AND EXISTS (
    SELECT 1 FROM public.client_cases cc
    JOIN public.employees e ON e.id = cc.employee_id
    WHERE cc.id = n.case_id AND e.user_id = $1
  )))
`;

export async function getCaseNotificationFeed(db: NotificationDatabase, userId: number) {
  const [items, count] = await Promise.all([
    db.query(`
      SELECT n.id::text, n.case_id::text, n.event_type, n.message, n.created_at, n.read_at,
        (SELECT status FROM public.client_cases WHERE id=n.case_id) AS case_status
      FROM public.case_notifications n
      WHERE ${ownNotifications}
      ORDER BY n.id DESC LIMIT 50
    `, [userId]),
    db.query(`
      SELECT COUNT(*)::int AS count FROM public.case_notifications n
      WHERE ${ownNotifications} AND n.read_at IS NULL
    `, [userId]),
  ]);
  return {
    viewerId: userId,
    unreadCount: Number(count.rows[0]?.count || 0),
    latestNotificationId: items.rows[0]?.id || null,
    notifications: items.rows.map((row) => ({
      id: String(row.id),
      type: row.event_type === "case_completed" ? "Completed" : row.event_type === "case_assigned" ? "Assignment" : row.event_type.startsWith("document_") ? "Document" : "Case update",
      title: row.event_type === "case_completed" ? "Case completed" : row.event_type === "case_assigned" ? "Case assigned" : "Case updated",
      message: row.message,
      href: `/admin/cases/${row.case_id}${row.event_type.startsWith("document_") ? "#attachments" : ""}`,
      time: new Date(row.created_at).toLocaleString("en-GB", {
        timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      read: Boolean(row.read_at),
      caseStatus: row.case_status,
    })),
  };
}

export async function markCaseNotificationsRead(
  db: NotificationDatabase,
  userId: number,
  selection: { ids: string[] } | { beforeId: string },
) {
  const filter = "ids" in selection ? "n.id = ANY($2::bigint[])" : "n.id <= $2::bigint";
  const value = "ids" in selection ? selection.ids : selection.beforeId;
  await db.query(`
    UPDATE public.case_notifications n SET read_at = NOW()
    WHERE ${ownNotifications} AND n.read_at IS NULL AND ${filter}
  `, [userId, value]);
}
