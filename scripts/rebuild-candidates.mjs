#!/usr/bin/env node
/**
 * Rebuild candidates.json from what survived the loss of the host volume.
 *
 * Sources, all still in your hands:
 *   - the Telegram export (result.json) of the chat your bot posted to:
 *     every application's name, date of birth, email, phone, country, city,
 *     address and LinkedIn; interview scores; proof-of-address details;
 *     signed-agreement references;
 *   - Cloudflare R2: every candidate's folder candidates/<id>/ with their
 *     files, and the agreement PDFs (name, reference, start date);
 *   - optionally (--ids) the ID photos in R2, read on this computer only: the
 *     machine-readable lines of passports and ID cards (name, date of birth,
 *     nationality, expiry). No document numbers are kept.
 *
 * Each R2 folder is matched to a Telegram application by agreement reference,
 * name, date of birth and upload times. The result is a candidates.json in the
 * site's own format, plus a report of what to check by hand.
 *
 * Runs on your computer or in a GitHub Codespace. Nothing is sent anywhere but
 * to your R2 bucket (to read it). Nothing is written to R2.
 *
 * Setup, once, in the project folder:
 *   npm install
 *   R2 settings in .env.local, or as Codespaces secrets:
 *     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   For --ids only:  npm install --no-save tesseract.js@5 @tesseract.js-data/eng
 *   For --cvs only:  npm install --no-save pdfjs-dist@4.10.38 mammoth@1.13.0
 *
 * Use:
 *   node scripts/rebuild-candidates.mjs --telegram result.json
 *   node scripts/rebuild-candidates.mjs --telegram result.json --ids
 *
 * Output, in recovered/ (never committed — it holds personal data):
 *   candidates.json         the rebuilt list, to put in DATA_DIR on the new server
 *   rebuild-report.csv      one line per candidate: how sure the match is, and why
 *   id-data.json            (with --ids) what was read from each ID
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

const OUT = path.resolve("recovered");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ------------------------------------------------------------------ arguments

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const TELEGRAM = argValue("--telegram");
const READ_IDS = args.includes("--ids");
const READ_CVS = args.includes("--cvs");
const INCLUDE_UNNAMED = args.includes("--include-unnamed");

if (!TELEGRAM) {
  console.log(
    "Usage:\n  node scripts/rebuild-candidates.mjs --telegram result.json [--ids] [--include-unnamed]\n\n" +
      "  --telegram  the result.json from Telegram Desktop (Export chat history, format JSON)\n" +
      "  --ids       also read passports and ID cards in R2 (needs tesseract.js, see the top of this file)\n" +
      "  --cvs       also read the email addresses and phone numbers in CVs (needs pdfjs-dist and mammoth)\n" +
      "  --include-unnamed  also add R2 folders nobody could be matched to, with no name",
  );
  process.exit(0);
}
if (!existsSync(TELEGRAM)) {
  console.error(`File not found: ${TELEGRAM}`);
  process.exit(1);
}

// ------------------------------------------------------------------ R2

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
const missingEnv = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter((k) => !env(k));
if (missingEnv.length) {
  console.error(`Missing R2 settings: ${missingEnv.join(", ")}.\nPut them in .env.local or in your Codespaces secrets.`);
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

async function listAll(prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) {
      out.push({ key: o.Key, at: o.LastModified ? new Date(o.LastModified).toISOString() : "", size: Number(o.Size ?? 0) });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** A promise that gives up after `ms`, so one stuck file cannot stop the whole run. */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function getBytes(key) {
  return withTimeout(
    (async () => {
      const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(120_000) });
      return Buffer.from(await res.Body.transformToByteArray());
    })(),
    120_000,
  );
}

// ------------------------------------------------------------------ helpers

/** Lower case, no accents, letters only, words sorted: "José  Álvarez" -> "alvarez jose". */
function nameKey(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Same person by name: the same words, or one name inside the other with at least two words. */
function sameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const A = a.split(" ");
  const B = b.split(" ");
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  return small.length >= 2 && small.every((w) => big.includes(w));
}

const ms = (iso) => (iso ? Date.parse(iso) : NaN);
const newId = () => randomBytes(9).toString("base64url");
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** "9 November 2026" -> "2026-11-09". */
function isoFromLongDate(s) {
  const m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return "";
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return "";
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Dates of birth as typed on the form, or read from an ID, to YYYY-MM-DD. */
function isoDob(s) {
  const v = String(s ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isoFromLongDate(v);
}

/** The last nine digits of a phone number: enough to compare, whatever the dialling code or spacing. */
const phoneKey = (s) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
};

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
const NOT_A_NAME =
  /\b(curriculum|vitae|resume|résumé|cv|profile|summary|contact|e-?mail|phone|mobile|tel|address|objective|experience|education|skills|page|personal|information|details|career|professional|about|customer|service|support|agent|manager|representative|assistant|specialist|cover|letter|dear|sincerely)\b/i;

/** The person's name, as most CVs start: a short line of two to four capitalised words. */
function nameIn(text) {
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12);
  for (const line of lines) {
    const l = line.replace(/^(full\s+)?name\s*[:\-–]\s*/i, "");
    if (l.length < 4 || l.length > 40 || /[0-9@/\\|:•,()]/.test(l) || NOT_A_NAME.test(l)) continue;
    const words = l.split(" ");
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^\p{Lu}[\p{L}'’.-]*$/u.test(w))) continue;
    return l === l.toUpperCase() ? titleCase(l) : l;
  }
  return "";
}

/** Email addresses, phone numbers and the name at the top of a CV. The rest of the text is not kept. */
function contactsIn(text) {
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase().replace(/\.$/, "")))];
  const rawPhones = (text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? []).map((p) => p.replace(/\s+/g, " ").trim());
  const seen = new Set();
  const phonesRaw = rawPhones.filter((p) => {
    const k = phoneKey(p);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { v: 2, emails: emails.slice(0, 10), phones: [...seen].slice(0, 10), phonesRaw: phonesRaw.slice(0, 5), name: nameIn(text) };
}

// ------------------------------------------------------------------ Telegram

const ADDRESS_TYPES = {
  "service or utility bill": "utility",
  "bank/credit card statement or account confirmation letter": "bank",
};

function messageText(m) {
  if (typeof m.text === "string") return m.text;
  if (Array.isArray(m.text)) return m.text.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("");
  return "";
}

function fieldsOf(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z ]{1,30}):\s*(.*?)\s*$/);
    if (m && !(m[1] in out)) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function readTelegram(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    console.error(`${file} is not a JSON file. In Telegram Desktop choose Format: JSON when exporting.`);
    process.exit(1);
  }
  // One chat exported, or the whole account.
  const chats = Array.isArray(data?.messages) ? [data] : (data?.chats?.list ?? []);
  const messages = chats.flatMap((c) => c.messages ?? []).filter((m) => m?.type === "message");

  const t = { applications: [], submitted: [], interviews: [], addresses: [], signed: [], later: 0 };
  const people = []; // name + email from any later message about a candidate
  for (const m of messages) {
    const text = messageText(m);
    const at = m.date_unixtime ? new Date(Number(m.date_unixtime) * 1000).toISOString() : new Date(m.date).toISOString();
    const f = fieldsOf(text);
    const email = (f.email || "").toLowerCase();
    const name = f.name || "";
    if (name && email && !text.includes("New contact message")) people.push({ at, name, email, country: f.country || "" });

    if (text.includes("New application — Personal information")) {
      const firstName = f["first name"] || "";
      const lastName = f["last name"] || "";
      t.applications.push({
        n: t.applications.length,
        at,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        key: nameKey(`${firstName} ${lastName}`),
        dob: isoDob(f["date of birth"]),
        dobRaw: f["date of birth"] || "",
        email,
        phone: f.phone || "",
        country: f.country || "",
        city: f.city || "",
        address: f.address || "",
        linkedin: f.linkedin || "",
      });
      continue;
    }
    let m2 = text.match(/^\s*✅\s*(.+?) has just submitted the application form/);
    if (m2) {
      t.submitted.push({ at, key: nameKey(m2[1]) });
      continue;
    }
    if (text.includes("Interview completed")) {
      m2 = (f.score || "").match(/(\d+)\s*\/\s*(\d+)/);
      t.interviews.push({ at, key: nameKey(name), email, score: f.score || "", correct: m2 ? Number(m2[1]) : null, total: m2 ? Number(m2[2]) : null });
      continue;
    }
    if (text.includes("Proof of address received") || text.includes("New proof of address received")) {
      t.addresses.push({
        at,
        key: nameKey(name),
        email,
        type: ADDRESS_TYPES[(f.document || "").toLowerCase()] || "",
        address: f.now || f.address || "",
        onFile: f["on file"] && f["on file"] !== "—" ? f["on file"] : "",
      });
      continue;
    }
    if (text.includes("Signed agreement received") || text.includes("New signed agreement received")) {
      t.signed.push({ at, key: nameKey(name), email, ref: (f.agreement || "").trim().toUpperCase() });
    }
  }
  // Candidates whose application messages were never sent (the site's quiet
  // mode skipped them for ID-check countries) still appear in later messages
  // — interview completed, live ID check, chat, address, agreement — with
  // their name, email and country. They become applications too, without
  // the details only the form had.
  const known = new Set(t.applications.map((a) => a.email).filter(Boolean));
  people.sort((x, y) => x.at.localeCompare(y.at));
  for (const p of people) {
    if (known.has(p.email)) continue;
    known.add(p.email);
    const words = p.name.trim().split(/\s+/);
    t.applications.push({
      n: t.applications.length,
      at: p.at,
      firstName: words.length > 1 ? words.slice(0, -1).join(" ") : words[0],
      lastName: words.length > 1 ? words.at(-1) : "",
      fullName: p.name.trim(),
      key: nameKey(p.name),
      dob: "",
      dobRaw: "",
      email: p.email,
      phone: "",
      country: p.country,
      city: "",
      address: "",
      linkedin: "",
      later: true,
    });
    t.later++;
  }
  return t;
}

// ------------------------------------------------------------------ agreement PDFs

const TITLE = /^\s*Independent Contractor Agreement\s*[—–-]\s*(.+?)\s*$/i;

/** The text pdf-lib drew with a standard font: hex strings shown with Tj. */
function pdfText(doc) {
  let text = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => doc.context.lookup(r)) : [contents];
    for (const s of streams) {
      if (!(s instanceof PDFRawStream)) continue;
      const raw = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      for (const m of raw.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
        text += Buffer.from(m[1].replace(/\s/g, ""), "hex").toString("latin1") + " ";
      }
      for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) text += m[1] + " ";
    }
  }
  return text.replace(/\s+/g, " ");
}

async function readAgreement(key) {
  try {
    const doc = await PDFDocument.load(await getBytes(key), { ignoreEncryption: true, updateMetadata: false });
    const name = (doc.getTitle() ?? "").match(TITLE)?.[1] ?? "";
    let startDate = "";
    try {
      const m = pdfText(doc).match(/This agreement begins on (.+?) and continues/);
      if (m) startDate = isoFromLongDate(m[1]);
    } catch {
      /* the name is what matters */
    }
    return { name, startDate };
  } catch {
    return { name: "", startDate: "" };
  }
}

/** "agreement-WR-AB12CD34-20261001-101500.pdf" -> "WR-AB12CD34-20261001". */
function refOf(file) {
  return file.match(/^agreement-(WR-.{8}-\d{8})-\d{6}\.pdf$/i)?.[1]?.toUpperCase() ?? "";
}

// ------------------------------------------------------------------ ID cards (machine-readable zone)

const MRZ_WEIGHTS = [7, 3, 1];
const mrzValue = (ch) => (ch === "<" ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);
const checkDigit = (s) => String([...s].reduce((sum, ch, i) => sum + mrzValue(ch) * MRZ_WEIGHTS[i % 3], 0) % 10);
const TO_DIGIT = { O: "0", Q: "0", D: "0", U: "0", I: "1", L: "1", T: "1", Z: "2", S: "5", G: "6", B: "8" };

/**
 * A six-digit date field and its check digit, after OCR. Letters that look like
 * digits are swapped back; if the check still fails, one unclear character is
 * tried as every digit, and kept only if exactly one makes the check pass.
 */
function mrzDate(field, check) {
  const fixed = [...field].map((c) => TO_DIGIT[c] ?? c).join("");
  const chk = TO_DIGIT[check] ?? check;
  if (/^\d{6}$/.test(fixed) && checkDigit(fixed) === chk) return { value: fixed, sure: true };
  const unclear = [...field].map((c, i) => (/\d/.test(c) ? -1 : i)).filter((i) => i >= 0);
  const tryAt = unclear.length === 1 ? unclear : unclear.length === 0 ? [0, 1, 2, 3, 4, 5] : [];
  const found = [];
  for (const i of tryAt) {
    for (let d = 0; d <= 9; d++) {
      const v = fixed.slice(0, i) + d + fixed.slice(i + 1);
      if (/^\d{6}$/.test(v) && v !== fixed && checkDigit(v) === chk && isRealDate(v)) found.push(v);
    }
  }
  return found.length === 1 ? { value: found[0], sure: false } : null;
}

function isRealDate(yymmdd) {
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

function yymmddToIso(v, kind) {
  const yy = Number(v.slice(0, 2));
  const nowYY = new Date().getUTCFullYear() % 100;
  const century = kind === "birth" ? (yy > nowYY ? 1900 : 2000) : yy < 70 ? 2000 : 1900;
  return `${century + yy}-${v.slice(2, 4)}-${v.slice(4, 6)}`;
}

function mrzNames(field) {
  const [surname, given = ""] = field.replace(/[^A-Z<]/g, "").split("<<");
  const words = (s) => s.split("<").filter(Boolean).join(" ");
  return { lastName: words(surname), firstName: words(given) };
}

/** Read the MRZ lines out of OCR text. Passports (2 × 44) and ID cards (3 × 30). */
function parseMrz(text) {
  const lines = text
    .toUpperCase()
    .split("\n")
    .map((l) => l.replace(/\s/g, "").replace(/[«‹]/g, "<"))
    .filter((l) => l.length >= 25 && (l.match(/</g) ?? []).length >= 2);

  // Passport: line 1 starts P<, line 2 has birth date at 13–18.
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (!/^P[A-Z<]/.test(a) || b.length < 28) continue;
    const birth = mrzDate(b.slice(13, 19), b[19]);
    const expiry = mrzDate(b.slice(21, 27), b[27]);
    const { firstName, lastName } = mrzNames(a.slice(5));
    if (!lastName) continue;
    return {
      documentType: "passport",
      firstName,
      lastName,
      nationality: b.slice(10, 13).replace(/[^A-Z]/g, ""),
      dateOfBirth: birth ? yymmddToIso(birth.value, "birth") : "",
      expiryDate: expiry ? yymmddToIso(expiry.value, "expiry") : "",
      sure: !!birth?.sure,
    };
  }
  // ID card: line 1 starts I, A or C; line 2 has birth date at 0–5; line 3 is the name.
  for (let i = 0; i < lines.length - 2; i++) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]];
    if (!/^[IAC][A-Z<]/.test(a) || b.length < 18) continue;
    const birth = mrzDate(b.slice(0, 6), b[6]);
    const expiry = mrzDate(b.slice(8, 14), b[14]);
    const { firstName, lastName } = mrzNames(c);
    if (!lastName || !birth) continue;
    return {
      documentType: "national-id",
      firstName,
      lastName,
      nationality: b.slice(15, 18).replace(/[^A-Z]/g, ""),
      dateOfBirth: yymmddToIso(birth.value, "birth"),
      expiryDate: expiry ? yymmddToIso(expiry.value, "expiry") : "",
      sure: birth.sure,
    };
  }
  return null;
}

async function idReader(count) {
  let tesseract;
  let sharp;
  try {
    tesseract = await import("tesseract.js");
    sharp = (await import("sharp")).default;
    // Less memory: one photo decoded at a time per reader, nothing kept around.
    sharp.cache(false);
    sharp.concurrency(1);
  } catch {
    console.error("To read IDs, first run:\n  npm install --no-save tesseract.js@5 @tesseract.js-data/eng");
    process.exit(1);
  }
  const langPath = path.resolve("node_modules/@tesseract.js-data/eng/4.0.0_best_int");
  if (!existsSync(langPath)) {
    console.error("The English OCR data is missing. Run:\n  npm install --no-save @tesseract.js-data/eng");
    process.exit(1);
  }
  // One reader per processor core, each reading a different photo.
  // debug_file: the reader's own notes ("Image too small to scale", "Line
  // cannot be recognized") are about non-text shapes it skips — not errors.
  const makeWorker = async () => {
    const worker = await tesseract.createWorker(
      "eng",
      1,
      { langPath, gzip: true, cachePath: path.join(OUT, ".ocr-cache") },
      { debug_file: "/dev/null" },
    );
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK,
    });
    return worker;
  };
  const free = [];
  for (let i = 0; i < count; i++) free.push(await makeWorker());
  const all = new Set(free);
  const waiting = [];
  const take = () => (free.length ? Promise.resolve(free.pop()) : new Promise((r) => waiting.push(r)));
  const give = (w) => (waiting.length ? waiting.shift()(w) : free.push(w));

  return {
    async read(bytes) {
      // Upright from the camera's own note, grey, larger. The lower half first
      // (where the lines are), then the whole photo; then turned — sideways
      // for a photo taller than wide, upside down otherwise.
      const meta = await withTimeout(
        sharp(bytes, { failOn: "none" }).rotate().grayscale().normalise().resize({ width: 1800 }).toBuffer({ resolveWithObject: true }),
        60_000,
      );
      const { width, height } = meta.info;
      const tries = [
        () => sharp(meta.data).extract({ left: 0, top: Math.floor(height * 0.5), width, height: Math.ceil(height * 0.5) }).toBuffer(),
        () => Promise.resolve(meta.data),
        ...(height > width
          ? [() => sharp(meta.data).rotate(90).toBuffer(), () => sharp(meta.data).rotate(270).toBuffer()]
          : [() => sharp(meta.data).rotate(180).toBuffer()]),
      ];
      let worker = await take();
      try {
        for (const t of tries) {
          try {
            const { data } = await withTimeout(
              t().then((img) => worker.recognize(img)),
              60_000,
            );
            const found = parseMrz(data.text);
            if (found) return found;
          } catch (e) {
            if (e?.message !== "timeout") continue; // next way round
            // Stuck on this photo: replace the reader and give the photo up.
            all.delete(worker);
            void worker.terminate().catch(() => {});
            worker = await makeWorker();
            all.add(worker);
            throw e;
          }
        }
        return null;
      } finally {
        give(worker);
      }
    },
    close: () => Promise.all([...all].map((w) => w.terminate().catch(() => {}))),
  };
}

// ------------------------------------------------------------------ main

const DOCUMENT_KINDS = new Set([
  "cv", "cover", "certificate", "identity", "identityBack", "selfie",
  "residencePermit", "residenceBack", "residenceSelfie", "voice",
  "formation", "einLetter", "panFront", "panBack", "addressProof", "signedAgreement",
]);
const APPLICATION_KINDS = new Set(["cv", "cover", "certificate"]);
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const tg = readTelegram(TELEGRAM);
  console.log(
    `Telegram: ${tg.applications.length - tg.later} applications (+${tg.later} people known only from later messages), ` +
      `${tg.submitted.length} "submitted" messages, ${tg.interviews.length} interviews, ` +
      `${tg.addresses.length} proofs of address, ${tg.signed.length} signed agreements.`,
  );
  if (!tg.applications.length) {
    console.error("No application messages found. Is this the export of the chat your bot posts to?");
    process.exit(1);
  }

  console.log("Reading the list of files in R2…");
  const folders = new Map();
  for (const o of await listAll("candidates/")) {
    const [, id, file] = o.key.split("/");
    if (!id || !file) continue;
    if (!folders.has(id)) folders.set(id, { id, files: [] });
    folders.get(id).files.push({ ...o, file, kind: file.split("-")[0].replace(/\.[^.]+$/, "") });
  }
  console.log(`R2: ${folders.size} candidate folders.`);

  // What each folder says about its owner: first the agreements (quick)…
  const started = Date.now();
  let n = 0;
  for (const f of folders.values()) {
    n++;
    if (process.stdout.isTTY && (n % 5 === 0 || n === folders.size)) process.stdout.write(`\rReading agreements… ${n} of ${folders.size}`);
    else if (!process.stdout.isTTY && (n % 250 === 0 || n === folders.size)) console.log(`Reading agreements… ${n} of ${folders.size}`);
    f.files.sort((a, b) => a.at.localeCompare(b.at));
    const newest = (kind) => f.files.filter((x) => x.kind === kind).at(-1);
    const appTimes = f.files.filter((x) => APPLICATION_KINDS.has(x.kind)).map((x) => x.at);
    f.firstUpload = appTimes[0] || f.files[0]?.at || "";
    f.lastAppUpload = appTimes.at(-1) || f.firstUpload;

    const agreement = newest("agreement");
    if (agreement) {
      f.agreement = { key: agreement.key, at: agreement.at, ref: refOf(agreement.file), ...(await readAgreement(agreement.key)) };
    }
    if (!f.agreement?.name) {
      for (const s of f.files.filter((x) => x.kind === "signedAgreement" && /\.pdf$/i.test(x.file)).reverse()) {
        const got = await readAgreement(s.key);
        if (got.name) {
          f.signedName = got.name;
          break;
        }
      }
    }
    // The back of an ID card carries the lines; a passport has them on the front.
    f.idImages = ["identityBack", "identity"].map(newest).filter((x) => x && IMAGE.test(x.file));
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
  console.log(`Agreements read in ${Math.max(1, Math.round((Date.now() - started) / 60000))} min.`);

  // CVs: only the email addresses and phone numbers in them are kept (in
  // cv-cache.json, so a stopped run carries on), never the text.
  const cvCachePath = path.join(OUT, "cv-cache.json");
  let cvCache = {};
  try {
    cvCache = JSON.parse(readFileSync(cvCachePath, "utf8"));
  } catch {
    cvCache = {};
  }
  for (const f of folders.values()) {
    const cv = f.files.filter((x) => x.kind === "cv" || x.kind === "cover").sort((x, y) => (x.kind === "cv" ? -1 : 1) - (y.kind === "cv" ? -1 : 1)).map((x) => cvCache[x.key]).filter(Boolean);
    if (cv.length) {
      f.cv = {
        emails: [...new Set(cv.flatMap((c) => c.emails))],
        phones: [...new Set(cv.flatMap((c) => c.phones))],
        phonesRaw: cv.flatMap((c) => c.phonesRaw ?? []),
        name: cv.map((c) => c.name).find(Boolean) ?? "",
      };
    }
  }
  if (READ_CVS) {
    let pdfjs;
    let mammoth;
    try {
      pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      mammoth = (await import("mammoth")).default;
    } catch {
      console.error("To read CVs, first run:\n  npm install --no-save pdfjs-dist@4.10.38 mammoth@1.13.0");
      process.exit(1);
    }
    const textOf = async (file, bytes) => {
      if (/\.pdf$/i.test(file)) {
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
        let text = "";
        for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
          const page = await doc.getPage(i);
          text += (await page.getTextContent()).items.map((x) => (x.str ?? "") + (x.hasEOL ? "\n" : " ")).join("") + "\n";
        }
        await doc.destroy();
        return text;
      }
      if (/\.docx$/i.test(file)) return (await mammoth.extractRawText({ buffer: bytes })).value;
      return "";
    };
    const todo = [...folders.values()].flatMap((f) =>
      f.files.filter((x) => (x.kind === "cv" || x.kind === "cover") && /\.(pdf|docx)$/i.test(x.file) && !(x.key in cvCache && (cvCache[x.key] === null || cvCache[x.key].v === 2))),
    );
    console.log(`Reading ${todo.length} CVs and cover letters…`);
    const t0 = Date.now();
    let done = 0;
    let next = 0;
    const alive = setInterval(() => console.log(`Still reading CVs: ${done} of ${todo.length} done (${Math.round((Date.now() - t0) / 60000)} min so far).`), 60_000);
    alive.unref();
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < todo.length) {
          const x = todo[next++];
          try {
            const text = await withTimeout(
              getBytes(x.key).then((b) => textOf(x.file, b)),
              90_000,
            );
            cvCache[x.key] = contactsIn(text);
          } catch {
            cvCache[x.key] = null;
          }
          done++;
          if (done % 50 === 0) writeFileSync(cvCachePath, JSON.stringify(cvCache));
          if (done % 25 === 0 || done === todo.length) {
            const mins = (Date.now() - t0) / 60000;
            console.log(`Reading CVs… ${done} of ${todo.length} (${Math.round(mins)} min so far, about ${Math.round((mins / done) * (todo.length - done))} min left)`);
          }
        }
      }),
    );
    clearInterval(alive);
    writeFileSync(cvCachePath, JSON.stringify(cvCache));
    for (const f of folders.values()) {
      const cv = f.files.filter((x) => x.kind === "cv" || x.kind === "cover").sort((x, y) => (x.kind === "cv" ? -1 : 1) - (y.kind === "cv" ? -1 : 1)).map((x) => cvCache[x.key]).filter(Boolean);
      if (cv.length) {
      f.cv = {
        emails: [...new Set(cv.flatMap((c) => c.emails))],
        phones: [...new Set(cv.flatMap((c) => c.phones))],
        phonesRaw: cv.flatMap((c) => c.phonesRaw ?? []),
        name: cv.map((c) => c.name).find(Boolean) ?? "",
      };
    }
    }
  }

  // …then the IDs, several at a time. Each one read is remembered in
  // id-cache.json, so a stopped run carries on where it was.
  const idData = [];
  const CACHE = path.join(OUT, "id-cache.json");
  let idCache = {};
  try {
    idCache = JSON.parse(readFileSync(CACHE, "utf8"));
  } catch {
    idCache = {};
  }
  if (!READ_IDS && Object.keys(idCache).length) {
    // No new reading, but what an earlier --ids run read is still evidence.
    let used = 0;
    for (const f of folders.values()) {
      const got = f.idImages.map((x) => idCache[x.key]).find(Boolean);
      if (got) {
        f.mrz = got;
        used++;
      }
    }
    console.log(`Using ${used} IDs read on an earlier run (no new ID reading without --ids).`);
  }
  if (READ_IDS) {
    const saveCache = () => writeFileSync(CACHE, JSON.stringify(idCache));
    const todo = [...folders.values()].filter((f) => f.idImages.length);
    const done0 = todo.filter((f) => f.idImages.every((x) => x.key in idCache)).length;
    const cores = Math.max(1, Math.min(8, (await import("node:os")).availableParallelism?.() ?? 2));
    console.log(
      `Reading the IDs of ${todo.length} candidates with ${cores} readers at once` +
        (done0 ? ` (${done0} already read on an earlier run: skipped).` : "."),
    );
    const ids = await idReader(cores);
    const t0 = Date.now();
    let finished = 0;
    let fresh = 0;
    let skipped = 0;
    // A sign of life every five minutes, even when no 25 have finished.
    const heartbeat = setInterval(() => {
      console.log(`Still working: ${finished} of ${todo.length} done (${Math.round((Date.now() - t0) / 60000)} min so far).`);
    }, 2 * 60_000);
    heartbeat.unref();
    const one = async (f) => {
      let didRead = false;
      for (const img of f.idImages) {
        let got = idCache[img.key];
        if (got === undefined) {
          didRead = true;
          got = await getBytes(img.key)
            .then((bytes) => ids.read(bytes))
            .catch((e) => {
              if (e?.message === "timeout") {
                skipped++;
                console.log(`Skipped one ID photo that took too long (candidate ${f.id}).`);
              }
              return null;
            });
          idCache[img.key] = got ?? null;
        }
        if (got) {
          f.mrz = got;
          break;
        }
      }
      finished++;
      if (didRead) fresh++;
      if (didRead && fresh % 10 === 0) saveCache();
      if (finished % 25 === 0 || finished === todo.length) {
        const mins = (Date.now() - t0) / 60000;
        const per = fresh ? mins / fresh : 0;
        const left = Math.round(per * (todo.length - finished));
        const line = `Reading IDs… ${finished} of ${todo.length} (${Math.round(mins)} min so far, about ${left} min left)`;
        if (process.stdout.isTTY) process.stdout.write(`\r${line}   `);
        else console.log(line);
      }
    };
    let next = 0;
    await Promise.all(
      Array.from({ length: cores }, async () => {
        while (next < todo.length) await one(todo[next++]);
      }),
    );
    clearInterval(heartbeat);
    if (process.stdout.isTTY) process.stdout.write("\n");
    if (skipped) console.log(`${skipped} ID photos were skipped because they took too long; the other evidence is still used for them.`);
    saveCache();
    await ids.close();
    for (const f of folders.values()) idData.push({ candidateId: f.id, ...(f.mrz ?? { read: false }) });
  }

  console.log("Matching folders to people…");
  // ---- matching: score every (folder, application) pair, best pairs first.
  const byEmail = new Map();
  for (const a of tg.applications) {
    if (!a.email) continue;
    if (!byEmail.has(a.email)) byEmail.set(a.email, []);
    byEmail.get(a.email).push(a);
  }
  /** Of one person's applications, the one this folder belongs to: the last one started before its first upload. */
  const pickByTime = (apps, f) => {
    const t = ms(f.firstUpload);
    const before = apps.filter((a) => ms(a.at) <= t + 5 * MIN);
    return (before.length ? before : apps).reduce((best, a) => (!best || ms(a.at) > ms(best.at) ? a : best), null);
  };
  const appsFor = (email, key, f) => {
    const list = email && byEmail.has(email) ? byEmail.get(email) : tg.applications.filter((a) => sameName(a.key, key));
    const one = list.length ? pickByTime(list, f) : null;
    return one ? [one] : [];
  };

  const f0 = {}; // numbers for the diagnosis
  // The "has just submitted the application form" message is sent the moment
  // the form's own files (CV, cover letter, certificate) finish uploading —
  // seconds after the last of them. A folder and such a message belong
  // together only when each is the other's only possibility: when two people
  // finish in the same moment, timing cannot tell them apart, and it is not
  // guessed.
  {
    const lastForm = new Map();
    for (const f of folders.values()) {
      const ups = f.files.filter((x) => APPLICATION_KINDS.has(x.kind)).map((x) => ms(x.at));
      if (ups.length) lastForm.set(f.id, Math.max(...ups));
    }
    const settled = new Map(); // folder id -> message
    const taken = new Set();
    const possible = new Map(); // folder id -> messages, for the ones left open
    // First within 20 seconds; then, for what is left, within 3 minutes — a
    // large CV on a slow phone starts uploading well before it finishes.
    for (const AFTER of [20_000, 3 * MIN]) {
      const forFolder = new Map();
      const forMessage = new Map();
      for (const [fid, last] of lastForm) {
        if (settled.has(fid)) continue;
        for (const sm of tg.submitted) {
          if (taken.has(sm)) continue;
          const gap = ms(sm.at) - last;
          if (gap < -3_000 || gap > AFTER) continue;
          if (!forFolder.has(fid)) forFolder.set(fid, []);
          forFolder.get(fid).push(sm);
          if (!forMessage.has(sm)) forMessage.set(sm, []);
          forMessage.get(sm).push(fid);
        }
      }
      // Settle the certain pairs, take them out, and look again: a message
      // that is surely A's is no longer a possibility for B — like a sudoku.
      let changed = true;
      while (changed) {
        changed = false;
        for (const [fid, list] of forFolder) {
          if (settled.has(fid)) continue;
          const open = list.filter((sm) => !taken.has(sm));
          if (open.length !== 1) continue;
          if (forMessage.get(open[0]).some((id) => id !== fid && !settled.has(id))) continue;
          settled.set(fid, open[0]);
          taken.add(open[0]);
          changed = true;
        }
      }
      for (const [fid, list] of forFolder) if (!settled.has(fid)) possible.set(fid, list.filter((sm) => !taken.has(sm)));
    }
    for (const f of folders.values()) {
      if (settled.has(f.id)) f.submitted = { list: [settled.get(f.id)], clear: true };
      else if (possible.get(f.id)?.length) f.submitted = { list: possible.get(f.id), clear: false };
    }
    // The interview page asks for the ID photos the moment the assessment is
    // scored, and "Interview completed" (name, email) is sent at that moment:
    // the photos follow it, often within minutes but sometimes hours later.
    // Same rule as above — linked only when each is the other's only
    // possibility — and the settings are chosen by testing them on the
    // candidates whose folder is already known, so we know how far to trust it.
    {
      const ID_KINDS = new Set(["identity", "identityBack", "selfie"]);
      const firstId = new Map();
      for (const f of folders.values()) {
        const t = f.files.filter((x) => ID_KINDS.has(x.kind)).map((x) => ms(x.at));
        if (t.length) firstId.set(f.id, Math.min(...t));
      }
      // Folders already known through the "submitted" message, and their owner's email.
      const knownEmail = new Map();
      for (const f of folders.values()) {
        if (!f.submitted?.clear) continue;
        const sm = f.submitted.list[0];
        const same = tg.applications.filter((a) => sameName(a.key, sm.key) && ms(a.at) <= ms(sm.at));
        const a = same.length ? pickByTime(same, f) : null;
        if (a?.email) knownEmail.set(f.id, a.email);
      }

      /** Link ID uploads to interviews, widening the window step by step. `known` folders own their email's interviews. */
      const link = (windowsMin, known) => {
        const ownedBy = new Map([...known].map(([fid, e]) => [e, fid]));
        const doneF = new Map();
        const doneM = new Set();
        const maybe = new Map();
        for (const [fid, email] of known) {
          const up = firstId.get(fid);
          if (up === undefined) continue;
          const own = tg.interviews.find((iv) => iv.email === email && up - ms(iv.at) >= -MIN && up - ms(iv.at) <= 24 * HOUR);
          if (own) doneM.add(own);
        }
        for (const W of windowsMin.map((m) => m * MIN)) {
          const forFolder = new Map();
          const forMessage = new Map();
          for (const [fid, up] of firstId) {
            if (doneF.has(fid) || known.has(fid)) continue;
            for (const iv of tg.interviews) {
              if (doneM.has(iv) || !iv.email) continue;
              if (ownedBy.has(iv.email) && ownedBy.get(iv.email) !== fid) continue;
              const gap = up - ms(iv.at);
              if (gap < -MIN || gap > W) continue;
              if (!forFolder.has(fid)) forFolder.set(fid, []);
              forFolder.get(fid).push(iv);
              if (!forMessage.has(iv)) forMessage.set(iv, []);
              forMessage.get(iv).push(fid);
            }
          }
          let changed = true;
          while (changed) {
            changed = false;
            for (const [fid, list] of forFolder) {
              if (doneF.has(fid)) continue;
              const open = list.filter((iv) => !doneM.has(iv));
              if (open.length !== 1) continue;
              if (forMessage.get(open[0]).some((id) => id !== fid && !doneF.has(id))) continue;
              doneF.set(fid, open[0]);
              doneM.add(open[0]);
              changed = true;
            }
          }
          for (const [fid, list] of forFolder) if (!doneF.has(fid)) maybe.set(fid, list.filter((iv) => !doneM.has(iv)));
        }
        return { doneF, maybe };
      };

      // Test each setting: hide half of the known folders, link, and check
      // the answers on the hidden half; then the other half.
      const knownWithId = [...knownEmail].filter(([fid]) => firstId.has(fid));
      const SETTINGS = [[5], [10], [5, 15], [5, 15, 30], [5, 15, 30, 60], [15], [15, 60], [60]];
      const tested = SETTINGS.map((windows) => {
        let right = 0;
        let wrong = 0;
        for (const half of [0, 1]) {
          const hidden = new Map(knownWithId.filter((_, i) => i % 2 === half));
          const shown = new Map([...knownEmail].filter(([fid]) => !hidden.has(fid)));
          const { doneF } = link(windows, shown);
          for (const [fid, email] of hidden) {
            const got = doneF.get(fid);
            if (!got) continue;
            if (got.email === email) right++;
            else wrong++;
          }
        }
        return { windows, right, wrong };
      });
      // The setting that finds the most while staying right at least 98% of
      // the time; if none does, the most accurate one, and trusted less.
      const good = tested.filter((t) => t.right + t.wrong >= 10 && t.wrong <= 0.02 * (t.right + t.wrong));
      const chosen = good.length
        ? good.reduce((x, y) => (y.right > x.right ? y : x))
        : tested.reduce((x, y) => (y.right / (y.right + y.wrong || 1) > x.right / (x.right + x.wrong || 1) ? y : x));
      const trusted = good.length > 0;
      f0.idCheck = { ...chosen, tested: knownWithId.length, trusted };

      const { doneF, maybe } = link(chosen.windows, knownEmail);
      for (const f of folders.values()) {
        if (knownEmail.has(f.id)) continue; // already known; its interview adds nothing new
        if (doneF.has(f.id)) f.interviewLink = { list: [doneF.get(f.id)], clear: true, trusted };
        else if (maybe.get(f.id)?.length) f.interviewLink = { list: maybe.get(f.id), clear: false };
      }
    }

    // For the diagnosis: how far the nearest message was from each folder left without one.
    for (const [fid, last] of lastForm) {
      const f = folders.get(fid);
      if (f.submitted) continue;
      let best = Infinity;
      for (const sm of tg.submitted) {
        const gap = ms(sm.at) - last;
        if (Math.abs(gap) < Math.abs(best)) best = gap;
      }
      f.nearestSubmitted = best;
    }
  }

  const pairs = [];
  for (const f of folders.values()) {
    const score = new Map();
    const add = (apps, pts, why) => {
      for (const a of apps) {
        const s = score.get(a.n) ?? { pts: 0, why: [] };
        s.pts += pts;
        if (!s.why.includes(why)) s.why.push(why);
        score.set(a.n, s);
      }
    };
    const within = (iso, from, to) => {
      const t = ms(iso);
      return t >= from && t <= to;
    };

    // 1. The agreement reference in the file name, quoted in the "signed" message.
    if (f.agreement?.ref) {
      for (const s of tg.signed.filter((s) => s.ref && s.ref === f.agreement.ref)) add(appsFor(s.email, s.key, f), 100, "agreement reference");
    }
    // 2. Signed copy or proof of address uploaded just before the message about it.
    for (const s of tg.signed) {
      const t = ms(s.at);
      if (f.files.some((x) => x.kind === "signedAgreement" && within(x.at, t - 30 * MIN, t + 5 * MIN))) add(appsFor(s.email, s.key, f), 60, "signed agreement upload time");
    }
    for (const s of tg.addresses) {
      const t = ms(s.at);
      if (f.files.some((x) => x.kind === "addressProof" && within(x.at, t - 45 * MIN, t + 5 * MIN))) add(appsFor(s.email, s.key, f), 60, "proof of address upload time");
    }
    // 3. The name on the agreement, and on the ID.
    const docName = nameKey(f.agreement?.name || f.signedName || "");
    if (docName) {
      const same = tg.applications.filter((a) => sameName(a.key, docName));
      add(same.length ? [pickByTime(same, f)] : [], same.length === 1 ? 50 : 15, same.length === 1 ? "name on agreement" : "name on agreement (shared by others)");
    }
    if (f.mrz) {
      const idName = nameKey(`${f.mrz.firstName} ${f.mrz.lastName}`);
      const same = tg.applications.filter((a) => sameName(a.key, idName));
      const dobToo = same.filter((a) => f.mrz.dateOfBirth && a.dob === f.mrz.dateOfBirth);
      if (dobToo.length) add([pickByTime(dobToo, f)], 70, "name and date of birth on ID");
      else if (same.length === 1) add(same, 40, "name on ID");
      else if (same.length) add([pickByTime(same, f)], 10, "name on ID (shared by others)");
    }
    // 4a. The email address or phone number written in their CV.
    if (f.cv) {
      // Their own address normally comes first, at the top; later ones are
      // often referees or former employers.
      const byMail = f.cv.emails.filter((e) => byEmail.has(e));
      byMail.forEach((e, i) =>
        add(
          appsFor(e, "", f),
          byMail.length === 1 ? 90 : i === 0 ? 70 : 20,
          byMail.length === 1 ? "email in CV" : i === 0 ? "first email in CV" : "another email in CV",
        ),
      );
      const byPhone = tg.applications.filter((a) => a.phone && f.cv.phones.includes(phoneKey(a.phone)));
      const people = new Set(byPhone.map((a) => a.email || a.key));
      if (people.size === 1) add([pickByTime(byPhone, f)], 60, "phone in CV");
      else if (people.size > 1) add(byPhone.map((a) => pickByTime([a], f)), 10, "phone in CV (several)");
    }
    // 4b. ID photos uploaded minutes after "Interview completed": that email is the owner.
    if (f.interviewLink) {
      for (const iv of f.interviewLink.list) {
        add(
          appsFor(iv.email, iv.key, f),
          f.interviewLink.clear ? (f.interviewLink.trusted ? 80 : 15) : 5,
          f.interviewLink.clear ? "ID uploaded right after their interview" : "ID uploaded after an interview (someone else's too)",
        );
      }
    }
    // 4. The form submitted, seconds after its files: that name is the owner.
    if (f.submitted) {
      for (const sm of f.submitted.list) {
        const same = tg.applications.filter((a) => sameName(a.key, sm.key) && ms(a.at) <= ms(sm.at));
        if (!same.length) continue;
        add(
          [pickByTime(same, f)],
          f.submitted.clear ? 80 : 10,
          f.submitted.clear ? "form submitted right after the CV upload" : "form submitted near the CV upload (someone else too)",
        );
      }
    }
    // 5. Only one application started in the hours before the upload: theirs.
    //    (With others close by, the nearest is often someone else, so it
    //    counts for little.)
    if (f.firstUpload) {
      const t = ms(f.firstUpload);
      const near = tg.applications
        .map((a) => ({ a, gap: t - ms(a.at) }))
        .filter((x) => x.gap >= -2 * MIN && x.gap <= 3 * HOUR)
        .sort((x, y) => x.gap - y.gap);
      if (near.length === 1) add([near[0].a], 35, "only application at the time of the upload");
      else if (near.length) add([near[0].a], 5, "upload time");
    }
    for (const [appN, s] of score) pairs.push({ f, a: tg.applications[appN], pts: s.pts, why: s.why });
  }

  // Each folder and each application used once, best evidence first.
  pairs.sort((x, y) => y.pts - x.pts);
  const folderMatch = new Map();
  const usedApps = new Set();
  // The two best scores per folder (pairs are already sorted, best first).
  const bestFor = new Map();
  for (const p of pairs) {
    const b = bestFor.get(p.f.id);
    if (!b) bestFor.set(p.f.id, { first: p.pts, second: 0, seen: 1 });
    else if (b.seen === 1) Object.assign(b, { second: p.pts, seen: 2 });
  }
  for (const p of pairs) {
    if (folderMatch.has(p.f.id) || usedApps.has(p.a.n) || p.pts < 35) continue;
    const b = bestFor.get(p.f.id);
    if (b.first - b.second < 20 && p.pts < 100) continue; // two people fit about equally: leave it to a person
    folderMatch.set(p.f.id, p);
    usedApps.add(p.a.n);
  }
  // Folders left unmatched, with whoever they could belong to, for a person to decide.
  const maybe = new Map(); // folder id -> applications
  const maybeFolders = new Map(); // application n -> folder ids
  for (const p of pairs) {
    if (folderMatch.has(p.f.id) || usedApps.has(p.a.n)) continue;
    const list = maybe.get(p.f.id) ?? [];
    if (list.length < 3 && !list.includes(p.a)) list.push(p.a);
    maybe.set(p.f.id, list);
    const fl = maybeFolders.get(p.a.n) ?? [];
    if (!fl.includes(p.f.id)) fl.push(p.f.id);
    maybeFolders.set(p.a.n, fl);
  }

  // ---- records in the site's own format.
  const rebuiltAt = new Date().toISOString();
  const records = [];
  const report = [];
  const latestBy = (list, a) =>
    list.filter((x) => (a.email && x.email === a.email) || sameName(x.key, a.key)).sort((x, y) => x.at.localeCompare(y.at));

  function build(f, a, match) {
    const files = f?.files ?? [];
    const newestKind = new Map();
    for (const x of files) if (x.kind !== "signedAgreement" && DOCUMENT_KINDS.has(x.kind)) newestKind.set(x.kind, x);
    const documents = [
      ...[...newestKind.values()],
      ...files.filter((x) => x.kind === "signedAgreement"),
    ].map((x) => ({ kind: x.kind, filename: x.file, size: x.size, uploadedAt: x.at, key: x.key, status: "clean" }));

    const name = a ? { firstName: a.firstName, lastName: a.lastName, fullName: a.fullName } : null;
    const titled = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
    const docName =
      f?.agreement?.name || f?.signedName || (f?.mrz ? titled(`${f.mrz.firstName} ${f.mrz.lastName}`.trim()) : "") || (!a ? f?.cv?.name ?? "" : "");
    const fallback = docName.split(" ");
    const c = {
      id: f?.id ?? newId(),
      firstName: name?.firstName ?? (f?.mrz && !f.agreement?.name && !f.signedName ? titled(f.mrz.firstName) : fallback.slice(0, -1).join(" ")),
      lastName: name?.lastName ?? (f?.mrz && !f.agreement?.name && !f.signedName ? titled(f.mrz.lastName) : fallback.at(-1) ?? ""),
      fullName: name?.fullName ?? docName,
      dob: a?.dob || a?.dobRaw || f?.mrz?.dateOfBirth || "",
      email: a ? a.email : f?.cv?.emails[0] ?? "",
      phone: a ? a.phone : f?.cv?.phonesRaw?.[0] ?? "",
      country: a?.country ?? "",
      city: a?.city ?? "",
      address: a?.address ?? "",
      linkedin: a?.linkedin ?? "",
      languages: [],
      position: "",
      application: { rebuilt: true, rebuiltAt },
      status: "New Application",
      createdAt: a?.at || f?.firstUpload || rebuiltAt,
      documents,
    };
    const notes = [`Rebuilt on ${rebuiltAt.slice(0, 10)} after the host volume was lost.`];
    if (match) notes.push(`Matched to the Telegram application by: ${match.why.join(", ")}.`);
    else if (f && a === null) {
      const from = f.agreement?.name || f.signedName ? "their agreement" : f.mrz ? "their ID" : f.cv?.name ? "the top of their CV (check it)" : "";
      notes.push(
        "No Telegram message about this person (their country's applications were not posted to Telegram). " +
          `Added from their files: ${c.email ? "email" : ""}${c.email && c.phone ? " and " : ""}${c.phone ? "phone" : ""}${c.email || c.phone ? " from their CV" : "no contact details found"}` +
          `${from ? `; name from ${from}` : "; no name found — open their CV"}.`,
      );
    }
    if (!f) {
      const could = a ? maybeFolders.get(a.n) ?? [] : [];
      notes.push(
        could.length
          ? `Their files are probably in storage folder ${could.join(" or ")}, but it could not be told for sure. Check the files there and add them by hand.`
          : "No files found in storage for this application.",
      );
    }

    if (a) {
      const sub = tg.submitted.filter((s) => sameName(s.key, a.key) && ms(s.at) >= ms(a.at)).sort((x, y) => x.at.localeCompare(y.at))[0];
      if (sub) c.submittedAt = sub.at;
      const iv = latestBy(tg.interviews, a).at(-1);
      if (iv) {
        c.status = "Interview Completed";
        notes.push(`Interview score from Telegram: ${iv.score} (${iv.at.slice(0, 10)}). Answers were not recoverable.`);
      }
    }
    if (f?.mrz) {
      c.identityDocumentType = f.mrz.documentType;
      if (f.mrz.nationality) notes.push(`ID read: ${f.mrz.documentType}, nationality ${f.mrz.nationality}${f.mrz.expiryDate ? `, expires ${f.mrz.expiryDate}` : ""}${f.mrz.sure ? "" : " (not certain)"}.`);
    }

    // Proof of address: the files, and what they typed (from Telegram).
    const proofs = files.filter((x) => x.kind === "addressProof");
    if (proofs.length) {
      const said = a ? latestBy(tg.addresses, a) : [];
      c.addressProofSubmissions = proofs.map((p) => {
        const msg = said.find((s) => Math.abs(ms(s.at) - ms(p.at)) <= 45 * MIN) ?? said.at(-1);
        return { at: msg?.at ?? p.at, type: msg?.type || "utility", address: msg?.address ?? "", onFile: msg?.onFile || c.address, key: p.key };
      });
      c.addressProofSubmittedAt = c.addressProofSubmissions.at(-1).at;
      c.status = "Accepted";
    }
    // Agreement: the PDF we sent, and the signed copy.
    if (f?.agreement) {
      c.agreementKey = f.agreement.key;
      c.agreementSentAt = f.agreement.at;
      if (f.agreement.ref) c.agreementRef = f.agreement.ref;
      if (f.agreement.startDate) c.agreementStartDate = f.agreement.startDate;
      const signed = files.filter((x) => x.kind === "signedAgreement" && x.at >= f.agreement.at);
      if (signed.length) {
        const at = signed.at(-1).at;
        c.agreementSubmissions = [{ at, keys: signed.map((x) => x.key), via: "upload" }];
        c.agreementSignedAt = at;
      }
      c.status = "Full verified";
    }
    if (c.status === "Accepted" || c.status === "Full verified") {
      // They had accepted the offer before either was asked for; the day is not known.
      c.offerAcceptedAt = [c.addressProofSubmittedAt, c.agreementSentAt].filter(Boolean).sort()[0];
      notes.push("Offer acceptance date is estimated. Offer terms were not recoverable.");
    }
    c.notes = notes.join("\n");
    c.notesUpdatedAt = rebuiltAt;

    // Sure only with evidence beyond timing: a reference, a name on a document, an upload just before its message.
    const sure = !match ? (a ? "no files" : "from files only") : match.pts >= 80 ? "high" : "medium";
    const why = match
      ? match.why.join("; ")
      : !f && a && maybeFolders.has(a.n)
        ? `files probably in folder ${maybeFolders.get(a.n).join(" or ")}`
        : f && maybe.has(f.id)
          ? `could be ${maybe.get(f.id).map((x) => x.fullName).join(" or ")}`
          : "";
    report.push({ c, sure, why, score: match?.pts ?? "" });
    return c;
  }

  for (const f of folders.values()) {
    const m = folderMatch.get(f.id);
    if (m) records.push(build(f, m.a, m));
  }
  const takenEmails = new Map(records.filter((r) => r.email).map((r) => [r.email, r.id]));
  for (const f of folders.values()) {
    if (folderMatch.has(f.id)) continue;
    const cvEmail = f.cv?.emails[0];
    if (cvEmail && takenEmails.has(cvEmail)) {
      report.push({
        c: { id: f.id, fullName: f.cv?.name ?? "", email: cvEmail, status: "", documents: f.files },
        sure: "same person (left out)",
        why: `another application of candidate ${takenEmails.get(cvEmail)} (same email in CV)`,
        score: "",
      });
      continue;
    }
    if (f.agreement?.name || f.signedName || f.mrz || f.cv?.emails.length || f.cv?.phones.length || INCLUDE_UNNAMED) {
      const r = build(f, null, null);
      records.push(r);
      if (r.email) takenEmails.set(r.email, r.id);
    } else {
      const could = maybe.get(f.id);
      report.push({
        c: { id: f.id, fullName: "", email: "", status: "", documents: f.files },
        sure: "not matched (left out)",
        why: could ? `could be ${could.map((x) => x.fullName).join(" or ")}` : "",
        score: "",
      });
    }
  }
  for (const a of tg.applications) {
    if (usedApps.has(a.n)) continue;
    // The same person's earlier attempt, already in through a later one, is not a second candidate.
    const twin = records.find((r) => (a.email && r.email === a.email) || (r.fullName && sameName(nameKey(r.fullName), a.key) && r.dob === a.dob));
    if (twin) continue;
    records.push(build(null, a, null));
  }

  records.sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
  writeFileSync(path.join(OUT, "candidates.json"), JSON.stringify(records, null, 2));
  if (READ_IDS) writeFileSync(path.join(OUT, "id-data.json"), JSON.stringify(idData, null, 2));

  const order = { high: 0, medium: 1, "from files only": 2, "no files": 3, "same person (left out)": 4, "not matched (left out)": 5 };
  report.sort((x, y) => order[x.sure] - order[y.sure] || (x.c.fullName || "~").localeCompare(y.c.fullName || "~"));
  writeFileSync(
    path.join(OUT, "rebuild-report.csv"),
    [
      "How sure,Name,Email,Candidate ID,Status,Files,Matched by,Score",
      ...report.map((r) =>
        [r.sure, r.c.fullName || "(unknown)", r.c.email, r.c.id, r.c.status, (r.c.documents ?? []).length, r.why, r.score].map(cell).join(","),
      ),
    ].join("\r\n"),
  );

  const count = (s) => report.filter((r) => r.sure === s).length;
  // Counts only, no names: why folders were or were not matched, to look into.
  const all = [...folders.values()];
  const withForm = all.filter((f) => f.files.some((x) => APPLICATION_KINDS.has(x.kind)));
  console.log(
    `\nID photos linked for sure to an "Interview completed" message: ${all.filter((f) => f.interviewLink?.clear).length}; ` +
      `several possible: ${all.filter((f) => f.interviewLink && !f.interviewLink.clear).length}.` +
      (f0.idCheck
        ? `\nChecked on ${f0.idCheck.tested} candidates already known: ${f0.idCheck.right} right, ${f0.idCheck.wrong} wrong ` +
          `(windows ${f0.idCheck.windows.join("/")} min)${f0.idCheck.trusted ? "" : " — not reliable enough on its own: used only to support other evidence"}.`
        : ""),
  );
  console.log(
    `Folders: ${all.length}; with a CV or other form file: ${withForm.length}; ` +
      `linked for sure to a "submitted" message: ${all.filter((f) => f.submitted?.clear).length}; ` +
      `several possible: ${all.filter((f) => f.submitted && !f.submitted.clear).length}; ` +
      `none within 3 minutes: ${withForm.filter((f) => !f.submitted).length}.`,
  );
  const lone = withForm.filter((f) => !f.submitted);
  if (lone.length) {
    const g = (lo, hi) => lone.filter((f) => f.nearestSubmitted >= lo && f.nearestSubmitted < hi).length;
    console.log(
      `For those, the nearest "submitted" message was: ` +
        `before the upload: ${g(-Infinity, -3_000)}; 3–30 min after: ${g(3 * MIN, 30 * MIN)}; ` +
        `30 min–1 day after: ${g(30 * MIN, 24 * HOUR)}; more than a day after or none: ${g(24 * HOUR, Infinity) + lone.filter((f) => f.nearestSubmitted === undefined).length}.`,
    );
  }
  if (all.some((f) => f.cv)) {
    let agree = 0;
    let disagree = 0;
    for (const f of all) {
      const m = folderMatch.get(f.id);
      if (!f.cv || !m || !m.why.includes("form submitted right after the CV upload")) continue;
      const other = f.cv.emails.filter((e) => byEmail.has(e));
      if (!other.length) continue;
      if (other.includes(m.a.email)) agree++;
      else disagree++;
    }
    console.log(
      `CVs read: ${all.filter((f) => f.cv).length} with an email or phone found. ` +
        `Check against folders known from the "submitted" message: CV email agrees ${agree}, disagrees ${disagree}.`,
    );
  }
  const firstMsg = [...tg.applications, ...tg.submitted].map((x) => x.at).sort()[0] ?? "";
  const beforeTelegram = withForm.filter((f) => f.lastAppUpload && f.lastAppUpload < firstMsg).length;
  if (beforeTelegram) console.log(`${beforeTelegram} folders have files from before the first Telegram message (${firstMsg.slice(0, 10)}).`);
  console.log(
    `\nDone. ${records.length} candidates in recovered/candidates.json:\n` +
      `  ${count("high")} matched for sure, ${count("medium")} probably right (check),\n` +
      `  ${count("from files only")} from their files only, not in Telegram (email from CV: ${records.filter((r) => report.find((x) => x.c === r)?.sure === "from files only" && r.email).length}, ` +
      `name found: ${records.filter((r) => report.find((x) => x.c === r)?.sure === "from files only" && r.fullName).length}),\n` +
      `  ${count("no files")} from Telegram only.\n` +
      `  ${count("same person (left out)")} folders were a second application of someone already in the list.\n` +
      `  ${count("not matched (left out)")} folders with no email, phone or name were left out (add --include-unnamed to keep them).\n` +
      `See recovered/rebuild-report.csv.`,
  );
}

main().catch((e) => {
  const code = e?.name || e?.Code || "";
  if (code === "InvalidAccessKeyId" || code === "SignatureDoesNotMatch" || e?.$metadata?.httpStatusCode === 403) {
    console.error("R2 refused the keys. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  } else if (code === "NoSuchBucket") {
    console.error(`There is no bucket named "${BUCKET}". Check R2_BUCKET.`);
  } else {
    console.error(`Something went wrong: ${e?.stack || e?.message || e}`);
  }
  process.exit(1);
});
