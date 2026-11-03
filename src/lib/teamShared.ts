/**
 * The team portal (workroute.team): definitions shared by the member pages,
 * the Admin Panel and the server.
 *
 * Pure module — no filesystem, no node built-ins — so the browser and the
 * server agree on one definition of a bank, an IBAN, a status and a payday.
 * The browser's checks are a courtesy; the server runs the same ones.
 */
import { DAY_KEYS, type DayKey } from "@/lib/availability";

/* -------------------------------------------------------------------------- */
/* Banks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The only three banks members are paid into. Each member is allowed one or
 * more of them by a recruiter, and sees only those.
 */
export const BANK_IDS = ["wise", "revolut", "n26", "vivid", "starling"] as const;
export type BankId = (typeof BANK_IDS)[number];

export const BANKS: Record<BankId, { label: string; signupUrl: string; defaultBic: string; bicHint?: string }> = {
  wise: { label: "Wise", signupUrl: "https://wise.com/register", defaultBic: "TRWIBEB1XXX" },
  revolut: { label: "Revolut", signupUrl: "https://www.revolut.com/", defaultBic: "REVOLT21XXX" },
  n26: { label: "N26", signupUrl: "https://n26.com/", defaultBic: "NTSBDEB1XXX" },
  // Vivid gives each account its own IBAN and BIC, by country: nothing to fill in for them.
  vivid: {
    label: "Vivid",
    signupUrl: "https://vivid.money/",
    defaultBic: "",
    bicHint: "Copy the BIC from your Vivid app: Account details. It depends on your account.",
  },
  starling: { label: "Starling Bank", signupUrl: "https://www.starlingbank.com/", defaultBic: "SRLGGB2LXXX" },
};

export function isBankId(v: unknown): v is BankId {
  return typeof v === "string" && (BANK_IDS as readonly string[]).includes(v);
}

/** Where N26 opens accounts: the European Economic Area. */
const N26_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland",
  "France", "Germany", "Greece", "Hungary", "Iceland", "Ireland", "Italy", "Latvia", "Liechtenstein",
  "Lithuania", "Luxembourg", "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Romania",
  "Slovakia", "Slovenia", "Spain", "Sweden",
];

/** Revolut covers the same area, plus the United Kingdom and Switzerland. */
const REVOLUT_ONLY_COUNTRIES = ["United Kingdom", "Switzerland"];

/**
 * The banks ticked when a member is added, from where they live. N26, Vivid
 * and Revolut generally need a European address, Starling a UK one; Wise opens
 * accounts in many more countries. Only a starting point — the recruiter can
 * change it.
 */
export function defaultBanksFor(country: string | undefined): BankId[] {
  const c = (country ?? "").trim();
  if (N26_COUNTRIES.includes(c)) return ["revolut", "n26", "vivid"];
  if (c === "United Kingdom") return ["revolut", "starling"];
  if (REVOLUT_ONLY_COUNTRIES.includes(c)) return ["revolut"];
  return ["wise"];
}

/* -------------------------------------------------------------------------- */
/* IBAN                                                                        */
/* -------------------------------------------------------------------------- */

/** Length of a full IBAN, by country code. */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21,
  CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MA: 28, MC: 27,
  MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** Capitals, no spaces or dashes — the form an IBAN is stored and checked in. */
export function normaliseIban(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/** "LT12 3250 0123 4567 8901", the way it is printed on a bank card. */
export function formatIban(iban: string): string {
  return normaliseIban(iban).replace(/(.{4})/g, "$1 ").trim();
}

/** "LT12 •••• 8901" — enough to recognise, not enough to use. */
export function maskIban(country: string, last4: string): string {
  return `${country} •••• ${last4}`;
}

function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder;
}

export type IbanCheck = { ok: true; iban: string } | { ok: false; problem: string };

/** Shape, length for the country and the check digits — what catches a typo. */
export function checkIban(raw: string): IbanCheck {
  const iban = normaliseIban(raw);
  if (!iban) return { ok: false, problem: "Enter your IBAN." };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return { ok: false, problem: "An IBAN starts with two letters and two numbers, e.g. LT12 3250 …" };
  }
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!expected) return { ok: false, problem: "This IBAN's country code is not recognised." };
  if (iban.length !== expected) {
    return {
      ok: false,
      problem: `An IBAN from ${iban.slice(0, 2)} has ${expected} characters; this one has ${iban.length}.`,
    };
  }
  if (mod97(iban) !== 1) {
    return { ok: false, problem: "This IBAN is not valid — please check for a mistyped character." };
  }
  return { ok: true, iban };
}

/**
 * Which of the banks an IBAN belongs to, when it can be told from the
 * IBAN alone. Each bank issues several kinds of IBAN, so "unknown" is common
 * and means nothing is wrong — it only drives a "please check" note.
 */
export function bankOfIban(iban: string): BankId | null {
  const i = normaliseIban(iban);
  const cc = i.slice(0, 2);
  if (cc === "BE" && i.slice(4, 7) === "967") return "wise";
  if (cc === "GB" && i.slice(4, 8) === "TRWI") return "wise";
  if (cc === "LT" && i.slice(4, 9) === "32500") return "revolut";
  if ((cc === "GB" || cc === "IE") && i.slice(4, 8) === "REVO") return "revolut";
  if (cc === "DE" && i.slice(4, 12) === "10011001") return "n26";
  if (cc === "GB" && i.slice(4, 8) === "SRLG") return "starling";
  return null;
}

/** The BIC that goes with a recognised IBAN, else the bank's usual one. */
export function bicFor(bank: BankId, iban: string): string {
  const i = normaliseIban(iban);
  if (bank === "wise" && i.startsWith("GB")) return "TRWIGB2LXXX";
  if (bank === "revolut" && i.startsWith("GB")) return "REVOGB21XXX";
  if (bank === "revolut" && i.startsWith("IE")) return "REVOIE23XXX";
  return BANKS[bank].defaultBic;
}

/** A warning (never a refusal) when the IBAN looks like another bank's. */
export function ibanBankWarning(bank: BankId, iban: string): string | null {
  const seen = bankOfIban(iban);
  if (!seen || seen === bank) return null;
  return `This IBAN looks like a ${BANKS[seen].label} IBAN, but you chose ${BANKS[bank].label}. Please check.`;
}

export function checkBic(raw: string): string | null {
  const bic = raw.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic) ? bic : null;
}

/* -------------------------------------------------------------------------- */
/* Members                                                                     */
/* -------------------------------------------------------------------------- */

export const MEMBER_STATUSES = ["active", "paused", "left"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  paused: "Paused",
  left: "Left",
};

export interface TeamSchedule {
  days: DayKey[];
  /** "HH:MM", in timeZone. */
  startTime: string;
  endTime: string;
  timeZone: string;
}

export const MAX_HOURS_PER_DAY = 12;

/* -------------------------------------------------------------------------- */
/* Tickets                                                                     */
/* -------------------------------------------------------------------------- */

export const TICKET_STATUSES = ["open", "in_progress", "done"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const MAX_TICKET_SUBJECT = 140;
export const MAX_TICKET_BODY = 5000;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/* -------------------------------------------------------------------------- */
/* Hours & pay                                                                 */
/* -------------------------------------------------------------------------- */

export const WORK_STATUSES = ["worked", "extra", "absent", "dayoff", "no_checkin"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  worked: "Worked",
  extra: "Extra hours",
  absent: "Absent",
  dayoff: "Day off",
  no_checkin: "No check-in",
};

/** Whether a day of this kind is paid. */
export function isPaidStatus(s: WorkStatus): boolean {
  return s === "worked" || s === "extra";
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatUsd(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatHours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, "")} h`;
}

export type PaydaySchedule =
  | { kind: "weekly"; weekday: number }
  | { kind: "biweekly"; anchor: string }
  | { kind: "monthly"; day: number };

export const DEFAULT_PAYDAY: PaydaySchedule = { kind: "monthly", day: 5 };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describePayday(p: PaydaySchedule): string {
  if (p.kind === "weekly") return `Every ${WEEKDAY_NAMES[p.weekday]}`;
  if (p.kind === "biweekly") return `Every other ${WEEKDAY_NAMES[new Date(`${p.anchor}T00:00:00Z`).getUTCDay()]}`;
  return `The ${ordinal(p.day)} of every month`;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "YYYY-MM-DD" ± days, in plain calendar terms. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayKeyOf(date: string): DayKey {
  // getUTCDay: 0 = Sunday. DAY_KEYS starts on Monday.
  return DAY_KEYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
}

/** The next payday on or after `today` ("YYYY-MM-DD"). */
export function nextPayday(p: PaydaySchedule, today: string): string {
  if (p.kind === "weekly") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, (p.weekday - dow + 7) % 7);
  }
  if (p.kind === "biweekly") {
    const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${p.anchor}T00:00:00Z`)) / 86_400_000);
    const step = ((diff % 14) + 14) % 14;
    return addDays(today, step === 0 ? 0 : 14 - step);
  }
  const [y, m, d] = today.split("-").map(Number);
  if (d <= p.day) return `${y}-${String(m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "Fri 14 Nov 2026". */
/**
 * The label on a member: their status, except an active member whose account
 * is not activated yet, which says what it is waiting for.
 */
export function memberStateOf(m: { status: MemberStatus; activatedAt?: string; bankPending?: unknown }): {
  key: "waiting_bank" | "bank_to_approve" | MemberStatus;
  label: string;
  className: string;
} {
  if (m.status === "active" && !m.activatedAt) {
    return m.bankPending
      ? { key: "bank_to_approve", label: "Bank details to approve", className: "bg-amber-100 text-amber-900" }
      : { key: "waiting_bank", label: "Waiting for bank details", className: "bg-amber-100 text-amber-900" };
  }
  const className =
    m.status === "active" ? "bg-green-100 text-green-800" : m.status === "paused" ? "bg-amber-100 text-amber-900" : "bg-navy-100 text-navy-600";
  return { key: m.status, label: MEMBER_STATUS_LABEL[m.status], className };
}

/**
 * The safety note at the top of the member's Bank page, until a recruiter
 * writes their own in Team settings. **Words between double stars** are bold.
 */
export const DEFAULT_BANK_NOTICE =
  "We only need your account holder name, IBAN and BIC. **WorkRoute will never ask for your card number, PIN, CVV, online-banking password or any code from your bank** — not here, by email or by phone.";

export const MAX_BANK_NOTICE = 1000;

/**
 * Fields a recruiter can put in the Bank page note, filled in for each member.
 * An unknown {word} is left as typed, so a mistake shows instead of vanishing.
 */
export const NOTICE_FIELDS = [
  { key: "name", label: "Full name", sample: "Aisha Benali" },
  { key: "firstName", label: "First name", sample: "Aisha" },
  { key: "email", label: "Professional email", sample: "aisha.benali@workroute.team" },
  { key: "phone", label: "WorkRoute phone number", sample: "+44 7700 900123" },
  { key: "personalEmail", label: "Personal email", sample: "aisha@example.com" },
  { key: "startDate", label: "First work day", sample: "Monday, 9 November 2026" },
] as const;

export type NoticeValues = Partial<Record<(typeof NOTICE_FIELDS)[number]["key"], string>>;

export function fillNotice(text: string, values: NoticeValues): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? (values as Record<string, string | undefined>)[key] || "—" : whole,
  );
}

/** A notice split into plain and **bold** parts, for rendering as text — never HTML. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/\*\*/)
    .map((t, i) => ({ text: t, bold: i % 2 === 1 }))
    .filter((p) => p.text);
}

/** "Monday, 9 November 2026" — a start date, written out in full. */
export function formatLongDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The first day hours are counted for: the first work day, or the day the
 * account was activated if that is later. Undefined until it is activated.
 */
export function hoursCountedFrom(m: { firstWorkDay: string; activatedOn?: string }): string | undefined {
  if (!m.activatedOn) return undefined;
  return m.activatedOn > m.firstWorkDay ? m.activatedOn : m.firstWorkDay;
}

export function formatDay(date: string, withYear = true): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function formatDateTime(iso: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return iso;
  }
}

/** A mail list's date: "13:56" today, "28 Oct" this year, "28 Oct 2025" before. */
export function formatMailDate(iso: string, timeZone?: string, now = new Date()): string {
  try {
    const tz = timeZone ? { timeZone } : {};
    const d = new Date(iso);
    const day = (x: Date) => x.toLocaleDateString("en-CA", tz);
    if (day(d) === day(now)) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...tz });
    const sameYear = day(d).slice(0, 4) === day(now).slice(0, 4);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), ...tz });
  } catch {
    return iso;
  }
}

/** "820 KB", "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** "October 2026" for "2026-10". */
export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* -------------------------------------------------------------------------- */
/* Phone messages                                                              */
/* -------------------------------------------------------------------------- */

export const MAX_PHONE_MESSAGE = 1600;

/**
 * The verification code in a message, if it carries one, for the "Copy code"
 * button. A run of 4–8 digits (optionally split by a space or dash, as "482
 * 913" or "G-482913"), and not a year or a phone number.
 */
export function findCode(text: string): string | null {
  const m = text.match(/(?:^|[^\d+])(\d{3}[ -]\d{3}|\d{4,8})(?!\d)/);
  if (!m) return null;
  const code = m[1].replace(/[ -]/g, "");
  if (/^(19|20)\d{2}$/.test(code) && code.length === 4) return null;
  return code;
}

/* -------------------------------------------------------------------------- */
/* Getting started                                                             */
/* -------------------------------------------------------------------------- */

// Bank first: the account is not activated until bank details are approved.
export const ONBOARDING_STEPS = ["bank", "profile", "mailbox", "rules"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export const ONBOARDING_LABEL: Record<OnboardingStep, string> = {
  profile: "Check your profile",
  mailbox: "Open your Mail tab",
  bank: "Add your bank account",
  rules: "Read the team rules",
};

/* -------------------------------------------------------------------------- */
/* Mail                                                                        */
/* -------------------------------------------------------------------------- */

/** Letters that do not lose their accent by decomposition alone. */
const SPECIAL_LETTERS: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };

function addressPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/**
 * "firstname.lastname" for a professional address: José Pérez → jose.perez,
 * Mary-Jane Van Dyke → mary-jane.van-dyke. Null when the name has no Latin
 * letters to make one from — the address is then typed by hand.
 */
export function emailLocalPart(firstName: string, lastName: string): string | null {
  const parts = [addressPart(firstName), addressPart(lastName)].filter(Boolean);
  return parts.length ? parts.join(".") : null;
}

/** The first of local@domain, local2@domain, local3@domain… not already taken. */
export function uniqueAddress(local: string, domain: string, taken: string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  for (let n = 1; n < 1000; n++) {
    const candidate = `${local}${n === 1 ? "" : n}@${domain}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${local}.${Date.now()}@${domain}`;
}

/** Shortest portal password a member may choose (shared with the forms). */
export const PASSWORD_MIN = 10;

export const MAX_MAIL_RECIPIENTS = 10;
export const MAX_MAIL_BODY = 50_000;
export const MAX_MAIL_ATTACHMENTS_BYTES = 10 * 1024 * 1024;
export const MAIL_DAILY_LIMIT = 100;
