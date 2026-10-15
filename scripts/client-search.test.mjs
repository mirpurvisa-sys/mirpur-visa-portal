import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";
import { buildClientSearch, clientReferenceSql, clientSearchOrderSql } from "../lib/clientSearch.ts";

test("blank searches do not add a filter or parameters", () => {
  for (const query of ["", " ", "\t\n"]) {
    assert.deepEqual(buildClientSearch(query), { condition: "", values: [] });
  }
});

test("search text is supplied as parameters, including quotes and SQL-looking text", () => {
  const query = "O'Brien' OR 1=1 --";
  const { condition, values } = buildClientSearch(query);
  assert.ok(condition.length > 0);
  assert.ok(values.length > 0);
  assert.ok(values.some((value) => value.includes("O'Brien'")));
  assert.ok(!condition.includes("O'Brien'"));
  assert.ok(!condition.includes("1=1"));
  assert.ok(!condition.includes("--"));
  assert.ok(condition.includes("$1"));
});

test("LIKE patterns escape literal percent, underscore, and backslash characters", () => {
  const { values } = buildClientSearch("%_\\");
  assert.ok(values.includes("%\\%\\_\\\\%"));
});

test("aliases, parameter offsets, and additional search expressions are honored", () => {
  const { condition, values } = buildClientSearch("Noor", "person", 7, ["r.receipt_no"]);
  assert.ok(condition.includes("person.firstname"));
  assert.ok(condition.includes("r.receipt_no"));
  assert.ok(!condition.includes("c.firstname"));
  const placeholders = [...new Set([...condition.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  assert.deepEqual(placeholders, values.map((_, index) => index + 7));
});

test("formatted CNICs include a punctuation-free parameter", () => {
  const { values } = buildClientSearch("12345-6789012-3");
  assert.ok(values.includes("%1234567890123%"));
});

test("a spaced numeric identifier is kept together for normalized matching", () => {
  const { values } = buildClientSearch("12345 6789012 3");
  assert.ok(values.includes("%1234567890123%"));
});

test("the reference expression uses the requested client alias", () => {
  const expression = clientReferenceSql("person");
  assert.ok(expression.includes("person.ref_id"));
  assert.ok(expression.includes("person.id"));
  assert.ok(expression.includes("MVC"));
  assert.ok(!expression.includes("c.ref_id"));
});

test("untrusted aliases are rejected before they can become SQL", () => {
  for (const alias of ["c; DROP TABLE clients", "c.id", "c alias", ""]) {
    assert.throws(() => buildClientSearch("Ada", alias), /Invalid client table alias/);
    assert.throws(() => clientReferenceSql(alias), /Invalid client table alias/);
  }
});

test("parameter offsets must be positive integers", () => {
  for (const offset of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => buildClientSearch("Ada", "c", offset), /Invalid search parameter offset/);
  }
});

test("blank searches do not add search-specific ordering", () => {
  assert.equal(clientSearchOrderSql("   "), "");
});

test("exact-match ordering reuses the requested alias and parameter offset", () => {
  const expression = clientSearchOrderSql("O'Brien", "person", 7);
  assert.ok(expression.includes("person.id"));
  assert.ok(expression.includes("$7"));
  assert.ok(!expression.includes("$1"));
  assert.ok(!expression.includes("O'Brien"));
});

test("record ID ordering uses a trusted expression and the existing parameter offset", () => {
  const expression = clientSearchOrderSql("5011", "person", 7, "a.id::text");
  assert.ok(expression.includes("a.id::text"));
  assert.ok(expression.includes("person.id"));
  assert.ok(expression.includes("$7"));
  assert.ok(!expression.includes("$1"));
  assert.ok(!expression.includes("5011"));
});

// Database execution is opt-in. Every query below uses synthetic CTE rows only;
// the transaction is read-only and no application tables are referenced.
const runDatabaseTests = process.env.RUN_DATABASE_SEARCH_TESTS === "1";
const fixture = String.raw`
  WITH clients (
    id, ref_id, firstname, lastname, email, phone, phone2, cnic, city,
    province, country, address, passport_no, destination_country, visa_category
  ) AS (
    VALUES
      (5011, 'REF-701/MVC/2026', 'Ada', 'Noor', 'Ada.Noor@example.invalid',
       '0330-123-4567', '0301 555 0199', '12345-6789012-3', 'Lahore',
       'Punjab', 'Pakistan', '12 Example Lane', 'PX123456', 'Canada', 'Study'),
      (6022, '', 'Ben', 'River', 'ben.river@example.invalid',
       '+92 (331) 444-7788', NULL, '54321-7654321-9', 'Karachi',
       'Sindh', 'Pakistan', '100% Plaza_Unit\West', 'PY987654', 'Australia', 'Visitor'),
      (7133, NULL, 'Cora', 'Lake', NULL,
       NULL, NULL, NULL, 'Islamabad',
       'Capital', 'Pakistan', NULL, NULL, NULL, NULL)
  ), record_fields (client_id, receipt_no, appointment_country, service_description) AS (
    VALUES
      (5011, 'REC-1001', 'Canada', 'Priority service'),
      (6022, 'BOOK_2002', 'Australia', 'Document checking'),
      (7133, NULL, NULL, NULL)
  )
`;

describe("PostgreSQL search against synthetic clients", { skip: !runDatabaseTests }, () => {
  let client;
  let transactionStarted = false;

  before(async () => {
    const require = createRequire(import.meta.url);
    require("dotenv").config({ path: ".env.local", quiet: true });
    require("dotenv").config({ quiet: true });
    assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for opt-in database tests");
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.searchParams.delete("sslmode");
    const { Client } = require("pg");
    client = new Client({
      connectionString: databaseUrl.toString(),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      await client.query("BEGIN READ ONLY");
      transactionStarted = true;
      await client.query("SET LOCAL statement_timeout = '5s'");
    } catch (error) {
      if (transactionStarted) await client.query("ROLLBACK").catch(() => {});
      await client.end().catch(() => {});
      client = undefined;
      throw error;
    }
  });

  after(async () => {
    if (!client) return;
    try {
      if (transactionStarted) await client.query("ROLLBACK");
    } finally {
      await client.end();
    }
  });

  async function matchingIds(query, extraExpressions = []) {
    const { condition, values } = buildClientSearch(query, "c", 1, extraExpressions);
    const result = await client.query(
      `${fixture}
       SELECT c.id FROM clients c
       LEFT JOIN record_fields r ON r.client_id = c.id
       ${condition ? `WHERE ${condition}` : ""}
       ORDER BY c.id`,
      values,
    );
    return result.rows.map((row) => row.id);
  }

  const cases = [
    ["blank input returns all synthetic clients", "   ", [5011, 6022, 7133]],
    ["full name", "Ada Noor", [5011]],
    ["reversed name order", "Noor Ada", [5011]],
    ["name and city together", "Noor Lahore", [5011]],
    ["city before name", "Lahore Noor", [5011]],
    ["terms from different people do not combine into a match", "Ada Karachi", []],
    ["exact client ID", "5011", [5011]],
    ["partial client ID", "602", [6022]],
    ["formatted CNIC", "12345-6789012-3", [5011]],
    ["punctuation-free CNIC", "1234567890123", [5011]],
    ["CNIC with spaces", "12345 6789012 3", [5011]],
    ["partial CNIC", "6789012", [5011]],
    ["stored local phone", "0330-123-4567", [5011]],
    ["punctuation-free local phone", "03301234567", [5011]],
    ["international phone matches stored local phone", "+92 330 123 4567", [5011]],
    ["double-zero country prefix matches stored local phone", "0092-330-123-4567", [5011]],
    ["local phone matches stored international phone", "03314447788", [6022]],
    ["formatted international phone", "+92 (331) 444-7788", [6022]],
    ["second phone", "03015550199", [5011]],
    ["partial phone", "5550199", [5011]],
    ["a short country prefix does not match every phone", "92", [6022]],
    ["a missing short prefix does not turn into an empty wildcard", "0092", []],
    ["an absent short number does not match all clients", "8", [5011, 6022]],
    ["exact email ignores case", "ADA.NOOR@EXAMPLE.INVALID", [5011]],
    ["partial email", "ben.river", [6022]],
    ["city ignores case", "kArAcHi", [6022]],
    ["reference number", "REF-701/MVC/2026", [5011]],
    ["partial reference", "REF-701", [5011]],
    ["punctuation-free reference", "REF701MVC2026", [5011]],
    ["empty reference uses displayed fallback", "6022/MVC/2026", [6022]],
    ["null reference uses displayed fallback", "7133/MVC/2026", [7133]],
    ["null profile fields do not hide a matching name", "Cora Lake", [7133]],
    ["province", "Punjab", [5011]],
    ["country", "Pakistan", [5011, 6022, 7133]],
    ["address", "Example Lane", [5011]],
    ["passport number", "PX123456", [5011]],
    ["destination country", "Canada", [5011]],
    ["visa category", "Visitor", [6022]],
    ["literal percent is not a wildcard", "%", [6022]],
    ["literal underscore is not a wildcard", "_", [6022]],
    ["literal backslash", "\\", [6022]],
    ["address containing LIKE metacharacters", String.raw`100% Plaza_Unit\West`, [6022]],
    ["SQL-looking text does not match every client", "' OR 1=1 --", []],
    ["no matching information", "Nobody-Exists", []],
  ];

  for (const [label, query, expected] of cases) {
    test(label, async () => {
      assert.deepEqual(await matchingIds(query), expected);
    });
  }

  test("short zero does not turn empty phone fields into wildcard matches", async () => {
    const { condition, values } = buildClientSearch("0");
    const result = await client.query(
      `${fixture}, search_clients AS (
        SELECT id, CASE WHEN id = 7133 THEN 'CASE7133' ELSE ref_id END AS ref_id,
               firstname, lastname, email, phone, phone2, cnic,
               city, province, country, address, passport_no,
               destination_country, visa_category
        FROM clients
       )
       SELECT c.id FROM search_clients c WHERE ${condition} ORDER BY c.id`,
      values,
    );
    assert.deepEqual(result.rows.map((row) => row.id), [5011, 6022]);
  });

  test("additional record fields can identify a client", async () => {
    assert.deepEqual(await matchingIds("REC-1001", ["r.receipt_no"]), [5011]);
  });

  test("client and record terms can be combined", async () => {
    assert.deepEqual(await matchingIds("Ada Priority", ["r.service_description"]), [5011]);
  });

  test("additional record fields still escape wildcard characters", async () => {
    assert.deepEqual(await matchingIds("BOOK_2002", ["r.receipt_no"]), [6022]);
  });

  test("clientReferenceSql returns saved references and both fallback forms", async () => {
    const result = await client.query(
      `${fixture} SELECT c.id, ${clientReferenceSql("c")} AS reference FROM clients c ORDER BY c.id`,
    );
    assert.deepEqual(result.rows, [
      { id: 5011, reference: "REF-701/MVC/2026" },
      { id: 6022, reference: "6022/MVC/2026" },
      { id: 7133, reference: "7133/MVC/2026" },
    ]);
  });

  test("an exact client ID is ranked ahead of a newer substring match", async () => {
    const query = "5011";
    const { condition, values } = buildClientSearch(query);
    const result = await client.query(
      `${fixture}, search_clients AS (
        SELECT * FROM clients
        UNION ALL
        SELECT 15011, ref_id, firstname, lastname, email, phone, phone2, cnic,
               city, province, country, address, passport_no,
               destination_country, visa_category
        FROM clients WHERE id = 6022
       )
       SELECT c.id FROM search_clients c WHERE ${condition}
       ORDER BY ${clientSearchOrderSql(query)}, c.id DESC`,
      values,
    );
    assert.deepEqual(result.rows.map((row) => row.id), [5011, 15011]);
  });

  test("an exact appointment ID wins over a different client's matching ID", async () => {
    const query = "5011";
    const { condition, values } = buildClientSearch(query, "c", 1, ["a.id::text"]);
    const result = await client.query(
      `${fixture}, appointments (id, client_id) AS (
        VALUES (5011, 6022), (199, 5011)
       )
       SELECT a.id, c.id AS client_id
       FROM appointments a JOIN clients c ON c.id = a.client_id
       WHERE ${condition}
       ORDER BY ${clientSearchOrderSql(query, "c", 1, "a.id::text")}, a.id DESC
       LIMIT 1`,
      values,
    );
    assert.deepEqual(result.rows, [{ id: 5011, client_id: 6022 }]);
  });
});
