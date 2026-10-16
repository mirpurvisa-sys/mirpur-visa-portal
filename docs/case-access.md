# Case access

Only administrators can create, assign, reassign or delete cases. Broad `assign-cases`, `start-cases` and `delete` permission flags do not override this rule.

Case officers can switch between All Cases and My Assigned Cases. All Cases includes cases assigned to other employees and unassigned cases, with read access to their workspace and documents. Search includes all cases. My Assigned Cases filters the list, counts, search and pagination by the current login. Officers can open their own employee profile; it still lists only cases assigned to that employee. Officers land on My Assigned Cases and cannot access global client, appointment or employee management.

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
