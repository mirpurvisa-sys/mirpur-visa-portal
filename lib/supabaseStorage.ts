import { randomUUID } from "node:crypto";

const DEFAULT_BUCKET = "client-documents";
const DEFAULT_LEGACY_DOCUMENT_PREFIX = "uploads/docs";
const DEFAULT_BUCKET_LIMIT = 50 * 1024 * 1024;

type StorageConfig = {
  bucket: string;
  secretKey: string;
  supabaseUrl: string;
};

export type UploadedCaseDocument = {
  path: string;
};

export async function uploadCaseDocumentToStorage(caseId: number, file: File): Promise<UploadedCaseDocument> {
  const config = getStorageConfig();
  await ensureStorageBucket(config);

  const safeName = sanitizeStorageFileName(file.name);
  const objectPath = `cases/${caseId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(objectPath)}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...storageAuthHeaders(config),
      "cache-control": "3600",
      "content-type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: Buffer.from(await file.arrayBuffer()),
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage upload failed: ${await storageErrorMessage(response)}`);
  }

  return { path: objectPath };
}

export async function createCaseDocumentSignedUrl(documentPath: string, expiresIn = 60 * 60) {
  const config = getStorageConfig();
  const storagePath = storagePathFromDocumentValue(documentPath);
  if (!storagePath) throw new Error("Invalid Supabase Storage document path.");

  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      ...storageAuthHeaders(config),
      "content-type": "application/json",
    },
    body: JSON.stringify({ expiresIn }),
  });

  if (!response.ok) {
    throw new Error(`Supabase Storage signed URL failed: ${await storageErrorMessage(response)}`);
  }

  const data = await response.json();
  const signedUrl = String(data.signedURL || data.signedUrl || data.signed_url || "");
  if (!signedUrl) throw new Error("Supabase Storage did not return a signed URL.");
  if (signedUrl.startsWith("http://") || signedUrl.startsWith("https://")) return signedUrl;
  return `${config.supabaseUrl}/storage/v1${signedUrl.startsWith("/") ? signedUrl : `/${signedUrl}`}`;
}

export async function deleteCaseDocumentFromStorage(documentPath: string) {
  const config = getStorageConfig();
  const storagePath = storagePathFromDocumentValue(documentPath);
  if (!storagePath) return;

  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}`, {
    method: "DELETE",
    headers: {
      ...storageAuthHeaders(config),
      "content-type": "application/json",
    },
    body: JSON.stringify({ prefixes: [storagePath] }),
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Supabase Storage delete failed: ${await storageErrorMessage(response)}`);
  }
}

export function isSupabaseStoragePath(value: unknown) {
  return Boolean(storagePathFromDocumentValue(value));
}

export function storagePathFromDocumentValue(value: unknown) {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";

  const config = getOptionalStorageConfig();
  const bucket = config.bucket;
  const legacyPrefix = storagePathPrefix(process.env.SUPABASE_LEGACY_DOCUMENT_PREFIX || DEFAULT_LEGACY_DOCUMENT_PREFIX);
  const urlPath = storagePathFromUrl(rawValue, bucket, legacyPrefix);
  if (urlPath) return urlPath;

  const path = normalizeStoragePath(rawValue);
  if (!path) return "";

  const withoutBucket = stripBucketPrefix(path, bucket);
  const legacyPath = storagePathFromKnownFolder(withoutBucket, legacyPrefix);
  if (legacyPath) return legacyPath;

  if (withoutBucket.startsWith("cases/") || withoutBucket.startsWith("uploads/")) return withoutBucket;
  if (withoutBucket.startsWith("docs/")) return `uploads/${withoutBucket}`;
  if (looksLikeFileName(withoutBucket)) return `${legacyPrefix}/${withoutBucket}`;

  return "";
}

function getStorageConfig(): StorageConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = getStorageBucket();

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!secretKey) throw new Error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");

  return { bucket, secretKey, supabaseUrl };
}

function getOptionalStorageConfig() {
  return {
    bucket: getStorageBucket(),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "",
  };
}

function getStorageBucket() {
  return storagePathPrefix(process.env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET);
}

async function ensureStorageBucket(config: StorageConfig) {
  const bucketUrl = `${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.bucket)}`;
  const existing = await fetch(bucketUrl, {
    headers: storageAuthHeaders(config),
    cache: "no-store",
  });

  if (existing.ok) return;
  const existingError = await storageErrorMessage(existing);
  if (!isMissingBucket(existing.status, existingError)) {
    throw new Error(`Supabase Storage bucket check failed: ${existingError}`);
  }

  const created = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      ...storageAuthHeaders(config),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: false,
      file_size_limit: DEFAULT_BUCKET_LIMIT,
    }),
  });

  if (!created.ok && created.status !== 409) {
    const createdError = await storageErrorMessage(created);
    if (!isExistingBucket(createdError)) throw new Error(`Supabase Storage bucket creation failed: ${createdError}`);
  }
}

function storageAuthHeaders(config: StorageConfig) {
  return {
    apikey: config.secretKey,
    authorization: `Bearer ${config.secretKey}`,
  };
}

function encodeStoragePath(value: string) {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function normalizeStoragePath(value: string) {
  return value
    .split(/[?#]/, 1)[0]
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function storagePathFromUrl(value: string, bucket: string, legacyPrefix: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }

  const path = normalizeStoragePath(decodePath(url.pathname));
  const objectPrefix = `storage/v1/object/`;
  const objectIndex = path.indexOf(objectPrefix);
  if (objectIndex >= 0) {
    const objectPath = path.slice(objectIndex + objectPrefix.length).replace(/^(public|sign)\//, "");
    return stripBucketPrefix(objectPath, bucket);
  }

  return storagePathFromKnownFolder(path, legacyPrefix);
}

function storagePathFromKnownFolder(value: string, legacyPrefix: string) {
  const path = normalizeStoragePath(value);
  const lowerPath = path.toLowerCase();
  const lowerLegacyPrefix = legacyPrefix.toLowerCase();
  const legacyIndex = lowerPath.indexOf(`${lowerLegacyPrefix}/`);
  if (legacyIndex >= 0) return path.slice(legacyIndex);
  return "";
}

function stripBucketPrefix(value: string, bucket: string) {
  const path = normalizeStoragePath(value);
  const bucketPrefix = `${bucket}/`;
  return path.toLowerCase().startsWith(bucketPrefix.toLowerCase()) ? path.slice(bucketPrefix.length) : path;
}

function storagePathPrefix(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function looksLikeFileName(value: string) {
  return !value.includes("/") && /\.[a-z0-9]{2,8}$/i.test(value);
}

function decodePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sanitizeStorageFileName(value: string) {
  const fileName = value.replace(/\\/g, "/").split("/").pop() || "document";
  return fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";
}

async function storageErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text;
  } catch {
    return text;
  }
}

function isMissingBucket(status: number, message: string) {
  return status === 404 || message.toLowerCase().includes("bucket not found");
}

function isExistingBucket(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already exists") || normalized.includes("duplicate");
}
