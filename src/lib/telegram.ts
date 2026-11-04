/**
 * SERVER-ONLY Telegram helpers.
 *
 * Never import this into a client component — it reads the bot token from
 * server-side environment variables (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
 *
 * Configure the two variables in `.env.local` (git-ignored):
 *   TELEGRAM_BOT_TOKEN — create a bot with @BotFather to get this token.
 *   TELEGRAM_CHAT_ID   — message your bot once, then read the id from
 *                        https://api.telegram.org/bot<TOKEN>/getUpdates
 *
 * If the variables are not set, sending quietly no-ops so the forms keep
 * working during local development and demos.
 */

const PERSONAL_FIELDS: { key: string; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "dob", label: "Date of birth" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  // No SSN. It is not on an application any more — it is asked once an offer
  // has been accepted — and a Telegram chat is the last place it should go.
  { key: "city", label: "City" },
  { key: "address", label: "Address" },
  { key: "linkedin", label: "LinkedIn" },
];

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Simple confirmation sent when an applicant submits the full form.
 *
 * `suspectedBot` means the hidden honeypot field was filled. It is only a hint
 * — browser autofill reaches hidden fields too — so the message is still sent
 * and merely carries a warning for the recruiter to weigh.
 */
export function buildSubmittedMessage(name?: string, suspectedBot?: boolean): string {
  const who = typeof name === "string" ? name.trim() : "";
  const base = who
    ? `✅ ${escapeHtml(who.slice(0, 120))} has just submitted the application form.`
    : "✅ A candidate has just submitted the application form.";
  if (!suspectedBot) return base;
  return `${base}\n\n⚠️ <b>Possible spam:</b> a hidden anti-bot field was filled. This can also happen with browser autofill, so check the application before dismissing it.`;
}

/**
 * Message sent to the recruiter when an applicant completes the interview.
 *
 * Deliberately short: who finished, and how they scored. The written answers
 * used to be included here, which made every notification long enough to need
 * scrolling and put a candidate's answers into a chat history that is easy to
 * forward. They are all in the Admin Panel, which is where they are read
 * properly and where access is controlled.
 */
export function buildInterviewResultMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  correct: number,
  total: number,
): string {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const lines = [
    "📩 <b>Interview completed</b>",
    "",
    `<b>Name:</b> ${escapeHtml(name)}`,
  ];
  if (email) lines.push(`<b>Email:</b> ${escapeHtml(email)}`);
  if (country) lines.push(`<b>Country:</b> ${escapeHtml(country)}`);
  lines.push(`<b>Score:</b> ${correct} / ${total} (${pct}%)`);
  return lines.join("\n");
}

/** Who this is about — the same three facts in both live-check messages. */
function whoLines(
  name: string,
  email: string | undefined,
  country: string | undefined,
): string[] {
  const lines = [`<b>Name:</b> ${escapeHtml(name || "Unnamed candidate")}`];
  if (email) lines.push(`<b>Email:</b> ${escapeHtml(email)}`);
  if (country) lines.push(`<b>Country:</b> ${escapeHtml(country)}`);
  return lines;
}

/**
 * Somebody has opened the page their live check was emailed to.
 *
 * The first half of a two-message story, and the two are worth keeping apart:
 * an email that was never opened may never have arrived, while a page opened
 * and abandoned is a person hesitating — and only the second is worth a word
 * from a recruiter.
 *
 * Once per emailed link, not once per visit. The record counts every open
 * because that is a real number, but somebody who looks at the page four times
 * over a weekend should not be four messages.
 */
export function buildLiveCheckOpenedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
): string {
  return [
    "👀 <b>Live ID check opened</b>",
    "",
    ...whoLines(name, email, country),
    "",
    "They have opened the page. Nothing has gone to the provider yet.",
  ].join("\n");
}

/**
 * Somebody has just been handed over to the identity provider.
 *
 * The one moment in the live check that happens on the candidate's side and
 * nowhere else: from here on the flow is the provider's, and whatever comes of
 * it appears in the provider's dashboard rather than in this system. So the
 * message names the provider — knowing somebody started is only useful if you
 * know where to go and look at the result.
 *
 * Sent once per link. A re-sent check, or a replaced provider session, clears
 * the mark — so a link genuinely being started again does say so again.
 */
export function buildLiveCheckStartedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  provider: string | null,
): string {
  return [
    "🪪 <b>Live ID check started</b>",
    "",
    ...whoLines(name, email, country),
    "",
    provider
      ? `They have gone through to ${escapeHtml(provider)}. The result will be in its dashboard.`
      : "They have gone through to the provider. The result will be in its dashboard.",
  ].join("\n");
}

/**
 * A candidate pressed Start on their final-interview chat and is waiting.
 *
 * Once per conversation: refreshing the page, or opening it on a second
 * device, finds the same chat and says nothing more.
 */
export function buildChatStartedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  adminUrl: string,
  kind: "interview" | "onboarding" | "followup" = "interview",
): string {
  return [
    kind === "onboarding"
      ? "💬 <b>Onboarding chat started</b>"
      : kind === "followup"
        ? "💬 <b>Follow-up chat started</b>"
        : "💬 <b>Final interview chat started</b>",
    "",
    ...whoLines(name, email, country),
    "",
    kind === "onboarding" ? "They are waiting for you to send their portal login." : "They are waiting for a recruiter to join.",
    // Quotes escaped too: escapeHtml is for text, and this is an attribute.
    `<a href="${escapeHtml(adminUrl).replace(/"/g, "&quot;")}">Open the Live chat</a>`,
  ].join("\n");
}

/**
 * The candidate opened a "we're live" email, or a "not started yet" reminder,
 * and the chat page loaded. Sent once per email. Whether they have pressed Start yet decides what to say next.
 */
export function buildLiveReminderOpenedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  adminUrl: string,
  state: "not_started" | "waiting" | "active",
  kind: "live" | "nudge" = "live",
): string {
  return [
    kind === "nudge"
      ? "🔔 <b>Candidate clicked your chat reminder</b>"
      : "👋 <b>Candidate clicked your “We’re live” email</b>",
    "",
    ...whoLines(name, email, country),
    "",
    state === "not_started"
      ? "They are on the chat page now. They appear in Live chat when they press Start chat."
      : state === "waiting"
        ? "They are on the chat page now, waiting for a recruiter to join."
        : "They are back on the chat page now.",
    `<a href="${escapeHtml(adminUrl).replace(/"/g, "&quot;")}">Open the Live chat</a>`,
  ].join("\n");
}

/** A candidate sent new PAN card photos after being asked to re-upload. */
export function buildPanReuploadedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  adminUrl: string,
  noCameraData: boolean,
): string {
  return [
    "🪪 <b>PAN card re-uploaded</b>",
    "",
    ...whoLines(name, email, country),
    "",
    noCameraData
      ? "New front and back received. ⚠️ At least one photo has no camera data — look closely."
      : "New front and back received.",
    `<a href="${escapeHtml(adminUrl).replace(/"/g, "&quot;")}">Open in the Admin Panel</a>`,
  ].join("\n");
}

/**
 * A candidate sent their proof of address. Says which document, and — when the
 * address they typed differs from the one on file — both, so the recruiter
 * knows to look before opening anything.
 */
export function buildAddressProofMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  adminUrl: string,
  documentType: string,
  address: { given: string; onFile: string; changed: boolean },
  again: boolean,
): string {
  return [
    again ? "🏠 <b>New proof of address received</b>" : "🏠 <b>Proof of address received</b>",
    "",
    ...whoLines(name, email, country),
    "",
    `<b>Document:</b> ${escapeHtml(documentType)}`,
    ...(address.changed
      ? [
          "⚠️ <b>They changed their address:</b>",
          `<b>Now:</b> ${escapeHtml(address.given.slice(0, 300))}`,
          `<b>On file:</b> ${escapeHtml(address.onFile.slice(0, 300) || "—")}`,
        ]
      : [`<b>Address:</b> ${escapeHtml(address.given.slice(0, 300))}`]),
    `<a href="${escapeHtml(adminUrl).replace(/"/g, "&quot;")}">Open in the Admin Panel</a>`,
  ].join("\n");
}

/** A candidate sent back their signed agreement. */
export function buildAgreementSignedMessage(
  name: string,
  email: string | undefined,
  country: string | undefined,
  adminUrl: string,
  ref: string,
  files: number,
  again: boolean,
): string {
  return [
    again ? "✍️ <b>New signed agreement received</b>" : "✍️ <b>Signed agreement received</b>",
    "",
    ...whoLines(name, email, country),
    "",
    `<b>Agreement:</b> ${escapeHtml(ref || "—")}`,
    `<b>Files:</b> ${files}`,
    "Please check it is signed and dated, then press Accept in View info.",
    `<a href="${escapeHtml(adminUrl).replace(/"/g, "&quot;")}">Open in the Admin Panel</a>`,
  ].join("\n");
}

/** Build the "Personal information" message (sent after the first step). */
export function buildPersonalMessage(fields: Record<string, unknown>): string | null {
  const lines = PERSONAL_FIELDS.flatMap(({ key, label }) => {
    const raw = fields[key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) return [];
    return [`<b>${label}:</b> ${escapeHtml(value.slice(0, 200))}`];
  });
  if (lines.length === 0) return null;
  return ["🧑‍💼 <b>New application — Personal information</b>", "", ...lines].join("\n");
}

/** Build the contact-form message. */
export function buildContactMessage(fields: Record<string, unknown>): string {
  const get = (key: string, max: number) => {
    const raw = fields[key];
    return typeof raw === "string" ? escapeHtml(raw.trim().slice(0, max)) : "";
  };
  return [
    "✉️ <b>New contact message</b>",
    "",
    `<b>Name:</b> ${get("name", 200)}`,
    `<b>Email:</b> ${get("email", 200)}`,
    `<b>Subject:</b> ${get("subject", 200)}`,
    "",
    get("message", 2000),
  ].join("\n");
}

/** However slow Telegram is being, it is not worth more than this. */
const TIMEOUT_MS = 8000;

export type TelegramSendResult =
  | { ok: true }
  | { ok: false; skipped: "not_configured" }
  | { ok: false; error: "telegram_error" | "network_error" };

/**
 * Send a message to the configured Telegram chat. Best-effort: returns a
 * result object instead of throwing, so callers can keep the form working even
 * when Telegram is unreachable or not configured.
 */
export async function sendTelegramMessage(text: string): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // Not configured — succeed silently so the form is never blocked.
  if (!token || !chatId) {
    return { ok: false, skipped: "not_configured" };
  }

  try {
    // TELEGRAM_API_BASE exists so a test can point this at a local stub and
    // read the exact message that would have been sent. Unset everywhere
    // else, which is the real API.
    const base = process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";
    const res = await fetch(`${base}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      // A notification must never be the slowest thing in a request. Without
      // this a Telegram that accepts the connection and then says nothing
      // holds the socket open indefinitely, and the callers that wait on it
      // are ones a candidate is sitting in front of.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error(`[telegram] sendMessage failed: HTTP ${res.status} ${detail}`);
      return { ok: false, error: "telegram_error" };
    }
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[telegram] could not reach api.telegram.org:", err);
    return { ok: false, error: "network_error" };
  }
}
