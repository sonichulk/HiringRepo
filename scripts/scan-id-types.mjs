#!/usr/bin/env node
/**
 * Read each candidate's ID photo and record what kind of document it is:
 * passport, national ID card, driver's licence — or, for India, an Aadhaar
 * or PAN card, which candidates are never asked for but sometimes send.
 *
 * Admin only: the result goes in identityDetectedType, shown in the admin
 * panel ("Read from the photo") and in the ID document filter. What the
 * candidate said they sent (identityDocumentType) is left as it is.
 *
 * Only the type is kept. The text read from the photo — names, numbers,
 * addresses, an Aadhaar or PAN number — is never written anywhere.
 *
 * Two steps, so the long part never holds up the live site:
 *
 *   1. node scripts/scan-id-types.mjs scan
 *      Reads the ID photos in R2 (about an hour for a thousand; resumable —
 *      run it again after a stop and it carries on). Writes recovered/id-types.json.
 *
 *   2. node scripts/scan-id-types.mjs apply recovered/live-candidates.json recovered/candidates-with-id-types.json
 *      Adds the types to a candidates.json downloaded from the site, changing
 *      nothing else. Takes seconds. Writes recovered/id-types-report.csv too.
 *
 * Needs: npm install --no-save tesseract.js@5 @tesseract.js-data/eng
 * and the R2 settings (.env.local or Codespaces secrets; read-only is enough).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const OUT = path.resolve("recovered");
const RESULT = path.join(OUT, "id-types.json");
const CACHE = path.join(OUT, "id-types-cache.json");
const MRZ_CACHE = path.join(OUT, "id-cache.json"); // from rebuild-candidates.mjs --ids, if it was run

// ------------------------------------------------------------------ reading the text

/**
 * The kind of document, from the text on it. Most specific first: an Indian
 * driving licence also says "Union of India", an Aadhaar card "Government of
 * India". `sure` is false when the text points at more than one kind.
 */
export function classify(text) {
  const t = ` ${String(text).toUpperCase().replace(/[^A-Z0-9<\s]/g, " ").replace(/\s+/g, " ")} `;
  const rules = [
    ["aadhaar", /\bAA?DH?AA?R\b|UNIQUE IDENTIFICATION AUTHORITY|\bUIDAI\b|AAM ADMI KA ADHIKAR/],
    ["pan", /INCOME TAX DEPARTMENT|PERMANENT ACCOUNT NUMBER/],
    ["drivers-licence", /\bDRIV(ING|ER|ERS|ER S)\s?LICEN[CS]E\b|PERMIS DE CONDUIRE|F(U|UE)HRERSCHEIN|LICENCIA DE CONDUC|PATENTE DI GUIDA|CARTA DE CONDU|CARTEIRA NACIONAL DE HABILITA|RIJBEWIJS|PRAWO JAZDY|EHLIYET/],
    ["passport", /\bPASSPORT\b|\bPASSEPORT\b|\bPASAPORTE\b|\bPASSAPORTO\b|\bREISEPASS\b|\bPASPOORT\b|\bPASZPORT\b|\bPASAPORT\b|(^|\s)P<[A-Z<]{3}/],
    ["national-id", /IDENTITY CARD|NATIONAL ID|NATIONAL IDENTITY|CARTE NATIONALE|CARTE D IDENTIT|DOCUMENTO NACIONAL|PERSONALAUSWEIS|CARTA D IDENTIT|IDENTITEITSKAART|\bCEDULA\b|\bCNIC\b|EMIRATES ID|RESIDENT IDENTITY|KIMLIK KARTI|ELECTION COMMISSION OF INDIA|(^|\s)I[D<][A-Z<]{3}/],
  ];
  const hits = rules.filter(([, re]) => re.test(t)).map(([k]) => k);
  // By their layout, when the words did not read: an Aadhaar number is three
  // groups of four digits, a PAN five letters, four digits, a letter.
  if (!hits.length && /GOVERNMENT OF INDIA|GOVT OF INDIA/.test(t) && /\b\d{4} \d{4} \d{4}\b/.test(t)) hits.push("aadhaar");
  if (!hits.length && /\b[A-Z]{5}\d{4}[A-Z]\b/.test(t) && /INCOME|GOVT|INDIA/.test(t)) hits.push("pan");
  return hits.length ? { type: hits[0], sure: hits.length === 1 } : null;
}

// ------------------------------------------------------------------ helpers

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
    }
  }
}
const readJson = (file, fallback) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("timeout")), ms)))]).finally(() =>
    clearTimeout(timer),
  );
}
const LABEL = { passport: "Passport", "national-id": "National ID card", "drivers-licence": "Driver's licence", aadhaar: "Aadhaar card", pan: "PAN card" };
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

// ------------------------------------------------------------------ step 1: scan

async function scan() {
  loadEnv();
  const env = (k) => process.env[k]?.trim() || "";
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env(k));
  if (missing.length) {
    console.error(`Missing R2 settings: ${missing.join(", ")}.`);
    process.exit(1);
  }
  let tesseract;
  let sharp;
  try {
    tesseract = await import("tesseract.js");
    sharp = (await import("sharp")).default;
    sharp.cache(false);
    sharp.concurrency(1);
  } catch {
    console.error("First run:\n  npm install --no-save tesseract.js@5 @tesseract.js-data/eng");
    process.exit(1);
  }
  const langPath = path.resolve("node_modules/@tesseract.js-data/eng/4.0.0_best_int");
  if (!existsSync(langPath)) {
    console.error("The English OCR data is missing. Run:\n  npm install --no-save tesseract.js@5 @tesseract.js-data/eng");
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const s3 = new S3Client({
    region: "auto",
    endpoint: env("R2_ENDPOINT") || `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const getBytes = (key) =>
    withTimeout(
      (async () => {
        const res = await s3.send(new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }), { abortSignal: AbortSignal.timeout(120_000) });
        return Buffer.from(await res.Body.transformToByteArray());
      })(),
      120_000,
    );

  console.log("Reading the list of files in R2…");
  const folders = new Map();
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: env("R2_BUCKET"), Prefix: "candidates/", ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      const [, id, file] = o.Key.split("/");
      if (!id || !file || !IMAGE.test(file)) continue;
      const kind = file.split("-")[0];
      if (kind !== "identity" && kind !== "identityBack") continue;
      if (!folders.has(id)) folders.set(id, []);
      folders.get(id).push({ key: o.Key, kind, at: new Date(o.LastModified).toISOString() });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  // The newest front and back of each: the photos that count.
  const todo = [...folders].map(([id, files]) => {
    const newest = (kind) => files.filter((f) => f.kind === kind).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    return { id, images: [newest("identity"), newest("identityBack")].filter(Boolean) };
  });
  const cache = readJson(CACHE, {});
  const mrz = readJson(MRZ_CACHE, {});
  const left = todo.filter((c) => !c.images.every((x) => x.key in cache)).length;
  const cores = Math.max(1, Math.min(8, os.availableParallelism?.() ?? 2));
  console.log(`${todo.length} candidates with an ID photo; ${todo.length - left} already read on an earlier run. Reading ${left} with ${cores} readers at once…`);

  const free = [];
  const all = new Set();
  const makeWorker = async () => {
    const w = await tesseract.createWorker("eng", 1, { langPath, gzip: true, cachePath: path.join(OUT, ".ocr-cache") }, { debug_file: "/dev/null" });
    await w.setParameters({ tessedit_pageseg_mode: tesseract.PSM.AUTO });
    return w;
  };
  for (let i = 0; i < cores; i++) {
    const w = await makeWorker();
    free.push(w);
    all.add(w);
  }
  const waiting = [];
  const take = () => (free.length ? Promise.resolve(free.pop()) : new Promise((r) => waiting.push(r)));
  const give = (w) => (waiting.length ? waiting.shift()(w) : free.push(w));

  /** One photo, upright and then turned the ways it could be wrong, until its text says what it is. */
  const readOne = async (key) => {
    // What the passport/ID-card lines already said in the rebuild, if they were read.
    const known = mrz[key];
    if (known?.documentType) return { type: known.documentType, sure: true, how: "machine-readable lines" };
    const bytes = await getBytes(key);
    const meta = await withTimeout(sharp(bytes, { failOn: "none" }).rotate().grayscale().normalise().resize({ width: 1600 }).toBuffer({ resolveWithObject: true }), 60_000);
    const { width, height } = meta.info;
    const turns = height > width ? [0, 90, 270] : [0, 180];
    let worker = await take();
    try {
      for (const turn of turns) {
        const img = turn ? await sharp(meta.data).rotate(turn).toBuffer() : meta.data;
        try {
          const { data } = await withTimeout(worker.recognize(img), 90_000);
          const found = classify(data.text);
          if (found) return { ...found, how: "text on the photo" };
        } catch (e) {
          if (e?.message !== "timeout") continue;
          all.delete(worker);
          void worker.terminate().catch(() => {});
          worker = await makeWorker();
          all.add(worker);
          return null;
        }
      }
      return null;
    } finally {
      give(worker);
    }
  };

  const t0 = Date.now();
  let done = 0;
  let fresh = 0;
  const save = () => writeFileSync(CACHE, JSON.stringify(cache));
  const alive = setInterval(() => console.log(`Still reading: ${done} of ${todo.length} done (${Math.round((Date.now() - t0) / 60000)} min so far).`), 2 * 60_000);
  alive.unref();
  let next = 0;
  await Promise.all(
    Array.from({ length: cores }, async () => {
      while (next < todo.length) {
        const c = todo[next++];
        let read = false;
        for (const img of c.images) {
          if (img.key in cache) continue;
          read = true;
          cache[img.key] = await readOne(img.key).catch(() => null);
          if (cache[img.key]) break; // the front said it; the back is not needed
        }
        done++;
        if (read) {
          fresh++;
          if (fresh % 10 === 0) save();
        }
        if (done % 25 === 0 || done === todo.length) {
          const mins = (Date.now() - t0) / 60000;
          console.log(`Reading IDs… ${done} of ${todo.length} (${Math.round(mins)} min so far, about ${fresh ? Math.round((mins / fresh) * (todo.length - done)) : 0} min left)`);
        }
      }
    }),
  );
  clearInterval(alive);
  save();
  await Promise.all([...all].map((w) => w.terminate().catch(() => {})));

  // One answer per candidate: the front first, then the back.
  const result = {};
  const counts = {};
  for (const c of todo) {
    const found = c.images.map((x) => cache[x.key]).find(Boolean);
    if (found) result[c.id] = found;
    const k = found?.type ?? "not recognised";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  writeFileSync(RESULT, JSON.stringify(result, null, 2));
  console.log(
    `\nDone. ${Object.entries(counts)
      .map(([k, n]) => `${LABEL[k] ?? k}: ${n}`)
      .join(", ")}.\nWritten to ${path.relative(process.cwd(), RESULT)}. Next: the "apply" step (see the top of this file).`,
  );
}

// ------------------------------------------------------------------ step 2: apply

function apply(input, output) {
  if (!input || !output) {
    console.log("Usage:\n  node scripts/scan-id-types.mjs apply <candidates.json from the site> <new file to write>");
    process.exit(0);
  }
  if (!existsSync(RESULT)) {
    console.error(`${path.relative(process.cwd(), RESULT)} not found: run the "scan" step first.`);
    process.exit(1);
  }
  const types = readJson(RESULT, {});
  const list = readJson(input, null);
  if (!Array.isArray(list)) {
    console.error(`${input} is not a candidates.json.`);
    process.exit(1);
  }
  const at = new Date().toISOString();
  const counts = {};
  const rows = [];
  for (const c of list) {
    const hasPhoto = (c.documents ?? []).some((d) => (d.kind === "identity" || d.kind === "identityBack") && d.key);
    const found = types[c.id];
    if (found) {
      c.identityDetectedType = found.type;
      c.identityDetectedAt = at;
      counts[found.type] = (counts[found.type] ?? 0) + 1;
    }
    if (hasPhoto) {
      rows.push([
        c.fullName || "",
        c.email || "",
        c.id,
        found ? LABEL[found.type] : "not recognised",
        found ? (found.sure ? "yes" : "no — the text pointed at more than one kind") : "",
        c.identityDocumentType ? LABEL[c.identityDocumentType] ?? c.identityDocumentType : "",
      ]);
    }
  }
  writeFileSync(output, JSON.stringify(list, null, 2));
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const order = { "Aadhaar card": 0, "PAN card": 1, "not recognised": 9 };
  rows.sort((a, b) => (order[a[3]] ?? 5) - (order[b[3]] ?? 5) || a[0].localeCompare(b[0]));
  writeFileSync(
    path.join(OUT, "id-types-report.csv"),
    ["Name,Email,Candidate ID,Read from the photo,Sure,What they said they sent", ...rows.map((r) => r.map(cell).join(","))].join("\r\n"),
  );
  const notRead = rows.filter((r) => r[3] === "not recognised").length;
  console.log(
    `Done. ${Object.entries(counts)
      .map(([k, n]) => `${LABEL[k]}: ${n}`)
      .join(", ")}; not recognised: ${notRead}.\nWritten to ${output} and recovered/id-types-report.csv.`,
  );
}

// ------------------------------------------------------------------ run

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [step, a, b] = process.argv.slice(2);
  if (step === "scan") await scan();
  else if (step === "apply") apply(a, b);
  else {
    console.log(
      "Usage:\n  node scripts/scan-id-types.mjs scan\n  node scripts/scan-id-types.mjs apply <candidates.json from the site> <new file to write>",
    );
  }
}
