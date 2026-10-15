# Accountant access

Accountants are recognized by the accountant role or the Accountant user type/designation. Changes apply at the server permission checks and do not require changing existing account records.

Accountants can:

- View financial dashboard totals, income, expenses, cases, clients and appointments.
- Create, edit and delete income, expense and case-installment records.
- Update a case's fee, advance amount, appointment fee and paid/unpaid status through its Payment Details form.
- Add installments directly from the case workspace, edit existing installments, and remove incorrect installments.
- Update appointment payments without changing the booking's category or date.
- View employee payroll details and student records for reconciliation, without managing their accounts or changing course/student records.
- Use portal search and direct Income / Case Installments sidebar links.
- Work on cases assigned to their own login: edit case and related client details, upload/remove case documents, and mark the case completed. The existing private assignment/update notifications also apply to accountants.
- Use My Assigned Cases in the sidebar or the case-list assignment filter, together with Ongoing/Completed, search and pagination.

Case reassignment, general client/document management outside their assigned case workspace, employee administration, user/role management and deletion of cases or appointments are not granted by the accountant role. Additional roles or explicit permissions on an account still apply. Server actions reload the current case assignment before allowing case work; the client being edited comes from that case rather than a posted client ID. Financial reconciliation rights remain available across cases.

Installment creation, edits, moves between cases and deletion synchronize the income ledger and recalculate affected case balances. Advance is a case financial field; received cash must also be recorded as an installment to enter collected totals.

Verify permissions and financial-action scope with:

    node scripts/accountant-permissions.test.mjs
