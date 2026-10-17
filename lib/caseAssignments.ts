type AssignmentDatabase = {
  query: (sql: string, values?: any[]) => Promise<{ rows: any[] }>;
};

// Read on each request: assignments must not be shared through the dashboard cache.
export async function getAssignedCaseSummary(db: AssignmentDatabase, userId: number) {
  const [counts, cases] = await Promise.all([
    db.query(`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE lower(btrim(COALESCE(cc.status,''))) NOT IN ('completed','closed'))::int AS ongoing
      FROM client_cases cc
      WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id=cc.employee_id AND e.user_id=$1)
    `, [userId]),
    db.query(`
      SELECT cc.id, cc.client_name, cc."caseCategory", cc.status
      FROM client_cases cc
      WHERE EXISTS (SELECT 1 FROM employees e WHERE e.id=cc.employee_id AND e.user_id=$1)
        AND lower(btrim(COALESCE(cc.status,''))) NOT IN ('completed','closed')
      ORDER BY cc.updated_at DESC NULLS LAST, cc.id DESC
      LIMIT 5
    `, [userId]),
  ]);
  const total = Number(counts.rows[0]?.total || 0);
  const ongoing = Number(counts.rows[0]?.ongoing || 0);
  return { total, ongoing, completed: total - ongoing, cases: cases.rows };
}
