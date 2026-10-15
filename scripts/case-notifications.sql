-- Applied transactionally by migrate-case-notifications.mjs. No historical alerts are backfilled.
CREATE TABLE IF NOT EXISTS public.case_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id bigint NOT NULL REFERENCES public.client_cases(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.case_notifications ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'assignee';
CREATE INDEX IF NOT EXISTS case_notifications_recipient_id_idx
  ON public.case_notifications (recipient_user_id, id DESC);
CREATE INDEX IF NOT EXISTS case_notifications_unread_idx
  ON public.case_notifications (recipient_user_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS case_notifications_case_idx ON public.case_notifications (case_id);
ALTER TABLE public.case_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_notifications FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON public.case_notifications FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.emit_case_notification(target_case_id bigint, kind text, detail text)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public AS $$
  INSERT INTO public.case_notifications (recipient_user_id, case_id, event_type, message)
  SELECT e.user_id, cc.id, kind,
    detail || ' — Case #' || cc.id::text ||
    CASE WHEN NULLIF(btrim(cc.client_name), '') IS NOT NULL THEN ' (' || cc.client_name || ')' ELSE '' END
  FROM public.client_cases cc
  JOIN public.employees e ON e.id = cc.employee_id
  JOIN public.users u ON u.id = e.user_id
  WHERE cc.id = target_case_id;
$$;

CREATE OR REPLACE FUNCTION public.notify_case_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_case_notification(NEW.id, 'case_assigned', 'A case was assigned to you');
  ELSIF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    PERFORM public.emit_case_notification(NEW.id, 'case_assigned', 'A case was assigned to you');
  ELSIF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    IF (to_jsonb(NEW) - ARRAY['updated_at', 'remaining', 'total_paid'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at', 'remaining', 'total_paid']) THEN
      PERFORM public.emit_case_notification(NEW.id, 'case_updated', 'Case balances were updated');
    ELSE
      PERFORM public.emit_case_notification(NEW.id, 'case_updated', 'Case details were updated');
    END IF;
  END IF;
  IF lower(btrim(COALESCE(NEW.status,''))) IN ('completed','closed')
    AND (TG_OP = 'INSERT' OR lower(btrim(COALESCE(OLD.status,''))) NOT IN ('completed','closed')) THEN
    INSERT INTO public.case_notifications (recipient_user_id, case_id, event_type, message, audience)
    SELECT u.id, NEW.id, 'case_completed',
      'Case #' || NEW.id::text || ' (' || COALESCE(NEW.client_name,'Client') || ') was completed by ' ||
      COALESCE((SELECT concat_ws(' ',e.firstname,e.lastname) FROM public.employees e WHERE e.id=NEW.employee_id),'the assigned officer'),
      'admin'
    FROM public.users u
    WHERE lower(COALESCE(u.user_type,''))='admin'
      OR EXISTS (SELECT 1 FROM public.users_roles ur JOIN public.roles r ON r.id=ur.role_id
        WHERE ur.user_id=u.id AND r.slug='admin');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_case_related_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  case_row record;
  previous_case_id bigint;
  next_case_id bigint;
  kind text;
  detail text;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('documents', 'case_installments') THEN
    IF TG_OP <> 'INSERT' THEN previous_case_id := OLD.client_case_id; END IF;
    IF TG_OP <> 'DELETE' THEN next_case_id := NEW.client_case_id; END IF;
    kind := CASE WHEN TG_TABLE_NAME = 'documents' THEN 'document' ELSE 'payment' END;
    detail := CASE WHEN TG_TABLE_NAME = 'documents' THEN 'A document was ' ELSE 'A payment was ' END;
    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_case_notification(next_case_id, kind || '_added', detail || 'added');
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.emit_case_notification(previous_case_id, kind || '_removed', detail || 'removed');
    ELSIF previous_case_id IS DISTINCT FROM next_case_id THEN
      PERFORM public.emit_case_notification(previous_case_id, kind || '_removed', detail || 'moved to another case');
      PERFORM public.emit_case_notification(next_case_id, kind || '_added', detail || 'added');
    ELSE
      PERFORM public.emit_case_notification(next_case_id, kind || '_updated', detail || 'updated');
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' THEN
    FOR case_row IN SELECT id FROM public.client_cases WHERE client_id = NEW.id LOOP
      PERFORM public.emit_case_notification(case_row.id, 'client_updated', 'Client details were updated');
    END LOOP;
  ELSIF TG_TABLE_NAME = 'appointments' THEN
    FOR case_row IN SELECT id FROM public.client_cases WHERE appointment_id = NEW.id LOOP
      PERFORM public.emit_case_notification(case_row.id, 'appointment_updated', 'Appointment details were updated');
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS case_notification_change ON public.client_cases;
CREATE TRIGGER case_notification_change AFTER INSERT OR UPDATE ON public.client_cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_change();
DROP TRIGGER IF EXISTS case_notification_document ON public.documents;
CREATE TRIGGER case_notification_document AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_related_change();
DROP TRIGGER IF EXISTS case_notification_payment ON public.case_installments;
CREATE TRIGGER case_notification_payment AFTER INSERT OR UPDATE OR DELETE ON public.case_installments
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_related_change();
DROP TRIGGER IF EXISTS case_notification_client ON public.clients;
CREATE TRIGGER case_notification_client AFTER UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_related_change();
DROP TRIGGER IF EXISTS case_notification_appointment ON public.appointments;
CREATE TRIGGER case_notification_appointment AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_related_change();
REVOKE ALL ON FUNCTION public.emit_case_notification(bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_case_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_case_related_change() FROM PUBLIC;
DO $$
DECLARE
  role_name text;
  sequence_name text := pg_get_serial_sequence('public.case_notifications', 'id');
BEGIN
  IF sequence_name IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC', sequence_name); END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.emit_case_notification(bigint, text, text) FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION public.notify_case_change() FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION public.notify_case_related_change() FROM %I', role_name);
      IF sequence_name IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM %I', sequence_name, role_name); END IF;
    END IF;
  END LOOP;
END $$;
