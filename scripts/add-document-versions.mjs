#!/usr/bin/env node
/**
 * Add the earlier versions of candidates' documents to a candidates.json.
 *
 * The site keeps every version of an ID photo, selfie, voice recording, PAN
 * card, company paper, proof of address and signed agreement: the newest is
 * the current one, the earlier ones are marked replaced and shown beside it.
 * The rebuild after the volume was lost kept only the newest. The earlier
 * files are still in R2 under candidates/<id>/, so this adds them back as
 * replaced versions — and changes nothing else in the file, so it can be run
 * on the live file after the site has been in use.
 *
 * Use (in the project folder, with the R2 settings in .env.local or as
 * Codespaces secrets — a read-only key is enough):
 *   node scripts/add-document-versions.mjs recovered/live-candidates.json recovered/candidates-with-versions.json
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

/** The kinds the site keeps every version of (lib/documents.ts, keepsHistory). */
export const HISTORY_KINDS = new Set([
  "identity", "identityBack", "selfie", "residencePermit", "residenceBack", "residenceSelfie",
  "voice", "w9", "formation", "einLetter", "panFront", "panBack", "addressProof", "signedAgreement",
]);

/** The kind a stored file is, from its name: "identityBack-k3j4h5.jpg" -> "identityBack". */
export const kindOfFile = (file) => file.split("-")[0].replace(/\.[^.]+$/, "");

/**
 * Documents for one candidate with the earlier versions added. `files` are the
 * R2 objects in their folder ({ key, file, at, size }). Existing documents are
 * kept as they are; a file newer than the current version is left alone (it
 * was never recorded as theirs).
 */
export function withVersions(documents, files) {
  const docs = [...(documents ?? [])];
  const known = new Set(docs.map((d) => d.key).filter(Boolean));
  let added = 0;
  let skippedNewer = 0;
  for (const kind of HISTORY_KINDS) {
    const stored = files.filter((x) => kindOfFile(x.file) === kind).sort((a, b) => a.at.localeCompare(b.at));
    if (!stored.length) continue;
    const mine = docs.filter((d) => d.kind === kind);
    const current = mine.find((d) => !d.supersededAt) ?? [...mine].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)).at(-1);
    const missing = stored.filter((x) => !known.has(x.key));
    if (!missing.length) continue;
    // Every version's upload time, to mark each one replaced by the next.
    const times = [...new Set([...mine.map((d) => d.uploadedAt), ...stored.map((x) => x.at)])].sort();
    const nextAfter = (at) => times.find((t) => t > at);
    for (const x of missing) {
      if (current && x.at > current.uploadedAt) {
        skippedNewer++;
        continue;
      }
      const isNewest = !current && x === stored.at(-1);
      docs.push({
        kind,
        filename: x.file,
        size: x.size,
        uploadedAt: x.at,
        key: x.key,
        status: "clean",
        ...(isNewest ? {} : { supersededAt: nextAfter(x.at) ?? x.at }),
      });
      added++;
    }
  }
  docs.sort((a, b) => (a.uploadedAt || "").localeCompare(b.uploadedAt || ""));
  return { documents: docs, added, skippedNewer };
}

// ------------------------------------------------------------------ run

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.log("Usage:\n  node scripts/add-document-versions.mjs <candidates.json from the site> <new file to write>");
    process.exit(0);
  }
  if (!existsSync(input)) {
    console.error(`File not found: ${input}`);
    process.exit(1);
  }
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  const env = (k) => process.env[k]?.trim() || "";
  const missingEnv = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env(k));
  if (missingEnv.length) {
    console.error(`Missing R2 settings: ${missingEnv.join(", ")}.`);
    process.exit(1);
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: env("R2_ENDPOINT") || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    const list = JSON.parse(readFileSync(input, "utf8"));
    if (!Array.isArray(list)) throw new Error("this is not a candidates.json (no list of candidates)");
    console.log(`${list.length} candidates in ${input}. Reading the list of files in R2…`);
    const folders = new Map();
    let token;
    do {
      const res = await s3.send(new ListObjectsV2Command({ Bucket: env("R2_BUCKET"), Prefix: "candidates/", ContinuationToken: token }));
      for (const o of res.Contents ?? []) {
        const [, id, file] = o.Key.split("/");
        if (!id || !file) continue;
        if (!folders.has(id)) folders.set(id, []);
        folders.get(id).push({ key: o.Key, file, at: new Date(o.LastModified).toISOString(), size: Number(o.Size ?? 0) });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    let people = 0;
    let added = 0;
    let newer = 0;
    for (const c of list) {
      const files = folders.get(c.id);
      if (!files) continue;
      const r = withVersions(c.documents, files);
      if (r.added) {
        c.documents = r.documents;
        people++;
        added += r.added;
      }
      newer += r.skippedNewer;
    }
    writeFileSync(output, JSON.stringify(list, null, 2));
    console.log(`Done. ${added} earlier versions added to ${people} candidates. Written to ${output}.`);
    if (newer) console.log(`${newer} files newer than the current version were left out (never recorded as the candidate's).`);
  } catch (e) {
    console.error(`Something went wrong: ${e?.message || e}`);
    process.exit(1);
  }
}
