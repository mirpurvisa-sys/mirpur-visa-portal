import assert from "node:assert/strict";
import test from "node:test";
import {
  AppointmentClientConflictError,
  resolveAppointmentClient,
} from "../lib/appointmentClient.ts";

const EMAIL = "client@example.com";
const CNIC = "12345-1234567-1";

function fakeDb(initialRows = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const queries = [];
  return {
    rows,
    queries,
    async query(sql, values = []) {
      queries.push({ sql, values: [...values] });
      const requestedEmails = values
        .filter((value) => typeof value === "string" && value.includes("@"))
        .map((value) => value.trim().toLowerCase());
      const requestedCnics = values.filter(
        (value) => typeof value === "string" && value && !value.includes("@"),
      );
      return {
        rows: rows.filter(
          (row) =>
            (row.email && requestedEmails.includes(row.email.trim().toLowerCase())) ||
            (row.cnic && requestedCnics.includes(row.cnic)),
        ).map((row) => ({ ...row })),
      };
    },
  };
}

function unexpectedInsert() {
  assert.fail("An existing client must be reused without inserting or replacing their details.");
}

test("reuses an existing email without changing the stored client", async () => {
  const row = { id: "41", email: EMAIL, cnic: CNIC };
  const db = fakeDb([row]);
  const id = await resolveAppointmentClient(db, { email: EMAIL, cnic: null }, unexpectedInsert);
  assert.equal(id, 41);
  assert.deepEqual(db.rows, [row]);
});

test("normalizes email case and surrounding whitespace before matching", async () => {
  const db = fakeDb([{ id: 41, email: "Client@Example.COM", cnic: null }]);
  const id = await resolveAppointmentClient(
    db,
    { email: "  CLIENT@example.com  ", cnic: null },
    unexpectedInsert,
  );
  assert.equal(id, 41);
  assert.ok(db.queries.some((query) => query.values.includes(EMAIL)));
});

test("reuses an exact CNIC match when email is absent", async () => {
  const db = fakeDb([{ id: 42, email: EMAIL, cnic: CNIC }]);
  assert.equal(
    await resolveAppointmentClient(db, { email: null, cnic: CNIC }, unexpectedInsert),
    42,
  );
});

test("accepts matching email and CNIC for the same client", async () => {
  const db = fakeDb([{ id: 42, email: EMAIL, cnic: CNIC }]);
  assert.equal(
    await resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    42,
  );
});

test("allows a new identifier when the matched client's stored identifier is empty", async () => {
  const db = fakeDb([{ id: 42, email: EMAIL, cnic: null }]);
  assert.equal(
    await resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    42,
  );
  assert.equal(db.rows[0].cnic, null);
});

test("allows email on a CNIC match with no stored email and preserves the profile", async () => {
  const db = fakeDb([{ id: 42, email: null, cnic: CNIC }]);
  assert.equal(
    await resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    42,
  );
  assert.equal(db.rows[0].email, null);
});

test("creates a new client when neither identifier matches", async () => {
  const db = fakeDb([{ id: 41, email: "other@example.com", cnic: "99999-9999999-9" }]);
  let inserts = 0;
  const id = await resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, async () => {
    inserts += 1;
    return { rows: [{ id: "43" }] };
  });
  assert.equal(id, 43);
  assert.equal(inserts, 1);
});

test("empty identifiers create a distinct client instead of matching empty profiles", async () => {
  const db = fakeDb([{ id: 41, email: null, cnic: null }]);
  let inserts = 0;
  const id = await resolveAppointmentClient(db, { email: null, cnic: null }, async () => {
    inserts += 1;
    return { rows: [{ id: 44 }] };
  });
  assert.equal(id, 44);
  assert.equal(inserts, 1);
});

test("rejects a CNIC that contradicts the matched email's stored CNIC", async () => {
  const db = fakeDb([{ id: 41, email: EMAIL, cnic: "99999-9999999-9" }]);
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    AppointmentClientConflictError,
  );
});

test("rejects an email that contradicts the matched CNIC's stored email", async () => {
  const db = fakeDb([{ id: 41, email: "other@example.com", cnic: CNIC }]);
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    AppointmentClientConflictError,
  );
});

test("rejects email and CNIC that identify different clients", async () => {
  const db = fakeDb([
    { id: 41, email: EMAIL, cnic: null },
    { id: 42, email: null, cnic: CNIC },
  ]);
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, unexpectedInsert),
    AppointmentClientConflictError,
  );
});

test("rejects ambiguous case-insensitive email matches", async () => {
  const db = fakeDb([
    { id: 41, email: EMAIL, cnic: null },
    { id: 42, email: EMAIL.toUpperCase(), cnic: null },
  ]);
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: null }, unexpectedInsert),
    AppointmentClientConflictError,
  );
});

test("rejects ambiguous CNIC matches conservatively", async () => {
  const db = fakeDb([
    { id: 41, email: null, cnic: CNIC },
    { id: 42, email: null, cnic: CNIC },
  ]);
  await assert.rejects(
    resolveAppointmentClient(db, { email: null, cnic: CNIC }, unexpectedInsert),
    AppointmentClientConflictError,
  );
});

for (const identity of [
  { email: EMAIL, cnic: null },
  { email: null, cnic: CNIC },
]) {
  test(`recovers the concurrent ${identity.email ? "email" : "CNIC"} insertion with a separate lookup`, async () => {
    const db = fakeDb();
    let inserts = 0;
    let queryCountAtInsert = 0;
    const id = await resolveAppointmentClient(db, identity, async () => {
      inserts += 1;
      queryCountAtInsert = db.queries.length;
      db.rows.push({ id: "45", ...identity });
      return { rows: [] };
    });
    assert.equal(id, 45);
    assert.equal(inserts, 1);
    assert.ok(db.queries.length > queryCountAtInsert);
  });
}

test("rejects identity contradictions found after a concurrent insertion", async () => {
  const db = fakeDb();
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: CNIC }, async () => {
      db.rows.push({ id: 45, email: EMAIL, cnic: "99999-9999999-9" });
      return { rows: [] };
    }),
    AppointmentClientConflictError,
  );
});

test("does not hide an unexplained insertion conflict as an identity error", async () => {
  const db = fakeDb();
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: null }, async () => ({ rows: [] })),
    (error) => {
      assert.ok(error instanceof Error);
      assert.ok(!(error instanceof AppointmentClientConflictError));
      return true;
    },
  );
});

test("propagates lookup database errors without attempting an insert", async () => {
  const failure = new Error("Database connection unavailable");
  const db = { async query() { throw failure; } };
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: null }, unexpectedInsert),
    (error) => error === failure,
  );
});

test("propagates insertion errors", async () => {
  const failure = Object.assign(new Error("A different unique constraint failed"), {
    code: "23505",
    constraint: "unrelated_constraint",
  });
  await assert.rejects(
    resolveAppointmentClient(fakeDb(), { email: EMAIL, cnic: null }, async () => { throw failure; }),
    (error) => error === failure,
  );
});

test("propagates the second lookup's database error after an insertion conflict", async () => {
  const failure = new Error("Database connection lost during conflict recovery");
  let inserted = false;
  const db = {
    async query() {
      if (inserted) throw failure;
      return { rows: [] };
    },
  };
  await assert.rejects(
    resolveAppointmentClient(db, { email: EMAIL, cnic: null }, async () => {
      inserted = true;
      return { rows: [] };
    }),
    (error) => error === failure,
  );
});
