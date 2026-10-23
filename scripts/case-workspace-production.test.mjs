// Run after `npm run build`. Exercises real compiled forms and server actions against fixture data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const secret = randomUUID();
const preload = fileURLToPath(new URL("./fixtures/case-workspace-db.cjs", import.meta.url)).replaceAll("\\", "/");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: `--require="${preload}"`,
    CASE_WORKSPACE_TEST_DB: "1", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture",
    NEXTAUTH_SECRET: secret, NEXTAUTH_URL: origin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", data => { logs += data; });
server.stderr.on("data", data => { logs += data; });
const started = Date.now();
const decode = value => value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attributes = html => Object.fromEntries(Array.from(html.matchAll(/([\w:$-]+)="([^"]*)"/g), match => [match[1], decode(match[2])]));
function cookie(id) {
  const payload = Buffer.from(JSON.stringify({ userId: id, expiresAt: Date.now() + 60000 })).toString("base64url");
  return `mvc_admin_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
async function getPage(id, path) {
  const response = await fetch(origin + path, { headers: { cookie: cookie(id) }, signal: AbortSignal.timeout(10000) });
  const html = await response.text();
  assert.equal(response.status, 200, html.slice(-1000));
  assert.doesNotMatch(html, /Functions cannot be passed|NEXT_HTTP_ERROR_FALLBACK|"digest":/);
  return html;
}
function actionForm(html, formId) {
  const form = Array.from(html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g))
    .find(match => attributes(match[1]).id === formId || (formId.startsWith("button:") && match[2].includes(formId.slice(7))));
  assert.ok(form, "Missing form: " + formId);
  const data = new FormData();
  for (const input of form[2].matchAll(/<input\b([^>]*)>/g)) {
    const attr = attributes(input[1]);
    if (attr.name?.startsWith("$ACTION_")) data.append(attr.name, attr.value ?? "");
  }
  assert.ok(Array.from(data.keys()).some(key => key.startsWith("$ACTION_")), "Server action was not serialized");
  return data;
}
async function submit(id, path, form) {
  const response = await fetch(origin + path, { method: "POST", headers: { cookie: cookie(id), origin }, body: form, redirect: "manual", signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 303, (await response.text()).slice(-1500));
  assert.match(response.headers.get("location"), /\/admin\/cases\/170[56]$/);
}
try {
  while (true) {
    try { await fetch(origin + "/login", { signal: AbortSignal.timeout(2000) }); break; } catch {
      if (server.exitCode !== null || Date.now() - started > 30000) throw new Error("Test server did not start: " + logs);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  for (const [userId, caseId] of [[1,1705], [9,1705], [11,1706]]) {
    const path = `/admin/cases/${caseId}`;
    assert.match(await getPage(userId, path), /View Case/);
    let edit = await getPage(userId, path + "?mode=edit");
    assert.match(edit, /Edit Case/);
    assert.match(edit, /documentUploadForm/);
    const form = actionForm(edit, "case-update-" + caseId);
    for (const [key, value] of Object.entries({ client_name: "Fixture Client", employee_id: caseId === 1705 ? "100" : "101",
      total: "5000", advance: "1000", appointment_fee: "0", appointmentstatus: "Unpaid", appointment_category: "visit",
      appointmentdate: "2026-10-17T10:00", caseCategory: "Visit", startDate: "2026-10-17", status: "Pending",
      description: `Saved by fixture user ${userId}`, documents_note: `Documents for fixture user ${userId}` })) form.set(key, value);
    await submit(userId, path + "?mode=edit", form);
    edit = await getPage(userId, path + "?mode=edit");
    assert.match(edit, new RegExp(`value="Saved by fixture user ${userId}"`));
    assert.match(edit, new RegExp(`value="Documents for fixture user ${userId}"`));
    assert.match(edit, /value="Pending" selected=""/);
    console.log(`PASS: user ${userId} can view, open edit, submit the compiled server action, and reload saved fields`);
  }
  const casePath = "/admin/cases/1706";
  async function changeCompletion(userId, label, expectedStatus) {
    const form = actionForm(await getPage(userId,casePath), "button:" + label);
    form.set("case_id","1706");
    const response = await fetch(origin+casePath, {method:"POST",headers:{cookie:cookie(userId),origin},body:form,redirect:"manual",signal:AbortSignal.timeout(10000)});
    const body = await response.text();
    assert.ok([200,303].includes(response.status),body.slice(-1500));
    const html=await getPage(userId,casePath);
    assert.match(html,expectedStatus === "Completed" ? /This case is completed/ : /This case is ongoing/);
    return html;
  }
  const completed = await changeCompletion(11,"Mark completed","Completed");
  assert.match(completed,/Undo completed/);
  assert.doesNotMatch(await getPage(9,casePath),/>Undo completed</);
  assert.match(await getPage(1,casePath),/Undo completed/);
  const reopened=await changeCompletion(11,"Undo completed","In Progress");
  assert.match(reopened,/Mark completed/);
  await changeCompletion(11,"Mark completed","Completed");
  await changeCompletion(1,"Undo completed","In Progress");
  console.log("PASS: compiled completion and undo forms reopen cases for assignees and admins, with read-only access for other employees");
  assert.doesNotMatch(logs, /Functions cannot be passed|Unhandled Rejection|Unexpected fixture query/);
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill();
  if (server.exitCode === null) await new Promise(resolve => server.once("exit", resolve));
}
