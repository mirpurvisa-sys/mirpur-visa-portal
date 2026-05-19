require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "client-documents";
const prefix = "uploads/docs";

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function listAllStorageFiles(path) {
  let all = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data.filter((item) => item.name));
    if (data.length < limit) break;

    offset += limit;
  }

  return all.map((item) => `${path}/${item.name}`);
}

async function getAllDocuments() {
  let all = [];
  let from = 0;
  const size = 1000;

  while (true) {
    const to = from + size - 1;

    const { data, error } = await supabase
      .from("documents")
      .select("id, client_case_id, document, document_type, created_at")
      .not("document", "is", null)
      .range(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    if (data.length < size) break;

    from += size;
  }

  return all;
}

function cleanName(name) {
  return String(name || "").trim();
}

async function main() {
  const storageFiles = await listAllStorageFiles(prefix);
  const storageSet = new Set(storageFiles);

  const docs = await getAllDocuments();

  const missing = docs
    .map((doc) => {
      const fileName = cleanName(doc.document);
      const storagePath = `${prefix}/${fileName}`;

      return {
        ...doc,
        expected_storage_path: storagePath,
        exists: storageSet.has(storagePath),
      };
    })
    .filter((row) => !row.exists);

  console.log(`Total DB documents: ${docs.length}`);
  console.log(`Total storage files in ${bucket}/${prefix}: ${storageFiles.length}`);
  console.log(`Missing files: ${missing.length}`);

  if (missing.length) {
    console.table(
      missing.slice(0, 50).map((row) => ({
        id: row.id,
        case: row.client_case_id,
        document: row.document,
        expected: row.expected_storage_path,
      }))
    );
  }

  const fs = require("fs");
  fs.writeFileSync(
    "missing-documents.json",
    JSON.stringify(missing, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    "missing-documents.csv",
    [
      "id,client_case_id,document,document_type,expected_storage_path,created_at",
      ...missing.map((row) =>
        [
          row.id,
          row.client_case_id,
          `"${String(row.document || "").replace(/"/g, '""')}"`,
          row.document_type,
          `"${row.expected_storage_path.replace(/"/g, '""')}"`,
          row.created_at,
        ].join(",")
      ),
    ].join("\n"),
    "utf8"
  );

  console.log("Saved: missing-documents.json");
  console.log("Saved: missing-documents.csv");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

