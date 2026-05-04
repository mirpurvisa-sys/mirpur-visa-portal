import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = readEnvFile(".env");
const projectRef = getProjectRef(env);
const encodedPassword = getEncodedPassword(env);
const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "ap-east-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-northeast-1",
  "ap-northeast-2",
  "sa-east-1",
  "af-south-1",
  "me-central-1",
];

const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
);
baseEnv.Path = process.env.Path || process.env.PATH || "";

for (const region of regions) {
  const url = `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:5432/postgres?sslmode=require&schema=public`;
  const result = spawnSync("cmd.exe", ["/c", "npx prisma db execute --schema prisma/schema.prisma --stdin"], {
    input: "SELECT 1;\n",
    encoding: "utf8",
    env: {
      ...baseEnv,
      DATABASE_URL: url,
      DIRECT_URL: url,
    },
    timeout: 20000,
  });

  const output = `${result.stdout || ""}${result.stderr || ""}`
    .replace(new RegExp(encodedPassword, "g"), "<password>")
    .replace(new RegExp(projectRef, "g"), "<project-ref>");

  if (result.status === 0) {
    console.log(`FOUND ${region}`);
    process.exit(0);
  }

  const reason = result.error
    ? `local-spawn-error: ${result.error.code || result.error.message}`
    : output.includes("Tenant or user not found")
    ? "tenant-not-found"
    : output.includes("Can't reach database server")
      ? "unreachable"
      : output.includes("ENOTFOUND")
        ? "dns-not-found"
        : output.split(/\r?\n/).find((line) => line.trim().startsWith("Error:") || line.includes("FATAL:"))?.trim() || "failed";

  console.log(`${region}: ${reason}`);
}

process.exit(1);

function readEnvFile(path) {
  const env = {};
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function getProjectRef(env) {
  const fromUrl = env.NEXT_PUBLIC_SUPABASE_URL?.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1];
  if (fromUrl) return fromUrl;

  const databaseUrl = new URL(env.DIRECT_URL || env.DATABASE_URL);
  const fromHost = databaseUrl.hostname.match(/^db\.([^.]+)\.supabase\.co$/)?.[1];
  if (fromHost) return fromHost;

  throw new Error("Could not infer Supabase project ref from .env");
}

function getEncodedPassword(env) {
  const databaseUrl = new URL(env.DIRECT_URL || env.DATABASE_URL);
  return databaseUrl.password.includes("%")
    ? databaseUrl.password
    : encodeURIComponent(databaseUrl.password);
}
