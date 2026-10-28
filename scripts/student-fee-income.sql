-- Ledger links are stable even when a student's CNIC is corrected.
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS student_course text;
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS student_id bigint;

-- Existing imported receipts used student ID concatenated with CNIC.
-- Refuse ambiguous mappings rather than guessing or double-counting money.
DO $$
BEGIN
  IF EXISTS (
    WITH students AS (
      SELECT id, cnic, 'ielts' AS course, 'Course IELTS Fee' AS category FROM public.ielts
      UNION ALL SELECT id, cnic, 'life-skills', 'Course Life Skill Fee' FROM public.life_skills
    )
    SELECT i.id FROM public.incomes i JOIN students s
      ON i.foreign_id=s.id::text||s.cnic AND i."IncomesType" IN (s.category,'Course')
    WHERE i.student_course IS NULL AND NULLIF(btrim(s.cnic),'') IS NOT NULL
    GROUP BY i.id HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'Ambiguous legacy student fee references; no migration applied'; END IF;
END $$;
WITH students AS (
  SELECT id, cnic, 'ielts' AS course, 'Course IELTS Fee' AS category FROM public.ielts
  UNION ALL SELECT id, cnic, 'life-skills', 'Course Life Skill Fee' FROM public.life_skills
)
UPDATE public.incomes i SET student_course=s.course, student_id=s.id FROM students s
WHERE i.student_course IS NULL AND NULLIF(btrim(s.cnic),'') IS NOT NULL
  AND i.foreign_id=s.id::text||s.cnic AND i."IncomesType" IN (s.category,'Course');

CREATE UNIQUE INDEX IF NOT EXISTS incomes_student_fee_unique ON public.incomes(student_course,student_id)
  WHERE student_course IS NOT NULL AND student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_student_fee_income(course text, student bigint, student_name text, fee numeric, received_on date)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF fee < 0 THEN RAISE EXCEPTION 'Student fee cannot be negative'; END IF;
  IF COALESCE(fee,0)=0 THEN
    DELETE FROM public.incomes WHERE student_course=course AND student_id=student;
    RETURN;
  END IF;
  INSERT INTO public.incomes ("Title","IncomesType","Amount","Description","Date",foreign_id,student_course,student_id,created_at,updated_at)
  VALUES (student_name,CASE WHEN course='ielts' THEN 'Course IELTS Fee' ELSE 'Course Life Skill Fee' END,
    fee,'Student fee',COALESCE(received_on,CURRENT_DATE),course||':'||student::text,course,student,NOW(),NOW())
  ON CONFLICT (student_course,student_id) WHERE student_course IS NOT NULL AND student_id IS NOT NULL
  DO UPDATE SET "Title"=EXCLUDED."Title", "Amount"=EXCLUDED."Amount", "Date"=COALESCE(incomes."Date",EXCLUDED."Date"), updated_at=NOW();
END $$;

CREATE OR REPLACE FUNCTION public.notify_student_fee_income()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE course text := CASE WHEN TG_TABLE_NAME='ielts' THEN 'ielts' ELSE 'life-skills' END;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.incomes WHERE student_course=course AND student_id=OLD.id;
    RETURN OLD;
  END IF;
  PERFORM public.sync_student_fee_income(course,NEW.id,NEW.name,NEW.fee,
    COALESCE((to_jsonb(NEW)->>'joining_date')::date,(to_jsonb(NEW)->>'admission_date')::date,NEW.created_at::date));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS student_fee_income ON public.ielts;
CREATE TRIGGER student_fee_income AFTER INSERT OR UPDATE OR DELETE ON public.ielts
  FOR EACH ROW EXECUTE FUNCTION public.notify_student_fee_income();
DROP TRIGGER IF EXISTS student_fee_income ON public.life_skills;
CREATE TRIGGER student_fee_income AFTER INSERT OR UPDATE OR DELETE ON public.life_skills
  FOR EACH ROW EXECUTE FUNCTION public.notify_student_fee_income();

-- Idempotent: fills missing fees and updates linked receipts, without creating duplicates.
SELECT public.sync_student_fee_income('ielts',id,name,fee,COALESCE(joining_date,created_at::date)) FROM public.ielts;
SELECT public.sync_student_fee_income('life-skills',id,name,fee,COALESCE(admission_date,created_at::date)) FROM public.life_skills;
REVOKE ALL ON FUNCTION public.sync_student_fee_income(text,bigint,text,numeric,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_student_fee_income() FROM PUBLIC;
