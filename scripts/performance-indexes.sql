CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_activity_log_created_at_id_idx
  ON activity_log (created_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_appointments_date_id_idx
  ON appointments (appointmentdate DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_appointments_client_date_id_idx
  ON appointments (client_id, appointmentdate DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_appointments_status_idx
  ON appointments (appointmentstatus);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_case_installments_time_id_idx
  ON case_installments ("time" DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_case_installments_case_name_amount_idx
  ON case_installments (client_case_id, name, amount);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_client_cases_appointment_id_idx
  ON client_cases (appointment_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_client_cases_start_id_idx
  ON client_cases ("startDate" DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_clients_created_at_id_idx
  ON clients (created_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_expenses_date_id_idx
  ON expenses ("Date" DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_documents_case_created_id_idx
  ON documents (client_case_id, created_at DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_incomes_date_id_idx
  ON incomes ("Date" DESC NULLS LAST, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_incomes_foreign_id_idx
  ON incomes (foreign_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_incomes_type_idx
  ON incomes ("IncomesType");

CREATE INDEX CONCURRENTLY IF NOT EXISTS perf_incomes_title_amount_date_idx
  ON incomes ("Title", "Amount", "Date");
