import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { after, afterEach, before, beforeEach, describe, test } from "node:test";
import { getCaseNotificationFeed, markCaseNotificationsRead } from "../lib/caseNotifications.ts";
import { completeAssignedCase, isCaseCompleted } from "../lib/caseStatus.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
let session = { id: 11, allowed: true };
let selections = [];
const json = (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers });
const code = ts.transpileModule(readFileSync(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = {
  exports: {}, URL,
  require(name) {
    if (name === "next/server") return { NextResponse: { json } };
    if (name === "@/lib/auth") return { getCurrentUser: async () => session };
    if (name === "@/lib/db") return { getDb: () => ({}) };
    if (name === "@/lib/permissions") return { canViewResource: user => user.allowed };
    if (name === "@/lib/caseNotifications") return {
      getCaseNotificationFeed: async (_, userId) => ({ viewerId: userId, notifications: [], unreadCount: 0 }),
      markCaseNotificationsRead: async (_, userId, selection) => selections.push({ userId, selection }),
    };
    throw new Error("Unexpected import: " + name);
  },
};
vm.runInNewContext(code, sandbox);
const route = sandbox.exports;
const request = (body, origin = "https://portal.example") => ({
  url: "https://portal.example/api/notifications", headers: new Headers({ origin }),
  json: async () => body,
});

describe("notification API authorization", () => {
  beforeEach(() => { session = { id: 11, allowed: true }; selections = []; });
  test("anonymous reads and writes require login", async () => {
    session = null;
    assert.equal((await route.GET()).status, 401);
    assert.equal((await route.POST(request({ ids: ["1"] }))).status, 401);
    assert.equal(selections.length, 0);
  });
  test("accounts without case access receive no notifications", async () => {
    session.allowed = false;
    const response = await route.GET();
    assert.equal(response.body.notifications.length, 0);
    assert.equal(response.body.unreadCount, 0);
    assert.equal((await route.POST(request({ ids: ["1"] }))).status, 403);
  });
  test("recipient selection always uses the authenticated user", async () => {
    await route.POST(request({ ids: ["99"], recipient_user_id: 22, userId: 22 }));
    assert.equal(selections.length, 1);
    assert.equal(selections[0].userId, 11);
    assert.equal((await route.GET()).body.viewerId, 11);
  });
  test("responses cannot be cached across signed-in accounts", async () => {
    assert.equal((await route.GET()).headers["Cache-Control"], "private, no-store");
  });
  test("cross-origin read-state requests are rejected", async () => {
    assert.equal((await route.POST(request({ ids: ["1"] }, "https://elsewhere.example"))).status, 403);
    assert.equal(selections.length, 0);
  });
  test("invalid, empty, oversized and out-of-range IDs are rejected", async () => {
    for (const body of [{}, null, { ids: [] }, { ids: ["0"] }, { ids: [1] }, { ids: ["1 OR 1=1"] },
      { ids: ["9223372036854775808"] }, { ids: Array(101).fill("1") }, { all: true }, { all: true, beforeId: "-1" }]) {
      assert.equal((await route.POST(request(body))).status, 400);
    }
    assert.equal(selections.length, 0);
  });
  test("bigint IDs retain precision and mark-all requires a snapshot cutoff", async () => {
    assert.equal((await route.POST(request({ ids: ["9223372036854775807"] }))).status, 200);
    assert.equal(selections[0].selection.ids[0], "9223372036854775807");
    await route.POST(request({ all: true, beforeId: "123", recipient_user_id: 22 }));
    assert.equal(selections[1].userId, 11);
    assert.equal(selections[1].selection.beforeId, "123");
  });
  test("malformed JSON is rejected", async () => {
    const req = request({});
    req.json = async () => { throw new SyntaxError(); };
    assert.equal((await route.POST(req)).status, 400);
  });
});

const enabled = process.env.RUN_DATABASE_NOTIFICATION_TESTS === "1";
describe("notification triggers and recipient isolation in PostgreSQL", { skip: !enabled }, () => {
  let client;
  let db;
  let migration;
  const schema = "notification_test_" + process.pid + "_" + Date.now();
  const sql = (source, values) => client.query(source.replace(/\bpublic\./g, schema + "."), values);
  const feed = userId => getCaseNotificationFeed(db, userId);
  const event = async (kind, caseId = 101) => {
    const result = await sql("SELECT * FROM public.case_notifications WHERE case_id=$1 ORDER BY id DESC LIMIT 1", [caseId]);
    assert.equal(result.rows[0]?.event_type, kind);
    return result.rows[0];
  };
  before(async () => {
    require("dotenv").config({ path: ".env.local", quiet: true });
    require("dotenv").config({ quiet: true });
    const { Client } = require("pg");
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.delete("sslmode");
    client = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000, statement_timeout: 15000 });
    await client.connect();
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA " + schema);
    await sql(`
      CREATE TABLE public.users (id bigint PRIMARY KEY, user_type text);
      CREATE TABLE public.roles (id bigint PRIMARY KEY, slug text);
      CREATE TABLE public.users_roles (user_id bigint, role_id bigint);
      CREATE TABLE public.employees (id bigint PRIMARY KEY, user_id bigint NOT NULL, firstname text, lastname text);
      CREATE TABLE public.clients (id bigint PRIMARY KEY, firstname text, updated_at timestamptz);
      CREATE TABLE public.appointments (id bigint PRIMARY KEY, category text, updated_at timestamptz);
      CREATE TABLE public.client_cases (id bigint PRIMARY KEY, employee_id bigint, client_id bigint, appointment_id bigint,
        client_name text, status text, remaining numeric, total_paid numeric, updated_at timestamptz);
      CREATE TABLE public.documents (id bigint PRIMARY KEY, client_case_id bigint, document text, updated_at timestamptz);
      CREATE TABLE public.case_installments (id bigint PRIMARY KEY, client_case_id bigint, amount text, updated_at timestamptz);
      INSERT INTO public.users (id) VALUES (11), (22), (33);
      INSERT INTO public.users VALUES (44,'admin'),(55,'employee');
      INSERT INTO public.roles VALUES (1,'admin');
      INSERT INTO public.users_roles VALUES (55,1);
      INSERT INTO public.employees (id,user_id,firstname,lastname) VALUES (100,11,'Test','Officer'),(200,22,'Other','Officer'),(300,999,'Missing','Login');
      INSERT INTO public.clients VALUES (1, 'Example A', NULL), (2, 'Example B', NULL);
      INSERT INTO public.appointments VALUES (1, 'visit', NULL), (2, 'online', NULL);
      INSERT INTO public.client_cases VALUES (101,100,1,1,'Example A','Open',0,0,NULL), (202,200,2,2,'Example B','Open',0,0,NULL);
    `);
    migration = readFileSync(new URL("./case-notifications.sql", import.meta.url), "utf8");
    await sql(migration);
    db = { query: sql };
  });
  beforeEach(async () => { await client.query("SAVEPOINT test_case"); });
  afterEach(async () => { await client.query("ROLLBACK TO SAVEPOINT test_case"); });
  after(async () => {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
    }
  });
  test("migration does not backfill or broadcast historical cases", async () => {
    assert.equal((await feed(11)).notifications.length, 0);
    assert.equal((await feed(22)).notifications.length, 0);
  });
  test("completion is restricted to the current assignee", async () => {
    assert.equal(await completeAssignedCase(db,101,22), false);
    assert.equal(await completeAssignedCase(db,101,44), false);
    assert.equal((await sql("SELECT status FROM public.client_cases WHERE id=101")).rows[0].status,'Open');
    assert.equal((await feed(44)).unreadCount,0);
    assert.equal(await completeAssignedCase(db,101,11),true);
    assert.equal((await sql("SELECT status FROM public.client_cases WHERE id=101")).rows[0].status,'Completed');
  });
  test("completion alerts each admin by user type or role, and no unrelated employee", async () => {
    await completeAssignedCase(db,101,11);
    for(const adminId of [44,55]) {
      const admin=await feed(adminId);
      assert.equal(admin.unreadCount,1);
      assert.equal(admin.notifications[0].type,'Completed');
      assert.match(admin.notifications[0].message,/101.*Example A.*Test Officer/);
      assert.equal(admin.notifications[0].caseStatus,'Completed');
    }
    assert.equal((await feed(22)).unreadCount,0);
    assert.equal((await feed(33)).unreadCount,0);
    const adminAlert=(await feed(44)).notifications[0].id;
    await markCaseNotificationsRead(db,11,{ids:[adminAlert]});
    assert.equal((await feed(44)).unreadCount,1);
    await markCaseNotificationsRead(db,44,{ids:[adminAlert]});
    assert.equal((await feed(44)).unreadCount,0);
    assert.equal((await feed(55)).unreadCount,1);
  });
  test("double completion is idempotent and does not repeat admin alerts", async () => {
    assert.equal(await completeAssignedCase(db,101,11),true);
    assert.equal(await completeAssignedCase(db,101,11),false);
    await sql("UPDATE public.client_cases SET updated_at=NOW(),status='Completed' WHERE id=101");
    assert.equal((await feed(44)).unreadCount,1);
    assert.equal((await feed(55)).unreadCount,1);
  });
  test("reassignment before completion denies the former assignee", async () => {
    await sql("UPDATE public.client_cases SET employee_id=200 WHERE id=101");
    assert.equal(await completeAssignedCase(db,101,11),false);
    assert.equal(await completeAssignedCase(db,101,22),true);
    assert.match((await feed(44)).notifications[0].message,/Other Officer/);
  });
  test("admin completion alerts survive reassignment but are hidden if the admin role is removed", async () => {
    await completeAssignedCase(db,101,11);
    await sql("UPDATE public.client_cases SET employee_id=200 WHERE id=101");
    assert.equal((await feed(44)).unreadCount,1);
    assert.equal((await feed(55)).unreadCount,1);
    await sql("DELETE FROM public.users_roles WHERE user_id=55");
    assert.equal((await feed(55)).unreadCount,0);
  });
  test("generic status edits and closed cases also notify admins", async () => {
    await sql("UPDATE public.client_cases SET status='Closed' WHERE id=101");
    assert.equal((await feed(44)).unreadCount,1);
    assert.equal(await completeAssignedCase(db,101,11),false);
    assert.equal(isCaseCompleted(' CLOSED '),true);
    assert.equal(isCaseCompleted('completed'),true);
    assert.equal(isCaseCompleted('In Progress'),false);
  });
  test("new assignments notify only the employee's linked login", async () => {
    await sql("INSERT INTO public.client_cases (id,employee_id,client_name) VALUES (303,100,'Example C')");
    const own = await feed(11);
    assert.equal(own.notifications.length, 1);
    assert.equal(own.notifications[0].type, "Assignment");
    assert.equal(own.notifications[0].href, "/admin/cases/303");
    assert.equal((await feed(22)).notifications.length, 0);
    assert.equal((await feed(33)).notifications.length, 0);
  });
  test("case edits create a durable unread notification", async () => {
    await sql("UPDATE public.client_cases SET status='In Progress' WHERE id=101");
    await event("case_updated");
    assert.equal((await feed(11)).unreadCount, 1);
    assert.equal((await feed(22)).unreadCount, 0);
  });
  test("document additions, edits and removals notify and link to attachments", async () => {
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    await event("document_added");
    assert.equal((await feed(11)).notifications[0].href, "/admin/cases/101#attachments");
    await sql("UPDATE public.documents SET document='revised.pdf' WHERE id=1");
    await event("document_updated");
    await sql("DELETE FROM public.documents WHERE id=1");
    await event("document_removed");
    assert.equal((await feed(11)).unreadCount, 3);
    assert.equal((await feed(22)).unreadCount, 0);
  });
  test("moving a document notifies each affected case's assignee", async () => {
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    await sql("UPDATE public.documents SET client_case_id=202 WHERE id=1");
    await event("document_removed", 101);
    await event("document_added", 202);
    assert.equal((await feed(22)).notifications.length, 1);
  });
  test("payment additions, changes and removals are captured", async () => {
    await sql("INSERT INTO public.case_installments VALUES (1,101,'100',NULL)");
    await event("payment_added");
    await sql("UPDATE public.case_installments SET amount='200' WHERE id=1");
    await event("payment_updated");
    await sql("DELETE FROM public.case_installments WHERE id=1");
    await event("payment_removed");
  });
  test("client and appointment changes notify their case's assignee", async () => {
    await sql("UPDATE public.clients SET firstname='Revised example' WHERE id=1");
    await event("client_updated");
    await sql("UPDATE public.appointments SET category='physical' WHERE id=1");
    await event("appointment_updated");
    assert.equal((await feed(11)).unreadCount, 2);
    assert.equal((await feed(22)).unreadCount, 0);
  });
  test("timestamp-only saves and unchanged totals do not generate duplicate alerts", async () => {
    await sql("UPDATE public.client_cases SET updated_at=NOW(),remaining=0,total_paid=0 WHERE id=101");
    await sql("UPDATE public.clients SET updated_at=NOW() WHERE id=1");
    await sql("UPDATE public.appointments SET updated_at=NOW() WHERE id=1");
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    await sql("UPDATE public.documents SET updated_at=NOW() WHERE id=1");
    assert.equal((await feed(11)).unreadCount, 1);
  });
  test("balance changes notify the assignee, but repeating the calculation does not", async () => {
    await sql("UPDATE public.client_cases SET remaining=10,total_paid=20 WHERE id=101");
    const notification = await event("case_updated");
    assert.match(notification.message, /balances/);
    await sql("UPDATE public.client_cases SET updated_at=NOW(),remaining=10,total_paid=20 WHERE id=101");
    assert.equal((await feed(11)).unreadCount, 1);
  });
  test("reassignment hides old alerts from the former assignee and notifies the new one", async () => {
    await sql("UPDATE public.client_cases SET status='In Progress' WHERE id=101");
    const oldId = (await feed(11)).notifications[0].id;
    await sql("UPDATE public.client_cases SET employee_id=200 WHERE id=101");
    assert.equal((await feed(11)).notifications.length, 0);
    await event("case_assigned");
    await markCaseNotificationsRead(db, 11, { ids: [oldId] });
    const result = await sql("SELECT read_at FROM public.case_notifications WHERE id=$1", [oldId]);
    assert.equal(result.rows[0].read_at, null);
    await sql("UPDATE public.client_cases SET status='Submitted' WHERE id=101");
    assert.equal((await feed(22)).unreadCount, 2);
    assert.equal((await feed(11)).unreadCount, 0);
  });
  test("employees without a linked login cannot receive another user's notification", async () => {
    await sql("UPDATE public.client_cases SET employee_id=300 WHERE id=101");
    assert.equal((await sql("SELECT COUNT(*)::int AS count FROM public.case_notifications")).rows[0].count, 0);
  });
  test("unassigned cases do not broadcast to all employees", async () => {
    await sql("UPDATE public.client_cases SET employee_id=NULL WHERE id=101");
    assert.equal((await feed(11)).unreadCount, 0);
    assert.equal((await feed(22)).unreadCount, 0);
  });
  test("failed or rolled-back case changes leave no notifications", async () => {
    await client.query("SAVEPOINT failed_change");
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    await client.query("ROLLBACK TO SAVEPOINT failed_change");
    assert.equal((await feed(11)).notifications.length, 0);
  });
  test("a user cannot read or mark another employee's notifications", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted'");
    const foreign = (await feed(22)).notifications[0].id;
    await markCaseNotificationsRead(db, 11, { ids: [foreign] });
    assert.equal((await feed(22)).unreadCount, 1);
    assert.equal((await feed(11)).notifications.every(n => n.href === "/admin/cases/101"), true);
  });
  test("marking an alert read persists while leaving other alerts unread", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted' WHERE id=101");
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    const own = await feed(11);
    await markCaseNotificationsRead(db, 11, { ids: [own.notifications[0].id] });
    const refreshed = await feed(11);
    assert.equal(refreshed.unreadCount, 1);
    assert.equal(refreshed.notifications[0].read, true);
  });
  test("mark-all respects the recipient and does not consume newly arriving alerts", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted'");
    const cutoff = (await feed(11)).latestNotificationId;
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    await markCaseNotificationsRead(db, 11, { beforeId: cutoff });
    assert.equal((await feed(11)).unreadCount, 1);
    assert.equal((await feed(22)).unreadCount, 1);
  });
  test("badge counts all unread alerts even when the dropdown is limited to 50", async () => {
    await sql("INSERT INTO public.documents SELECT n,101,'example.pdf',NULL FROM generate_series(1,65) n");
    const own = await feed(11);
    assert.equal(own.notifications.length, 50);
    assert.equal(own.unreadCount, 65);
    await markCaseNotificationsRead(db, 11, { beforeId: own.latestNotificationId });
    assert.equal((await feed(11)).unreadCount, 0);
  });
  test("reapplying the migration preserves alerts and does not duplicate triggers", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted' WHERE id=101");
    await sql(migration);
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    assert.equal((await feed(11)).unreadCount, 2);
  });
  test("deleting a case removes its notifications and broken links", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted' WHERE id=101");
    await sql("DELETE FROM public.client_cases WHERE id=101");
    assert.equal((await feed(11)).notifications.length, 0);
    assert.equal((await sql("SELECT COUNT(*)::int AS count FROM public.case_notifications")).rows[0].count, 0);
  });
  test("notification storage has row-level security enabled", async () => {
    const result = await client.query("SELECT relrowsecurity FROM pg_class WHERE oid=$1::regclass", [schema + ".case_notifications"]);
    assert.equal(result.rows[0].relrowsecurity, true);
  });
  test("browser roles cannot read notification storage or invoke its helpers directly", async () => {
    const roles = await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')");
    for (const { rolname } of roles.rows) {
      const result = await client.query(`
        SELECT has_table_privilege($1,$2,'SELECT') AS can_read,
          has_function_privilege($1,$3,'EXECUTE') AS can_emit,
          has_sequence_privilege($1,pg_get_serial_sequence($2,'id'),'USAGE') AS can_use_sequence
      `, [rolname, schema + ".case_notifications", schema + ".emit_case_notification(bigint,text,text)"]);
      assert.equal(result.rows[0].can_read, false);
      assert.equal(result.rows[0].can_emit, false);
      assert.equal(result.rows[0].can_use_sequence, false);
    }
  });
  test("relinking an employee login never exposes the previous login's historical alerts", async () => {
    await sql("UPDATE public.client_cases SET status='Submitted' WHERE id=101");
    await sql("UPDATE public.employees SET user_id=22 WHERE id=100");
    assert.equal((await feed(11)).notifications.length, 0);
    assert.equal((await feed(22)).notifications.length, 0);
    await sql("INSERT INTO public.documents VALUES (1,101,'example.pdf',NULL)");
    assert.equal((await feed(22)).unreadCount, 1);
    assert.equal((await feed(11)).unreadCount, 0);
  });
});
