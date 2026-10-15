# Case access

Only administrators can create, assign, reassign or delete cases. Broad `assign-cases`, `start-cases` and `delete` permission flags do not override this rule.

Case officers can view and work on cases assigned to an employee record linked to their signed-in user ID. The restriction applies to case lists and counts, pagination, search/recent results, direct workspace URLs, document downloads, and the assigned cases on their own profile. Changing query parameters or guessing another employee profile ID cannot widen access. Officers land on My Assigned Cases instead of the global dashboard and cannot access global client, appointment or employee management.

Officers can edit their assigned case and its related client details, upload/remove its documents and mark it completed. They cannot change the assignee. Server actions check the current database assignment, derive the client ID from the case, and guard operational writes against assignment changes. Case and related appointment updates execute in one SQL statement.

Accountants retain financial reconciliation access across cases and operational work on their own assignments. See [Accountant access](accountant-access.md). Administrators retain full access. No database migration is needed for these access rules.

Run permissions and action tests:

```powershell
node scripts/accountant-permissions.test.mjs
```

Include PostgreSQL isolation tests:

```powershell
$env:RUN_DATABASE_ACCESS_TESTS='1'
node scripts/accountant-permissions.test.mjs
```

The database tests use temporary copies of table structures and synthetic records inside a rolled-back transaction. They do not modify customer records.
