# Student fees and accountant search

The student fee field is recorded as received course income. Positive IELTS and Life Skills fees each have one linked income receipt. Zero fees produce no income. Student edits update that receipt, and deleting a student removes it. Fee writes and ledger writes run in the same database transaction through triggers, including generic CRUD routes.

The migration links imported receipts that used student ID plus CNIC, preserving receipt IDs and receipt dates. It fills missing receipts and refuses ambiguous references. Links use course and student ID, so correcting CNIC does not create another receipt. Existing independent/manual income is preserved.

Income rows linked to students open the source student record. Corrections are made there rather than editing a second fee value in Income. Student CRUD invalidates finance totals, dashboard charts and the income list immediately.

Preview and apply the idempotent migration before releasing the application:

    node scripts/migrate-student-fee-income.mjs --dry-run
    node scripts/migrate-student-fee-income.mjs

Accountant topbar search includes students, income and expenses alongside clients, cases, appointments and employees. Student lists accept names, student IDs, formatted or unformatted CNIC/phone, email, address and course details. Income search filters all transactions before limiting results, including older records. Financial search is gated to financial roles.

Run synthetic PostgreSQL reconciliation, search and authorization tests (rolled back):

    $env:RUN_DATABASE_FINANCE_TESTS='1'
    node scripts/student-finance-search.test.mjs
