import { getDb } from "./db";

export async function assertManualIncome(id: number) {
  const result = await getDb().query('SELECT student_course FROM incomes WHERE id=$1', [id]);
  if (result.rows[0]?.student_course) throw new Error("Change student fees from the student record so the ledger stays synchronized.");
}
