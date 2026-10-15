import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { caseVisibilitySql } from "@/lib/caseAccess";
import { getDb } from "@/lib/db";
import { canViewResource } from "@/lib/permissions";
import { createCaseDocumentSignedUrl, storagePathFromDocumentValue } from "@/lib/supabaseStorage";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string; id: string }> }) {
  const user = await requireUser();
  if (!canViewResource(user, "cases")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { documentId, id } = await params;
  const caseId = Number(id);
  const parsedDocumentId = Number(documentId);
  if (!Number.isFinite(caseId) || !Number.isFinite(parsedDocumentId)) {
    return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  }

  const values: any[] = [parsedDocumentId, caseId];
  const visibility = caseVisibilitySql(user, "cc", values);
  const result = await getDb().query(
    `SELECT d.document FROM "documents" d JOIN client_cases cc ON cc.id=d.client_case_id WHERE d.id=$1 AND cc.id=$2 AND ${visibility} LIMIT 1`,
    values,
  );
  const document = stringValue(result.rows[0]?.document).trim();
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const storagePath = storagePathFromDocumentValue(document);
  const href = storagePath ? await createCaseDocumentSignedUrl(storagePath) : document;
  if (!href || (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/"))) {
    return NextResponse.json({ error: "Document link unavailable" }, { status: 404 });
  }

  return NextResponse.redirect(href);
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}
