/**
 * The final-interview live chat — the shared model.
 *
 * Pure: no filesystem, no node built-ins. The candidate's chat page, the Admin
 * Panel and the API routes all agree on what a conversation is from here.
 *
 * A chat exists only for somebody who was sent a link. Opening the link does
 * nothing on its own — mail scanners open links — so a conversation begins
 * when the candidate presses Start, waits until a recruiter joins, and closes
 * for good when the recruiter ends it. A new link means a new conversation.
 */

/** How long an emailed chat link opens a chat. */
export const CHAT_LINK_TTL_DAYS = 7;

/** Longest single message, either side. Long enough for a real answer. */
export const MAX_MESSAGE = 2000;
/** Hard ceiling per conversation, so one chat cannot grow the file forever. */
export const MAX_MESSAGES = 600;
/** How the recruiter appears to the candidate. */
export const RECRUITER_NAME = "WorkRoute Recruitment";
/** After this long waiting, the candidate is told the team is busy. */
export const BUSY_AFTER_MINUTES = 10;

export type ChatSender = "candidate" | "recruiter" | "system";

/**
 * What a conversation is for.
 *
 *   interview   the final interview, before the offer (the first kind)
 *   onboarding  after the signed agreement is accepted: the recruiter sends
 *               the team-portal login and walks the new member through it
 *   followup    after the interview chat has ended: more questions, with the
 *               reason written into the invitation and onto the chat page
 *
 * Kept on the candidate per link sent, and copied onto the conversation when
 * it starts, so an old conversation never changes kind.
 */
export type ChatKind = "interview" | "onboarding" | "followup";

export const CHAT_KINDS: ChatKind[] = ["interview", "onboarding", "followup"];

export function chatKindOf(s: { kind?: ChatKind }): ChatKind {
  return s.kind === "onboarding" || s.kind === "followup" ? s.kind : "interview";
}

/** "final interview chat", "onboarding chat", "follow-up chat" — for sentences. */
export const CHAT_NOUN: Record<ChatKind, string> = {
  interview: "final interview chat",
  onboarding: "onboarding chat",
  followup: "follow-up chat",
};

/* -- Follow-up: where it stands, for the tables ---------------------------- */

export type FollowupState = "sent" | "started" | "done";
export type FollowupFilter = "all" | FollowupState | "none";

export const FOLLOWUP_STATE_LABEL: Record<FollowupState, string> = {
  sent: "Follow-up sent",
  started: "Follow-up started",
  done: "Follow-up done",
};

export const FOLLOWUP_FILTERS: { value: FollowupFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent – not started" },
  { value: "started", label: "Started" },
  { value: "done", label: "Done" },
  { value: "none", label: "Not sent" },
];

/** The latest follow-up link, and the conversation it opened if any. */
export function followupStateOf(
  c: { id: string; followupChatLinks?: string[] },
  sessions: { candidateId: string; linkSentAt: string; status: ChatStatus }[],
): FollowupState | undefined {
  const last = c.followupChatLinks?.at(-1);
  if (!last) return undefined;
  const s = sessions.find((x) => x.candidateId === c.id && x.linkSentAt === last);
  return !s ? "sent" : s.status === "ended" ? "done" : "started";
}

export function matchesFollowupFilter(f: FollowupFilter, state: FollowupState | undefined): boolean {
  if (f === "all") return true;
  if (f === "none") return !state;
  return state === f;
}

/* -- Follow-up: why we ask ------------------------------------------------- */

export const MAX_FOLLOWUP_REASON = 400;

/** The usual reasons, one click each; "custom" is written by the recruiter. */
export const FOLLOWUP_REASONS: { value: string; label: string; message: string }[] = [
  { value: "experience", label: "More about their experience", message: "We need a few more details about your experience." },
  { value: "documents", label: "Questions about documents", message: "We have a few questions about the documents you sent us." },
  { value: "availability", label: "Confirm availability", message: "We need to confirm your availability and working hours." },
  { value: "details", label: "Check personal details", message: "We need to check some of the details you gave us." },
  { value: "custom", label: "Write my own", message: "" },
];

/** The sentence the candidate reads, from a preset or the recruiter's own words. */
export function followupReasonMessage(reason: string, custom: string): string {
  const preset = FOLLOWUP_REASONS.find((r) => r.value === reason);
  if (preset && preset.value !== "custom") return preset.message;
  return cleanMessage(custom).replace(/\s+/g, " ").slice(0, MAX_FOLLOWUP_REASON);
}

export interface ChatMessage {
  id: string;
  from: ChatSender;
  text: string;
  at: string;
  /** Set by the browser that sent it, so a retried send is stored once. */
  clientId?: string;
}

export interface ChatSession {
  id: string;
  candidateId: string;
  /** Absent on interview chats, which came first. */
  kind?: ChatKind;
  /** Follow-up chats: why we asked, as the candidate was told. */
  reason?: string;
  /** Which emailed link this conversation belongs to. */
  linkSentAt: string;
  /** Snapshots for the inbox, so the list does not need the candidate file. */
  candidateName: string;
  candidateEmail?: string;
  candidateCountry?: string;
  candidatePosition?: string;
  startedAt: string;
  joinedAt?: string;
  joinedBy?: string;
  endedAt?: string;
  endedBy?: string;
  /** Why it closed, when not by a recruiter's End chat. */
  endedReason?: "replaced" | "ended";
  messages: ChatMessage[];
  /** How many messages the recruiter has seen, for the unread count. */
  recruiterRead: number;
  /** Telegram told once, per conversation. */
  notifiedAt?: string;
  lastMessageAt?: string;
}

export type ChatStatus = "waiting" | "active" | "ended";

export function chatStatus(s: Pick<ChatSession, "joinedAt" | "endedAt">): ChatStatus {
  if (s.endedAt) return "ended";
  if (s.joinedAt) return "active";
  return "waiting";
}

/** Candidate messages the recruiter has not looked at yet. */
export function unreadCount(s: Pick<ChatSession, "messages" | "recruiterRead">): number {
  return s.messages.slice(s.recruiterRead).filter((m) => m.from === "candidate").length;
}

/**
 * Tidy what somebody typed: trim, and drop control characters — including the
 * invisible direction overrides, which can make text read differently from
 * what it is (a link that looks like one address and is another).
 */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Conversation ids are base62; checked before one is used in a file path. */
export function isSessionId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{6,40}$/.test(v);
}

export function isValidClientId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(v);
}

/* ------------------------------------------------------------------------ */
/* "We're live now" emails                                                   */
/* ------------------------------------------------------------------------ */

/**
 * A "our team is live now — join the chat" email, sent by hand when the
 * recruiter is there and the candidate is not. Kept on the candidate, since it
 * can go out before any conversation exists.
 *
 * Its link is the candidate's chat link plus this id. The page reports the id
 * once it has loaded in a real browser, which is when the recruiter is told —
 * never on the fetch itself, which a mail scanner makes too.
 */
export interface LiveReminder {
  id: string;
  /**
   * "live" — our team is online now, come now (absent on the first ones sent).
   * "nudge" — a reminder for somebody who has not started the chat yet.
   */
  kind?: ReminderKind;
  sentAt: string;
  by?: string;
  /** The chat link it pointed at. */
  linkSentAt: string;
  /** When the candidate first opened it. Telegram is told once, at this moment. */
  openedAt?: string;
}

export type ReminderKind = "live" | "nudge";

export function reminderKind(r: Pick<LiveReminder, "kind">): ReminderKind {
  return r.kind ?? "live";
}

/** Below this, a second send of the same kind is refused as a double click. */
export const REMINDER_MIN_GAP_MS = 60_000;
/** Below this, the confirm step warns that a "we're live" email has just gone out. */
export const REMINDER_WARN_MINUTES = 30;
/** Below this, it warns that a "not started yet" reminder has just gone out. */
export const NUDGE_WARN_HOURS = 24;

export function isReminderId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9]{8,32}$/.test(v);
}

/* ------------------------------------------------------------------------ */
/* Links                                                                     */
/* ------------------------------------------------------------------------ */

export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/**
 * Split a message into text and links, for rendering as React nodes.
 *
 * Never HTML: the message is data, and building markup from it is how a chat
 * becomes an injection point. Only http(s) links are made clickable, and
 * trailing punctuation stays outside the link — "see www.x.com." should not
 * send somebody to "www.x.com.".
 */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let raw = match[1];
    const start = match.index ?? 0;
    // Trailing punctuation belongs to the sentence, not the address — except a
    // closing bracket the address itself opened, as in a Wikipedia link.
    while (raw && /[.,!?;:)\]}'"]$/.test(raw)) {
      const last = raw[raw.length - 1];
      if (last === ")" && (raw.match(/\(/g)?.length ?? 0) >= (raw.match(/\)/g)?.length ?? 0)) break;
      raw = raw.slice(0, -1);
    }
    if (!raw) continue;
    const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
    try {
      const u = new URL(href);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "link", text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

export interface ChatSettings {
  /** Saved questions, clicked into the message box in the Live chat tab. */
  questions: string[];
  /** Ready-made portal explanations, for onboarding chats. */
  onboarding: OnboardingMessage[];
  /** Saved questions for follow-up chats. */
  followupQuestions: string[];
  /** Shown to candidates on the chat page. */
  hours: string;
  updatedAt?: string;
}

/** One ready-made onboarding message: a short name for the button, and the text sent. */
export interface OnboardingMessage {
  title: string;
  text: string;
}

export const MAX_QUESTIONS = 40;
export const MAX_QUESTION = 500;
export const MAX_HOURS_TEXT = 160;
export const MAX_ONBOARDING = 30;
export const MAX_ONBOARDING_TITLE = 60;
export const MAX_ONBOARDING_TEXT = 1500;

export const DEFAULT_HOURS = "We reply every day, 9:00–01:00 UK time";

/**
 * Hours lines that were once the default. A settings file saved with one of
 * these still holding was never really chosen, so it follows the new default.
 */
export const OLD_DEFAULT_HOURS = ["We reply Monday–Friday, 9:00–01:00 UK time"];

/** A starting set for a remote customer-support final interview. Editable in Settings. */
export const DEFAULT_QUESTIONS: string[] = [
  "Hi, thank you for joining. Before we start, could you confirm your full name and the country you are living in right now?",
  "Tell me briefly about yourself and your most recent work experience.",
  "Why are you interested in this remote customer support role with WorkRoute?",
  "Have you worked remotely before? How do you organise your day and stay focused when working from home?",
  "Describe your home work setup: your computer, internet connection, and a quiet place to work.",
  "Which days and hours are you available to work each week?",
  "A customer writes in upset because their order is late. How would you reply to them? Please write your answer as if you were talking to the customer.",
  "Tell me about a time you handled a difficult customer or situation. What did you do, and what was the result?",
  "How comfortable are you writing in English? Which other languages can you speak or write?",
  "Which tools or software have you used before (for example email, chat, ticketing systems, Google Workspace, Microsoft Office)?",
  "When would you be able to start if we offer you the position?",
  "Do you have any questions for us about the role, the pay or how we work?",
  "Thank you for your time today. We will review the interview and get back to you by email. Have a good day!",
];

/**
 * The portal explained, one part at a time. {portal} becomes the portal's
 * address, {email} their professional email, {name} their first name and
 * {start} their first work day when the message is put in the box — so the
 * recruiter sees exactly what is sent.
 */
export const DEFAULT_ONBOARDING: OnboardingMessage[] = [
  {
    title: "Welcome",
    text: "Hi {name}, welcome to WorkRoute! Thank you for signing your agreement. In this chat I will send you your login for our team portal and show you how it works. It takes about 10 minutes. Please ask me anything at any time.",
  },
  {
    title: "Your login",
    text: "I have just emailed your login details to your personal email. Please open that email now. It has your professional email ({email}) and a temporary password. Never share your password with anyone — not even with us. We will never ask you for it in this chat.",
  },
  {
    title: "First sign-in",
    text: "1. Open {portal}\n2. Sign in with your professional email ({email}) and the temporary password from the email.\n3. The portal asks you to choose your own password (at least 10 characters). Choose one only you know.\nThe temporary password works for 7 days. Tell me when you are in.",
  },
  {
    title: "Start date",
    text: "Your work starts on {start}. Before that, please add your bank details: your account is activated once we approve them, and we can only count your hours and pay you from then.",
  },
  {
    title: "Dashboard",
    text: "The Dashboard is the first page you see. It shows your hours and earnings, which are added automatically after each work day, the next payday, and a short \"Get started\" list. Please complete every step in that list.",
  },
  {
    title: "Mail",
    text: "The Mail tab is your professional mailbox, {email}. Use it for all work emails. You can read, reply, forward and write new emails there. Please check it every work day.",
  },
  {
    title: "Tickets",
    text: "Tickets is how you talk to us once you are working. We send you tasks and messages there, and you can open a New ticket for any question or problem. You get a reply in the same ticket.",
  },
  {
    title: "Phone",
    text: "The Phone tab shows your WorkRoute work phone number and the messages it receives. Use this number for work only.",
  },
  {
    title: "Bank details",
    text: "Adding your bank details is required to activate your account. Open the Bank tab and add the account holder name, IBAN and BIC. That is all we need — never send bank details, card numbers or passwords in a chat or by email. We check the account and email you when it is approved: your account is active from then, and your hours are counted from then (or from {start}, if later).",
  },
  {
    title: "Profile",
    text: "Profile shows your details and your work schedule. You can change your password there at any time. If something is wrong, open a ticket and we will correct it. Please also read the Team rules (linked from your Dashboard).",
  },
  {
    title: "Documents",
    text: "Documents has your offer, your monthly statements and the files we share with you. You can download them at any time.",
  },
  {
    title: "Forgot password",
    text: "If you ever forget your password, email us from your personal email and we will send you a new temporary password. Nobody from WorkRoute will ever ask you for your password.",
  },
  {
    title: "Wrap up",
    text: "That is everything! You are all set up. If you have any question later, open a ticket in the portal or reply to our email. Welcome to the team, {name}!",
  },
];

/** {portal}, {email} and {name} in a ready-made message, filled in. */
export function fillOnboarding(text: string, values: { portal?: string; email?: string; name?: string; start?: string }): string {
  return text
    .replace(/\{start\}/g, values.start || "your first work day")
    .replace(/\{portal\}/g, values.portal || "the team portal")
    .replace(/\{email\}/g, values.email || "your professional email")
    .replace(/\{name\}/g, values.name || "there");
}

export function cleanOnboarding(raw: unknown): OnboardingMessage[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "onboarding must be a list" };
  const out: OnboardingMessage[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as { title?: unknown; text?: unknown };
    const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim() : "";
    const text = cleanMessage(r.text);
    if (!title && !text) continue;
    if (!title || !text) return { error: "Each portal message needs a name and a text." };
    if (title.length > MAX_ONBOARDING_TITLE) return { error: `Each name can be at most ${MAX_ONBOARDING_TITLE} characters.` };
    if (text.length > MAX_ONBOARDING_TEXT) return { error: `Each portal message can be at most ${MAX_ONBOARDING_TEXT} characters.` };
    out.push({ title, text });
  }
  if (out.length > MAX_ONBOARDING) return { error: `At most ${MAX_ONBOARDING} portal messages.` };
  return out;
}

/** A starting set for a follow-up chat. Editable in Settings → Live chat. */
export const DEFAULT_FOLLOWUP_QUESTIONS: string[] = [
  "Hi, thank you for joining again. We just need a little more information — it will only take a few minutes.",
  "Could you tell us a bit more about your most recent job: the company, your role and how long you worked there?",
  "Can you confirm the days and hours you are available to work each week?",
  "Can you confirm your full address as it appears on your documents?",
  "Is there anything that has changed since your interview (contact details, availability, location)?",
  "Thank you, that is everything we needed. We will be in touch by email.",
];

function cleanQuestionList(raw: unknown, label: string): string[] | { error: string } {
  if (!Array.isArray(raw)) return { error: `${label} must be a list` };
  const list = raw.map((q) => cleanMessage(q)).filter((q) => q.length > 0);
  if (list.length > MAX_QUESTIONS) return { error: `At most ${MAX_QUESTIONS} ${label}.` };
  if (list.some((q) => q.length > MAX_QUESTION)) return { error: `Each question can be at most ${MAX_QUESTION} characters.` };
  return list;
}

export function cleanSettings(raw: unknown): ChatSettings | { error: string } {
  const r = (raw ?? {}) as { questions?: unknown; hours?: unknown; onboarding?: unknown; followupQuestions?: unknown };
  if (!Array.isArray(r.questions)) return { error: "questions must be a list" };
  const questions = r.questions
    .map((q) => cleanMessage(q))
    .filter((q) => q.length > 0);
  if (questions.length > MAX_QUESTIONS) return { error: `At most ${MAX_QUESTIONS} questions.` };
  if (questions.some((q) => q.length > MAX_QUESTION)) {
    return { error: `Each question can be at most ${MAX_QUESTION} characters.` };
  }
  const hours = typeof r.hours === "string" ? r.hours.replace(/\s+/g, " ").trim() : "";
  if (hours.length > MAX_HOURS_TEXT) return { error: `The hours line can be at most ${MAX_HOURS_TEXT} characters.` };
  const onboarding = r.onboarding === undefined ? DEFAULT_ONBOARDING : cleanOnboarding(r.onboarding);
  if ("error" in onboarding) return onboarding;
  const followupQuestions =
    r.followupQuestions === undefined ? DEFAULT_FOLLOWUP_QUESTIONS : cleanQuestionList(r.followupQuestions, "follow-up questions");
  if ("error" in followupQuestions) return followupQuestions;
  return { questions, onboarding, followupQuestions, hours };
}

/* ------------------------------------------------------------------------ */
/* What the candidate's page is sent                                         */
/* ------------------------------------------------------------------------ */

export type PublicMessage = Pick<ChatMessage, "id" | "from" | "text" | "at" | "clientId">;

export interface CandidateChatState {
  /**
   * The client asked for messages from further on than exist, which only
   * happens when the conversation on the server is not the one it has — so
   * this carries the whole conversation, to replace what is on screen.
   */
  reset?: boolean;
  status: "not_started" | ChatStatus;
  /** Only messages at or after `from`, so a poll carries only what is new. */
  messages: PublicMessage[];
  /** Total messages, so the page knows what to ask for next. */
  total: number;
  startedAt?: string;
  endedReason?: "replaced" | "ended";
  recruiterTyping: boolean;
}

/* ------------------------------------------------------------------------ */
/* The inbox                                                                 */
/* ------------------------------------------------------------------------ */

/** One row of the Live chat list — what the list needs and nothing more. */
export interface ChatSummary {
  id: string;
  candidateId: string;
  kind: ChatKind;
  candidateName: string;
  candidateEmail?: string;
  candidateCountry?: string;
  candidatePosition?: string;
  status: ChatStatus;
  startedAt: string;
  joinedAt?: string;
  endedAt?: string;
  endedReason?: "replaced" | "ended";
  lastMessageAt?: string;
  preview?: { from: ChatSender; text: string };
  unread: number;
  candidateOnline: boolean;
  candidateTyping: boolean;
  /** The candidate's status now — for the "Full verified" label. */
  candidateStatus?: string;
}

/** One conversation as the recruiter's Live chat tab is sent it. */
export interface AdminSessionView {
  reset?: boolean;
  id: string;
  candidateId: string;
  kind: ChatKind;
  candidateName: string;
  candidateEmail?: string;
  candidateCountry?: string;
  candidatePosition?: string;
  status: "waiting" | "active" | "ended";
  startedAt: string;
  joinedAt?: string;
  endedAt?: string;
  endedReason?: "replaced" | "ended";
  messages: ChatMessage[];
  total: number;
  recruiterRead: number;
  candidateOnline: boolean;
  candidateSeenAt?: string;
  candidateTyping: boolean;
  candidateStatus?: string;
  /** "We're live" emails sent for this chat's link, oldest first. */
  reminders?: LiveReminder[];
  /** Onboarding chats: where they are with the team portal. */
  portal?: PortalState;
  /** Follow-up chats: why we asked. */
  reason?: string;
}

/**
 * An onboarding chat's view of the team portal: are they on the team yet, and
 * have they had and used their login.
 */
export interface PortalState {
  /** The portal's address, for {portal} in the ready-made messages. */
  portalUrl: string;
  /** Not on the team yet: the team panel's Add to team form, filled in for them. */
  addUrl: string;
  member?: {
    id: string;
    url: string;
    workEmail?: string;
    firstName: string;
    /** When login details were last emailed. */
    invitedAt?: string;
    /** They signed in and chose their own password. */
    passwordSet: boolean;
    /** "Monday, 9 November 2026" — their first work day. */
    startDate: string;
    /** Bank details: none yet, waiting for approval, approved, or refused. */
    bank: "none" | "pending" | "approved" | "refused";
    /** The account is activated (hours are counted). */
    activated: boolean;
    lastSignInAt?: string;
    active: boolean;
  };
}

/**
 * Does this conversation need the recruiter? Somebody waiting, or somebody
 * who has written and not been read. The sidebar badge counts these — people,
 * not messages, so one person waiting with one message is one, not two.
 */
export function needsAttention(s: Pick<ChatSummary, "status" | "unread">): boolean {
  return s.status === "waiting" || (s.status === "active" && s.unread > 0);
}

/** A stored conversation, checked field by field before it is trusted. */
export function isChatSession(v: unknown): v is ChatSession {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<ChatSession>;
  return (
    isSessionId(s.id) &&
    typeof s.candidateId === "string" &&
    typeof s.linkSentAt === "string" &&
    typeof s.startedAt === "string" &&
    Array.isArray(s.messages)
  );
}
