import { studentSearch } from "./recordSearch";

export const STUDENTS_PER_PAGE = 10;
type StudentCourse = "ielts" | "life-skills";
type Database = { query: (sql: string, values?: any[]) => Promise<{ rows: any[] }> };

export function studentListHref(course: StudentCourse, query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  return `/admin/${course}${params.size ? `?${params}` : ""}`;
}

export async function getStudentPage(db: Database, course: StudentCourse, query: string, requestedPage?: string) {
  const table = course === "ielts" ? "ielts" : "life_skills";
  const search = studentSearch(query, course);
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM "${table}" WHERE ${search.condition}`, search.values);
  const total = Number(count.rows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / STUDENTS_PER_PAGE));
  const parsed = Number(requestedPage);
  const page = Math.min(totalPages, Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1);
  const offset = (page - 1) * STUDENTS_PER_PAGE;
  const result = await db.query(`SELECT * FROM "${table}" WHERE ${search.condition}
    ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $${search.values.length + 1} OFFSET $${search.values.length + 2}`,
    [...search.values, STUDENTS_PER_PAGE, offset]);
  return { students: result.rows, total, totalPages, page, offset };
}
