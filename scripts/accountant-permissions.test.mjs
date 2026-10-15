import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function evaluate(source, imports = {}, globals = {}) {
  const context = { exports: {}, ...globals, require(name) {
    if (name in imports) return imports[name];
    throw new Error("Unexpected import: " + name);
  } };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
}
const config = evaluate(readFileSync(new URL("../lib/adminConfig.ts", import.meta.url), "utf8"));
const permissions = evaluate(readFileSync(new URL("../lib/permissions.ts", import.meta.url), "utf8"), { "./adminConfig": config });
const user = (role, extra = {}) => ({ id: 7, userType: "Employee", roleSlugs: [role], permissionSlugs: [], ...extra });
const accountant = user("accountant");
const resource = key => {
  const result = config.getResource(key);
  assert.ok(result, "Missing resource: " + key);
  return result;
};

test("accountant is recognized from a linked role or the employee designation", () => {
  for (const account of [accountant, user("Accountant"), user("", { userType: "Accountant", roleSlugs: [] }), user(" accountant ")]) {
    assert.equal(permissions.isAccountant(account), true);
    assert.equal(permissions.canViewFinance(account), true);
    assert.equal(permissions.isAdmin(account), false);
  }
});

for (const key of ["incomes", "expenses", "case-installments"]) {
  test(`accountant can view, create, edit and delete ${key}`, () => {
    const res = resource(key);
    assert.equal(permissions.canViewResource(accountant, key), true);
    assert.equal(permissions.canCreateResource(accountant, res), true);
    assert.equal(permissions.canEditResource(accountant, res), true);
    assert.equal(permissions.canDeleteResource(accountant, res), true);
    assert.equal(permissions.requireResourceAccess(accountant, res), true);
  });
}
for (const key of ["clients", "cases", "appointments", "employees", "ielts", "life-skills"]) {
  test(`accountant can reconcile ${key} without general record-management rights`, () => {
    const res = resource(key);
    assert.equal(permissions.canViewResource(accountant, key), true);
    assert.equal(permissions.canCreateResource(accountant, res), false);
    assert.equal(permissions.canEditResource(accountant, res), false);
    assert.equal(permissions.canDeleteResource(accountant, res), false);
  });
}
for (const key of ["users", "roles", "permissions", "documents", "families"]) {
  test(`accountant does not gain administrator access to ${key}`, () => {
    const res = resource(key);
    assert.equal(permissions.canViewResource(accountant, key), false);
    assert.equal(permissions.canCreateResource(accountant, res), false);
    assert.equal(permissions.canEditResource(accountant, res), false);
    assert.equal(permissions.canDeleteResource(accountant, res), false);
  });
}
test("dedicated payment operations are enabled without case editing", () => {
  assert.equal(permissions.canManageCaseFinance(accountant), true);
  assert.equal(permissions.canManageAppointmentPayments(accountant), true);
  assert.equal(permissions.canEditResource(accountant, resource("cases")), false);
  assert.equal(permissions.canSearch(accountant), true);
});
test("accountants can work on their own assigned case without general case-edit permission", () => {
  assert.equal(permissions.canWorkOnCase(accountant, 7), true);
  assert.equal(permissions.canWorkOnCase(accountant, "7"), true);
  assert.equal(permissions.canWorkOnCase(accountant, 8), false);
  assert.equal(permissions.canWorkOnCase(accountant, null), false);
  assert.equal(permissions.canWorkOnCase(accountant, undefined), false);
  assert.equal(permissions.canWorkOnCase(user("", { userType: "Accountant", roleSlugs: [] }), 7), true);
  assert.equal(permissions.canWorkOnCase(user("teacher"), 7), false);
  assert.equal(permissions.canWorkOnCase(user("case_officer"), 8), true);
  assert.equal(permissions.canWorkOnCase(user("admin"), 8), true);
});
test("financial fields and entered values remain available to accountant forms", () => {
  const res = resource("case-installments");
  assert.equal(permissions.visibleResourceForUser(accountant, res), res);
  const values = { amount: "1200", total: 5000 };
  assert.equal(permissions.protectFinanceData(accountant, res, values, "edit"), values);
});
test("other employee roles still cannot create, change or delete finance records", () => {
  for (const role of ["case_officer", "receptionist", "teacher", "unknown"]) {
    const employee = user(role, { permissionSlugs: ["delete"] });
    assert.equal(permissions.canViewFinance(employee), false);
    assert.equal(permissions.canManageCaseFinance(employee), false);
    for (const key of ["incomes", "expenses", "case-installments"]) {
      const res = resource(key);
      assert.equal(permissions.canViewResource(employee, key), false);
      assert.equal(permissions.canCreateResource(employee, res), false);
      assert.equal(permissions.canEditResource(employee, res), false);
      assert.equal(permissions.canDeleteResource(employee, res), false);
    }
  }
});
test("admin rights and receptionist payment rights remain intact", () => {
  const admin = user("admin");
  for (const res of config.resources) {
    assert.equal(permissions.canViewResource(admin, res.key), true);
    assert.equal(permissions.canCreateResource(admin, res), true);
    assert.equal(permissions.canEditResource(admin, res), true);
    assert.equal(permissions.canDeleteResource(admin, res), true);
  }
  assert.equal(permissions.canManageAppointmentPayments(user("receptionist")), true);
});

function serverFunction(path, name, globals) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, "Missing action: " + name);
  return evaluate("export " + found.getText(ast), {}, globals)[name];
}

function actionContext(currentUser = accountant) {
  const queries = [], calls = [];
  const db = { async query(sql, values) {
    queries.push({ sql, values });
    return { rows: [{ id: 91, appointment_id: 52 }] };
  } };
  return { queries, calls, globals: {
    requireUser: async () => currentUser,
    canManageCaseFinance: permissions.canManageCaseFinance,
    canViewResource: permissions.canViewResource,
    canEditResource: permissions.canEditResource,
    canManageAppointmentPayments: permissions.canManageAppointmentPayments,
    getResource: config.getResource,
    getDb: () => db, caseId: 91,
    text: (form, name, fallback = "") => String(form.get(name) || fallback).trim(),
    numberValue: (form, name) => Number(form.get(name) || 0),
    syncAppointmentIncome: async id => calls.push(["income", id]),
    syncCaseTotals: async id => calls.push(["totals", id]),
    recordActivity: () => calls.push(["activity"]),
    revalidatePath: () => calls.push(["refresh"]),
    redirect: path => { throw Object.assign(new Error("redirect"), { location: path }); },
  } };
}
const paymentForm = () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ total: "5000", advance: "1000", appointment_fee: "500", appointmentstatus: "Paid", employee_id: "999", status: "Completed", client_name: "tampered" })) form.set(key, value);
  return form;
};
test("case finance action only changes financial columns even with forged case fields", async () => {
  const context = actionContext();
  const action = serverFunction("../app/admin/cases/[id]/page.tsx", "updateCaseFinance", context.globals);
  await assert.rejects(action(paymentForm()), error => error.location === "/admin/cases/91");
  assert.equal(context.queries.length, 1);
  assert.ok(!/employee_id\s*=|client_name\s*=|\bstatus\s*=/.test(context.queries[0].sql));
  assert.equal(JSON.stringify(context.queries[0].values), JSON.stringify([5000, 91, 500, "Paid", 1000]));
  assert.ok(context.calls.some(call => call[0] === "income" && call[1] === 52));
  assert.ok(context.calls.some(call => call[0] === "totals" && call[1] === 91));
});
test("case finance action rejects unauthorized employees before writing", async () => {
  const context = actionContext(user("case_officer"));
  const action = serverFunction("../app/admin/cases/[id]/page.tsx", "updateCaseFinance", context.globals);
  await assert.rejects(action(paymentForm()), /permission/);
  assert.equal(context.queries.length, 0);
});
test("invalid finance amounts and payment statuses do not write to the database", async () => {
  for (const [key, value] of [["total", "-1"], ["advance", "-1"], ["appointment_fee", "-1"], ["appointmentstatus", "Completed"]]) {
    const context = actionContext();
    const action = serverFunction("../app/admin/cases/[id]/page.tsx", "updateCaseFinance", context.globals);
    const form = paymentForm(); form.set(key, value);
    await assert.rejects(action(form));
    assert.equal(context.queries.length, 0);
  }
});
test("appointment payment-only action ignores forged scheduling fields", async () => {
  const context = actionContext();
  const action = serverFunction("../app/admin/appointments/page.tsx", "updateAppointment", context.globals);
  const form = new FormData();
  for (const [key, value] of Object.entries({ id: "52", fee: "750", appointmentstatus: "Paid", category: "forged", appointmentdate: "1999-01-01" })) form.set(key, value);
  await assert.rejects(action(form), error => error.location === "/admin/appointments");
  const update = context.queries.find(q => /UPDATE appointments/.test(q.sql));
  assert.ok(update);
  assert.ok(!/category\s*=|appointmentdate\s*=/.test(update.sql));
  assert.equal(JSON.stringify(update.values), JSON.stringify([750, "Paid", 52]));
  assert.ok(context.calls.some(call => call[0] === "totals"));
});

function genericContext() {
  const context = actionContext();
  Object.assign(context.globals, {
    key: "case-installments", id: "88",
    canCreateResource: permissions.canCreateResource,
    canDeleteResource: permissions.canDeleteResource,
    visibleResourceForUser: permissions.visibleResourceForUser,
    protectFinanceData: permissions.protectFinanceData,
    parseRecordWhere: () => ({ id: 88 }),
    formToData: async () => ({ client_case_id: 92, amount: "200" }),
    shouldRevalidateFinance: () => true,
    revalidateFinanceCache: () => context.calls.push(["cache"]),
    changedFields: data => Object.keys(data),
    syncCaseInstallmentIncome: async id => context.calls.push(["installment-income", id]),
    deleteCaseInstallmentIncome: async id => context.calls.push(["remove-income", id]),
    delegate: () => ({
      findUnique: async () => ({ id: 88, client_case_id: 91 }),
      update: async () => ({ id: 88, client_case_id: 92 }),
      create: async () => ({ id: 88, client_case_id: 92 }),
      delete: async () => ({ id: 88, client_case_id: 91 }),
    }),
  });
  return context;
}
test("creating an installment updates its source income and case balance", async () => {
  const context = genericContext();
  const action = serverFunction("../app/admin/[resource]/new/page.tsx", "createAction", context.globals);
  await assert.rejects(action(new FormData()), error => error.location === "/admin/case-installments");
  assert.ok(context.calls.some(call => call[0] === "installment-income" && call[1] === 88));
  assert.ok(context.calls.some(call => call[0] === "totals" && call[1] === 92));
});
test("moving an installment recalculates both the former and current case", async () => {
  const context = genericContext();
  const action = serverFunction("../app/admin/[resource]/[id]/edit/page.tsx", "updateAction", context.globals);
  await assert.rejects(action(new FormData()), error => error.location === "/admin/case-installments");
  assert.ok(context.calls.some(call => call[0] === "installment-income" && call[1] === 88));
  assert.ok(context.calls.some(call => call[0] === "totals" && call[1] === 91));
  assert.ok(context.calls.some(call => call[0] === "totals" && call[1] === 92));
});
test("removing an installment removes its synchronized income and recalculates the case", async () => {
  const context = genericContext();
  const action = serverFunction("../app/admin/[resource]/[id]/edit/page.tsx", "deleteAction", context.globals);
  await assert.rejects(action(), error => error.location === "/admin/case-installments");
  assert.ok(context.calls.some(call => call[0] === "remove-income" && call[1] === 88));
  assert.ok(context.calls.some(call => call[0] === "totals" && call[1] === 91));
});

function assignedContext(assignedUserId) {
  const context = actionContext();
  context.globals.canWorkOnCase = permissions.canWorkOnCase;
  context.globals.nullableText = (form, key) => form.get(key) || null;
  context.globals.getDb = () => ({ async query(sql, values) {
    context.queries.push({ sql, values });
    if (sql.includes("SELECT cc.client_id")) return { rows: [{ client_id: 25, employee_id: 100, user_id: assignedUserId }] };
    return { rows: [] };
  } });
  context.globals.requireCaseWork = serverFunction("../app/admin/cases/[id]/page.tsx", "requireCaseWork", context.globals);
  return context;
}
for (const name of ["updateClient", "updateCase", "uploadDocuments", "deleteDocument"]) {
  test(`accountant ${name} action refuses a case currently assigned to someone else`, async () => {
    const context = assignedContext(8);
    const action = serverFunction("../app/admin/cases/[id]/page.tsx", name, context.globals);
    await assert.rejects(action(new FormData()), /assigned to you/);
    assert.equal(context.queries.length, 1);
    assert.ok(!/UPDATE|INSERT|DELETE/.test(context.queries[0].sql));
  });
}
test("editing a client from an assigned case ignores a forged client ID", async () => {
  const context = assignedContext(7);
  const action = serverFunction("../app/admin/cases/[id]/page.tsx", "updateClient", context.globals);
  const form = new FormData(); form.set("client_id", "999"); form.set("firstname", "Example");
  await assert.rejects(action(form), error => error.location === "/admin/cases/91");
  assert.equal(context.queries.length, 2);
  assert.equal(context.queries[1].values.at(-1), 25);
});
test("an accountant cannot reassign their case through a forged update form", async () => {
  const context = assignedContext(7);
  Object.assign(context.globals, {
    dateValue: () => "2026-10-15", dateTimeValue: () => "2026-10-15 10:00",
    canViewFinance: permissions.canViewFinance,
    checkboxValue: () => 0, textFromValue: (value, fallback) => value || fallback,
  });
  const action = serverFunction("../app/admin/cases/[id]/page.tsx", "updateCase", context.globals);
  const form = new FormData(); form.set("employee_id", "999");
  await assert.rejects(action(form), error => error.location === "/admin/cases/91");
  const update = context.queries.find(query => query.sql.includes('UPDATE "client_cases"'));
  assert.ok(update);
  assert.equal(update.values[0], 100);
});
