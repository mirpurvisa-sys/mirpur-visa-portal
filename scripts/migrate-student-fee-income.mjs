import { readFileSync } from "node:fs";
import { connectPortalDatabase } from "./portal-database.mjs";
const db=await connectPortalDatabase();
try {
  await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='30s'");
  const before=(await db.query('SELECT COALESCE(sum("Amount"),0) AS amount FROM public.incomes')).rows[0].amount;
  await db.query(readFileSync(new URL('./student-fee-income.sql',import.meta.url),'utf8'));
  const inconsistent=await db.query(`WITH students AS(SELECT id,fee,'ielts' AS course FROM public.ielts UNION ALL SELECT id,fee,'life-skills' FROM public.life_skills)
    SELECT count(*) AS count FROM students s LEFT JOIN public.incomes i ON i.student_course=s.course AND i.student_id=s.id
    WHERE (s.fee>0 AND i."Amount" IS DISTINCT FROM s.fee) OR (COALESCE(s.fee,0)<=0 AND i.id IS NOT NULL)`);
  if(Number(inconsistent.rows[0].count))throw new Error("Student fee reconciliation failed");
  const after=(await db.query('SELECT COALESCE(sum("Amount"),0) AS amount FROM public.incomes')).rows[0].amount;
  const dry=process.argv.includes('--dry-run');await db.query(dry ? 'ROLLBACK' : 'COMMIT');
  console.log(JSON.stringify({mode:dry?'dry-run rolled back':'applied',ledgerChange:Number(after)-Number(before),reconciled:true}));
} catch(error) {await db.query('ROLLBACK').catch(()=>{});console.error('Student fee migration failed:',error.code||error.message);process.exitCode=1;}
finally {await db.end();}
