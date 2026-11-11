#!/usr/bin/env node
/**
 * Find a candidate's proof of address in Cloudflare R2 by their name.
 *
 * Every uploaded file sits in R2 under candidates/<candidate-id>/, but the list
 * that tied an id to a name was candidates.json on the host volume. This
 * rebuilds that link from what R2 itself still holds:
 *
 *   1. the newest backups/candidates-*.json, if a backup was ever made
 *      (names and emails for everyone in it);
 *   2. otherwise each candidate's agreement PDF, whose title is
 *      "Independent Contractor Agreement — <full name>";
 *   3. otherwise the signed agreement they uploaded, if it kept that title.
 *
 * Runs on your own computer. Nothing is sent anywhere but to your R2 bucket.
 *
 * Setup, once, in the project folder:
 *   npm install
 *   Put your R2 settings in a file named .env.local (it is never committed):
 *     R2_ACCOUNT_ID=...
 *     R2_ACCESS_KEY_ID=...
 *     R2_SECRET_ACCESS_KEY=...
 *     R2_BUCKET=...
 *
 * Use:
 *   node scripts/find-address-proof.mjs "john smith"   find one person, download their proof of address
 *   node scripts/find-address-proof.mjs --all          download every proof of address, named by person
 *   node scripts/find-address-proof.mjs --index        only rebuild the list of names (recovered/index.csv)
 *
 * Files go to the recovered/ folder (also never committed: it holds personal data).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib";

const OUT = path.resolve("recovered");
const INDEX_JSON = path.join(OUT, "index.json");
const INDEX_CSV = path.join(OUT, "index.csv");
const PROOF_DIR = path.join(OUT, "address-proof");

// ---------------------------------------------------------------- settings

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}
loadEnvFile(path.resolve(".env.local"));
loadEnvFile(path.resolve(".env"));

const env = (k) => process.env[k]?.trim() || "";
const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env(k));
if (missing.length) {
  console.error(`Missing R2 settings: ${missing.join(", ")}.\nPut them in a .env.local file in the project folder (see the top of this script).`);
  process.exit(1);
}

const BUCKET = env("R2_BUCKET");
const s3 = new S3Client({
  region: "auto",
  endpoint: env("R2_ENDPOINT") || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

// ---------------------------------------------------------------- storage

async function listAll(prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) out.push({ key: o.Key, at: o.LastModified ? new Date(o.LastModified).toISOString() : "" });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function getBytes(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

// ---------------------------------------------------------------- names

const TITLE = /^\s*Independent Contractor Agreement\s*[—–-]\s*(.+?)\s*$/i;

async function nameFromAgreement(key) {
  try {
    const doc = await PDFDocument.load(await getBytes(key), { ignoreEncryption: true, updateMetadata: false });
    const m = (doc.getTitle() ?? "").match(TITLE);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/** The newest candidates backup in R2, as id -> { name, email }. */
async function namesFromBackup() {
  const backups = (await listAll("backups/candidates-")).sort((a, b) => (a.key < b.key ? 1 : -1));
  for (const b of backups) {
    try {
      const list = JSON.parse((await getBytes(b.key)).toString("utf8"));
      if (!Array.isArray(list)) continue;
      const map = new Map();
      for (const c of list) if (c?.id) map.set(String(c.id), { name: c.fullName || "", email: c.email || "" });
      console.log(`Using backup ${b.key} (${map.size} candidates).`);
      return map;
    } catch {
      /* a damaged copy: try the one before it */
    }
  }
  return new Map();
}

// "agreement-WR-2026-0042-101500.pdf" -> "agreement". Kinds never hold a dash;
// what follows the first one (a reference, a time, a random id) may.
const kindOf = (file) => file.split("-")[0].replace(/\.[^.]+$/, "");

async function buildIndex() {
  console.log("Reading the list of files in R2…");
  const objects = await listAll("candidates/");
  const byId = new Map();
  for (const o of objects) {
    const [, id, file] = o.key.split("/");
    if (!id || !file) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push({ ...o, file, kind: kindOf(file) });
  }
  const backup = await namesFromBackup();

  const index = [];
  let n = 0;
  for (const [id, files] of byId) {
    n++;
    if (process.stdout.isTTY && (n % 10 === 0 || n === byId.size)) process.stdout.write(`\rReading names… ${n} of ${byId.size}`);
    let name = backup.get(id)?.name || "";
    let source = name ? "backup" : "";
    const newest = (kind) => files.filter((f) => f.kind === kind).sort((a, b) => (a.at < b.at ? 1 : -1));
    for (const kind of ["agreement", "signedAgreement"]) {
      if (name) break;
      for (const f of newest(kind)) {
        name = await nameFromAgreement(f.key);
        if (name) {
          source = kind;
          break;
        }
      }
    }
    const proofs = newest("addressProof");
    index.push({
      id,
      name,
      email: backup.get(id)?.email || "",
      nameFrom: source,
      addressProof: proofs[0]?.key || "",
      addressProofAt: proofs[0]?.at || "",
      files: files.map((f) => f.file).sort(),
    });
  }
  if (process.stdout.isTTY) process.stdout.write("\n");

  index.sort((a, b) => (!a.name - !b.name) || a.name.localeCompare(b.name));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2));
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  writeFileSync(
    INDEX_CSV,
    [
      "Name,Email,Candidate ID,Name found in,Has proof of address,Proof uploaded,Files",
      ...index.map((r) =>
        [r.name || "(unknown)", r.email, r.id, r.nameFrom || "-", r.addressProof ? "yes" : "no", r.addressProofAt, r.files.join(" ")]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n"),
  );

  const named = index.filter((r) => r.name).length;
  const proofs = index.filter((r) => r.addressProof).length;
  console.log(`${index.length} candidates found: ${named} with a name, ${proofs} with a proof of address.`);
  console.log(`List saved: ${INDEX_CSV}`);
  return index;
}

function loadIndex() {
  try {
    return JSON.parse(readFileSync(INDEX_JSON, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- search

const plain = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function matches(row, query) {
  const hay = plain(`${row.name} ${row.email} ${row.id}`);
  return plain(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

const safeName = (s) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

async function download(row) {
  mkdirSync(PROOF_DIR, { recursive: true });
  const ext = path.extname(row.addressProof) || ".pdf";
  const file = path.join(PROOF_DIR, `${safeName(row.name || "unknown")} - ${row.id}${ext}`);
  writeFileSync(file, await getBytes(row.addressProof));
  return file;
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const rebuild = args.includes("--index") || args.includes("--refresh");
const all = args.includes("--all");
const query = args.filter((a) => !a.startsWith("--")).join(" ").trim();

if (!rebuild && !all && !query) {
  console.log('Usage:\n  node scripts/find-address-proof.mjs "name"\n  node scripts/find-address-proof.mjs --all\n  node scripts/find-address-proof.mjs --index');
  process.exit(0);
}

try {
  let index = rebuild ? null : loadIndex();
  if (!index) index = await buildIndex();
  if (rebuild && !all && !query) process.exit(0);

  const rows = all ? index.filter((r) => r.addressProof) : index.filter((r) => matches(r, query));
  if (!rows.length) {
    console.log(all ? "Nobody has a proof of address in R2." : `Nobody found for "${query}". Open ${INDEX_CSV} to see every name.`);
    process.exit(0);
  }

  for (const r of rows) {
    const who = `${r.name || "(name unknown)"}${r.email ? ` <${r.email}>` : ""} [${r.id}]`;
    if (!r.addressProof) {
      console.log(`- ${who}: no proof of address uploaded.`);
      continue;
    }
    const file = await download(r);
    console.log(`- ${who}: saved ${file}`);
  }
} catch (e) {
  const code = e?.name || e?.Code || "";
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch" || e?.$metadata?.httpStatusCode === 403) {
    console.error("R2 refused the keys. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env.local.");
  } else if (code === "NoSuchBucket") {
    console.error(`There is no bucket named "${BUCKET}". Check R2_BUCKET in .env.local.`);
  } else {
    console.error(`Something went wrong: ${e?.message || e}`);
  }
  process.exit(1);
}
