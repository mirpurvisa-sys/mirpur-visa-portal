# Employee case notifications

The portal bell shows saved, in-app alerts for the logged-in employee's assigned cases. It refreshes every 20 seconds while the page is visible, on window focus, and when the bell opens.

Assignments and reassignments notify the new assignee. Case edits, document additions/edits/removals, payments, balance changes, and linked client/appointment changes notify the current assignee. Database triggers create alerts in the same transaction as the change, including changes made through generic edit screens. Unchanged saves and timestamp-only updates do not create alerts.

The recipient is resolved through client_cases.employee_id → employees.id → employees.user_id. An employee must have a linked login with case access. Cases without a valid linked login do not broadcast notifications. Notifications are not sent by email or SMS.

The server derives the recipient from the session for both reads and marking alerts as read. It also checks current assignment, hiding historical employee alerts after a case is reassigned. Admins receive their own completion alerts, rather than access to employee notifications. Read state is stored in the database, and the badge counts all unread alerts while the dropdown displays the latest 50.

## Completing a case

The current assignee can use **Mark completed** in the case list, case workspace, or their employee case list. The server checks the employee-to-login relationship in the same conditional UPDATE that changes status. Other employees cannot complete the case through this action; duplicate submissions do not change it again.

Transitioning an ongoing case to Completed (or Closed in an existing edit screen) sends a separate notification to each admin account, identified by user_type or the admin role. It includes the case number, client name and assigned officer. Admin notifications remain recipient-specific and are hidden if the account loses its admin role. No historical completion alerts are backfilled.

Completed and Closed cases use green badges/rows in case, employee, client and appointment lists, search results and notifications. The case workspace displays a completion banner. The case list can filter All, Ongoing or Completed cases, retaining the selected filter while searching and paging.

## Database setup

Run once per database before deploying the application:

    node scripts/migrate-case-notifications.mjs

The idempotent migration creates case_notifications, indexes, and five triggers. It preserves existing case data and creates no historical alerts. Row-level security and revoked browser-role privileges keep the table and trigger helpers accessible only through the server database connection.

## Verification

API validation tests:

    node scripts/case-notifications.test.mjs

PostgreSQL trigger and isolation tests (PowerShell):

    $env:RUN_DATABASE_NOTIFICATION_TESTS = "1"
    node scripts/case-notifications.test.mjs

The integration tests create synthetic users, employees and cases in a uniquely named schema inside a transaction. All fixtures, triggers and tables are rolled back afterwards; application records are never changed.

## Undoing completion

Completed cases offer **Undo completed** in the case list, workspace and employee profile. The current assignee or any admin can use it to return a Completed or Closed case to **In Progress**. Other employees cannot undo completion, including through a forged submission or an old page after reassignment. Repeated clicks do not create duplicate status changes or alerts.

Admins receive a private **Case reopened** alert, and the current assignee receives the usual case update. Existing completion alerts remain as history; their status badges show the current case status. Lists, totals, filters and profiles refresh after undo. Reapply the notification migration to install reopening alerts before deploying this version.
