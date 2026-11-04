/**
 * SERVER-ONLY persistence for the final-interview live chat.
 *
 * One small file per conversation, in data/chats/, and the settings in
 * data/chat-settings.json. Not one file for everything: every message is a
 * write, and rewriting a file that holds every conversation ever held — and
 * grows by every one of them — would mean each new message costs more than the
 * last, with the whole server waiting while it is serialised. A conversation
 * file stays small however long the site runs.
 *
 * Reads go through an index kept in memory: the list of conversations, with
 * what the inbox shows for each. It is rebuilt only for files that changed,
 * and noticed changing by the directory's timestamp, so a poll every couple of
 * seconds costs one stat rather than a read of every file. A conversation
 * itself is always read from disk when asked for, so nothing served is stale.
 *
 * A file that exists but will not parse is damage, not emptiness. It is never
 * written over — the write fails loudly instead — and it is left out of the
 * list with an error in the log, rather than taking the list down with it.
 *
 * Writes are serialised through one chain, so two messages arriving together
 * are both kept. Presence and typing live in memory only: they change every
 * few seconds, mean nothing after a restart, and a file write per poll would
 * be absurd. All of it is kept on globalThis so every route in this process
 * sees the same state. One process only, like the rest of the store.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "@/lib/atomicWrite";
import { newId } from "@/lib/id";
import {
  DEFAULT_FOLLOWUP_QUESTIONS,
  DEFAULT_HOURS,
  DEFAULT_ONBOARDING,
  DEFAULT_QUESTIONS,
  MAX_MESSAGES,
  OLD_DEFAULT_HOURS,
  chatKindOf,
  chatStatus,
  isChatSession,
  isSessionId,
  unreadCount,
  type ChatKind,
  type ChatMessage,
  type ChatSender,
  type ChatSession,
  type ChatSettings,
  type ChatStatus,
} from "@/lib/chat";

/* ------------------------------------------------------------------------ */
/* Where things live                                                         */
/* ------------------------------------------------------------------------ */

const root = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
const sessionsDir = () => path.join(root(), "chats");
const sessionFile = (id: string) => path.join(sessionsDir(), `${id}.json`);
const settingsFile = () => path.join(root(), "chat-settings.json");
/** Where the first version kept everything. Moved into the layout above once. */
const legacyFile = () => path.join(root(), "chats.json");

/** Only real conversation files — never the dot-prefixed temp files of an atomic write. */
const SESSION_FILE_RE = /^([A-Za-z0-9]{6,40})\.json$/;

/* ------------------------------------------------------------------------ */
/* Process-wide state                                                        */
/* ------------------------------------------------------------------------ */

/** What the inbox and the lookups need from a conversation, without its messages. */
export interface SessionIndex {
  id: string;
  candidateId: string;
  kind: ChatKind;
  linkSentAt: string;
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
  total: number;
  unread: number;
  preview?: { from: ChatSender; text: string };
}

interface IndexEntry {
  mtimeMs: number;
  size: number;
  index: SessionIndex;
}

interface Presence {
  candidateSeenAt?: number;
  candidateTypingUntil?: number;
  recruiterTypingUntil?: number;
}

interface ChatGlobal {
  chain: Promise<unknown>;
  ready?: Promise<void>;
  /** null until first built, and after anything that makes it untrustworthy. */
  cache: { dirMtimeMs: number; entries: Map<string, IndexEntry> } | null;
  presence: Map<string, Presence>;
  lastSweep: number;
}

const G = globalThis as unknown as { __wrChat?: ChatGlobal };
function state(): ChatGlobal {
  if (!G.__wrChat) {
    G.__wrChat = { chain: Promise.resolve(), cache: null, presence: new Map(), lastSweep: 0 };
  }
  return G.__wrChat;
}

/** Run `fn` with every other writer waiting. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const st = state();
  const run = st.chain.then(fn);
  st.chain = run.catch(() => {});
  return run;
}

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

/* ------------------------------------------------------------------------ */
/* One conversation on disk                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Read one conversation. Null when there is no such file; throws when there is
 * one that cannot be trusted, so a caller about to write never mistakes damage
 * for absence.
 */
async function readSessionFile(id: string): Promise<ChatSession | null> {
  if (!isSessionId(id)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(sessionFile(id), "utf8");
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isChatSession(parsed)) throw new Error(`chats/${id}.json is not a conversation`);
  if (typeof parsed.recruiterRead !== "number") parsed.recruiterRead = 0;
  return parsed;
}

function indexOf(s: ChatSession): SessionIndex {
  const last = [...s.messages].reverse().find((m) => m.from !== "system");
  const status = chatStatus(s);
  return {
    id: s.id,
    candidateId: s.candidateId,
    kind: chatKindOf(s),
    linkSentAt: s.linkSentAt,
    candidateName: s.candidateName,
    candidateEmail: s.candidateEmail,
    candidateCountry: s.candidateCountry,
    candidatePosition: s.candidatePosition,
    status,
    startedAt: s.startedAt,
    joinedAt: s.joinedAt,
    endedAt: s.endedAt,
    endedReason: s.endedReason,
    lastMessageAt: s.lastMessageAt,
    total: s.messages.length,
    unread: status === "ended" ? 0 : unreadCount(s),
    preview: last ? { from: last.from, text: last.text.slice(0, 90) } : undefined,
  };
}

async function dirMtime(): Promise<number> {
  try {
    return (await fs.stat(sessionsDir())).mtimeMs;
  } catch (err) {
    if (isMissing(err)) return -1;
    throw err;
  }
}

/**
 * Write one conversation, and keep the index in step with it — cheaply when
 * the index was already current, by throwing it away when it was not.
 * Always called inside the chain.
 */
async function writeSessionFile(s: ChatSession): Promise<void> {
  const st = state();
  const before = await dirMtime();
  await fs.mkdir(sessionsDir(), { recursive: true });
  await writeFileAtomic(sessionFile(s.id), JSON.stringify(s));
  const cache = st.cache;
  if (cache && cache.dirMtimeMs === before) {
    const [fileStat, after] = await Promise.all([fs.stat(sessionFile(s.id)), dirMtime()]);
    cache.entries.set(s.id, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, index: indexOf(s) });
    cache.dirMtimeMs = after;
  } else {
    st.cache = null;
  }
}

async function removeSessionFile(id: string): Promise<void> {
  const st = state();
  const before = await dirMtime();
  await fs.rm(sessionFile(id), { force: true });
  const cache = st.cache;
  if (cache && cache.dirMtimeMs === before) {
    cache.entries.delete(id);
    cache.dirMtimeMs = await dirMtime();
  } else {
    st.cache = null;
  }
  state().presence.delete(id);
}

/* ------------------------------------------------------------------------ */
/* Moving the first version's single file into this layout                  */
/* ------------------------------------------------------------------------ */

/**
 * The first version kept every conversation and the settings in chats.json.
 * Moved once, on first use: each conversation to its own file (never over one
 * already there), the settings to theirs (likewise), and the old file renamed
 * rather than deleted, so nothing is lost if anything here is wrong.
 */
function ready(): Promise<void> {
  const st = state();
  if (!st.ready) {
    st.ready = serial(async () => {
      let raw: string;
      try {
        raw = await fs.readFile(legacyFile(), "utf8");
      } catch (err) {
        if (isMissing(err)) return;
        throw err;
      }
      let data: { sessions?: unknown; settings?: unknown };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        // eslint-disable-next-line no-console
        console.error("[chat] chats.json could not be parsed; left in place, not migrated");
        return;
      }
      let moved = 0;
      for (const s of Array.isArray(data.sessions) ? data.sessions : []) {
        if (!isChatSession(s)) continue;
        try {
          await fs.access(sessionFile(s.id));
          continue; // already there — never overwritten
        } catch {
          /* not there yet */
        }
        await writeSessionFile(s);
        moved++;
      }
      if (data.settings && typeof data.settings === "object") {
        try {
          await fs.access(settingsFile());
        } catch {
          await writeFileAtomic(settingsFile(), JSON.stringify(data.settings, null, 2));
        }
      }
      await fs.rename(legacyFile(), `${legacyFile()}.migrated-${Date.now()}`);
      state().cache = null;
      // eslint-disable-next-line no-console
      console.log(`[chat] moved ${moved} conversation(s) from chats.json into chats/`);
    }).catch((err) => {
      // Try again on the next call rather than never.
      state().ready = undefined;
      throw err;
    });
  }
  return st.ready;
}

/* ------------------------------------------------------------------------ */
/* The index                                                                 */
/* ------------------------------------------------------------------------ */

/** The index for callers outside the write chain: makes sure the one-time move has run. */
async function loadIndex(): Promise<Map<string, IndexEntry>> {
  await ready();
  return scanIndex();
}

/**
 * The index itself. Never waits on the chain, so it is safe to call from
 * inside it — which is where startSession needs it, having already waited for
 * ready() before joining the queue.
 */
async function scanIndex(): Promise<Map<string, IndexEntry>> {
  const st = state();
  const mtime = await dirMtime();
  if (st.cache && st.cache.dirMtimeMs === mtime) return st.cache.entries;
  if (mtime === -1) {
    st.cache = { dirMtimeMs: -1, entries: new Map() };
    return st.cache.entries;
  }

  const previous = st.cache?.entries;
  const next = new Map<string, IndexEntry>();
  for (const name of await fs.readdir(sessionsDir())) {
    const m = SESSION_FILE_RE.exec(name);
    if (!m) continue;
    const id = m[1];
    let fileStat;
    try {
      fileStat = await fs.stat(sessionFile(id));
    } catch {
      continue; // removed between the listing and now
    }
    const known = previous?.get(id);
    if (known && known.mtimeMs === fileStat.mtimeMs && known.size === fileStat.size) {
      next.set(id, known);
      continue;
    }
    try {
      const s = await readSessionFile(id);
      if (s) next.set(id, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, index: indexOf(s) });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[chat] skipped chats/${name}: ${(err as Error).message}`);
    }
  }
  st.cache = { dirMtimeMs: mtime, entries: next };
  return next;
}

/** Every conversation, as the inbox sees it. */
export async function listSessions(): Promise<SessionIndex[]> {
  return [...(await loadIndex()).values()].map((e) => e.index);
}

export async function getSession(id: string): Promise<ChatSession | null> {
  await ready();
  return readSessionFile(id);
}

export async function sessionForLink(candidateId: string, linkSentAt: string): Promise<ChatSession | null> {
  for (const e of (await loadIndex()).values()) {
    if (e.index.candidateId === candidateId && e.index.linkSentAt === linkSentAt) {
      return readSessionFile(e.index.id);
    }
  }
  return null;
}

export async function sessionsForCandidate(candidateId: string): Promise<ChatSession[]> {
  const out: ChatSession[] = [];
  for (const e of (await loadIndex()).values()) {
    if (e.index.candidateId !== candidateId) continue;
    const s = await readSessionFile(e.index.id).catch(() => null);
    if (s) out.push(s);
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* Presence and typing — memory only                                         */
/* ------------------------------------------------------------------------ */

/** Forget presence for conversations nobody has touched in an hour. */
function sweepPresence() {
  const st = state();
  const now = Date.now();
  if (now - st.lastSweep < 10 * 60_000) return;
  st.lastSweep = now;
  for (const [id, p] of st.presence) {
    const latest = Math.max(p.candidateSeenAt ?? 0, p.candidateTypingUntil ?? 0, p.recruiterTypingUntil ?? 0);
    if (now - latest > 60 * 60_000) st.presence.delete(id);
  }
}

function presenceFor(sessionId: string): Presence {
  sweepPresence();
  const map = state().presence;
  let p = map.get(sessionId);
  if (!p) {
    p = {};
    map.set(sessionId, p);
  }
  return p;
}

export function touchCandidate(sessionId: string): void {
  presenceFor(sessionId).candidateSeenAt = Date.now();
}

export function setTyping(sessionId: string, who: "candidate" | "recruiter", typing: boolean): void {
  const p = presenceFor(sessionId);
  const until = typing ? Date.now() + 5000 : 0;
  if (who === "candidate") p.candidateTypingUntil = until;
  else p.recruiterTypingUntil = until;
}

export function presenceOf(sessionId: string): {
  candidateOnline: boolean;
  candidateSeenAt?: string;
  candidateTyping: boolean;
  recruiterTyping: boolean;
} {
  const p = state().presence.get(sessionId) ?? {};
  const now = Date.now();
  return {
    // The page polls every few seconds while open, less often when hidden.
    candidateOnline: !!p.candidateSeenAt && now - p.candidateSeenAt < 20_000,
    candidateSeenAt: p.candidateSeenAt ? new Date(p.candidateSeenAt).toISOString() : undefined,
    candidateTyping: !!p.candidateTypingUntil && p.candidateTypingUntil > now,
    recruiterTyping: !!p.recruiterTypingUntil && p.recruiterTypingUntil > now,
  };
}

/* ------------------------------------------------------------------------ */
/* Changing a conversation                                                   */
/* ------------------------------------------------------------------------ */

function message(from: ChatSender, text: string, clientId?: string): ChatMessage {
  return { id: newId(8), from, text, at: new Date().toISOString(), ...(clientId ? { clientId } : {}) };
}

/**
 * Read, change, write — inside the chain. `fn` says whether it changed
 * anything; nothing is written when it did not.
 */
function mutate<T>(
  id: string,
  fn: (s: ChatSession) => { result: T; changed: boolean },
): Promise<{ found: false } | { found: true; result: T; session: ChatSession }> {
  return ready().then(() =>
    serial(async () => {
      const s = await readSessionFile(id);
      if (!s) return { found: false } as const;
      const { result, changed } = fn(s);
      if (changed) await writeSessionFile(s);
      return { found: true, result, session: s } as const;
    }),
  );
}

/**
 * The candidate pressed Start. Idempotent: pressing it twice, or on two
 * devices, finds the same conversation rather than opening a second. `created`
 * is true exactly once per conversation, which is what Telegram is told on.
 */
export function startSession(input: {
  candidateId: string;
  kind?: ChatKind;
  /** Follow-up chats: why we asked. */
  reason?: string;
  linkSentAt: string;
  candidateName: string;
  candidateEmail?: string;
  candidateCountry?: string;
  candidatePosition?: string;
}): Promise<{ session: ChatSession; created: boolean }> {
  return ready().then(() =>
    serial(async () => {
      for (const e of (await scanIndex()).values()) {
        if (e.index.candidateId === input.candidateId && e.index.linkSentAt === input.linkSentAt) {
          const found = await readSessionFile(e.index.id);
          if (found) return { session: found, created: false };
        }
      }
      const now = new Date().toISOString();
      const { kind, reason, ...rest } = input;
      const session: ChatSession = {
        id: newId(12),
        ...rest,
        ...(kind === "onboarding" || kind === "followup" ? { kind } : {}),
        ...(kind === "followup" && reason ? { reason } : {}),
        startedAt: now,
        messages: [
          message(
            "system",
            kind === "onboarding" ? "Chat started. Our team will join you shortly." : "Chat started. A recruiter will join shortly.",
          ),
        ],
        recruiterRead: 1,
        notifiedAt: now,
        lastMessageAt: now,
      };
      await writeSessionFile(session);
      return { session, created: true };
    }),
  );
}

export type AppendResult =
  | { ok: true; session: ChatSession; message: ChatMessage; duplicate: boolean }
  | { ok: false; reason: "not_found" | "ended" | "full" };

function joinInPlace(s: ChatSession, by?: string) {
  s.joinedAt = new Date().toISOString();
  s.joinedBy = by;
  s.messages.push(message("system", chatKindOf(s) === "onboarding" ? "Our team joined the chat." : "A recruiter joined the chat."));
  s.lastMessageAt = s.joinedAt;
  s.recruiterRead = s.messages.length;
}

/**
 * Add a message. A recruiter writing into a waiting chat joins it first, so the
 * candidate sees "A recruiter joined" before the first question rather than a
 * question out of nowhere.
 */
export async function appendMessage(
  sessionId: string,
  from: "candidate" | "recruiter",
  text: string,
  clientId?: string,
  by?: string,
): Promise<AppendResult> {
  const out = await mutate(sessionId, (s): { result: AppendResult; changed: boolean } => {
    if (s.endedAt) return { result: { ok: false, reason: "ended" }, changed: false };
    // The same message retried after a dropped connection is stored once.
    if (clientId) {
      const dup = s.messages.find((m) => m.clientId === clientId && m.from === from);
      if (dup) return { result: { ok: true, session: s, message: dup, duplicate: true }, changed: false };
    }
    if (s.messages.length >= MAX_MESSAGES) return { result: { ok: false, reason: "full" }, changed: false };
    if (from === "recruiter" && !s.joinedAt) joinInPlace(s, by);
    const m = message(from, text, clientId);
    s.messages.push(m);
    s.lastMessageAt = m.at;
    // What the recruiter writes, they have seen.
    if (from === "recruiter") s.recruiterRead = s.messages.length;
    return { result: { ok: true, session: s, message: m, duplicate: false }, changed: true };
  });
  return out.found ? out.result : { ok: false, reason: "not_found" };
}

/**
 * A line from the system, not from either person — "your login details were
 * emailed". Joins the chat first, like a recruiter's message, so it never
 * appears before somebody is there to answer.
 */
export async function addSystemMessage(sessionId: string, text: string, by?: string): Promise<ChatSession | null> {
  const out = await mutate(sessionId, (s) => {
    if (s.endedAt || s.messages.length >= MAX_MESSAGES) return { result: null, changed: false };
    if (!s.joinedAt) joinInPlace(s, by);
    const m = message("system", text);
    s.messages.push(m);
    s.lastMessageAt = m.at;
    s.recruiterRead = s.messages.length;
    return { result: null, changed: true };
  });
  return out.found ? out.session : null;
}

export async function joinSession(sessionId: string, by?: string): Promise<ChatSession | null> {
  const out = await mutate(sessionId, (s) => {
    if (s.joinedAt || s.endedAt) return { result: null, changed: false };
    joinInPlace(s, by);
    return { result: null, changed: true };
  });
  return out.found ? out.session : null;
}

function endInPlace(s: ChatSession, reason: "ended" | "replaced", by?: string) {
  s.endedAt = new Date().toISOString();
  s.endedBy = by;
  s.endedReason = reason;
  s.messages.push(
    message(
      "system",
      reason === "replaced"
        ? "This chat was closed because a new chat link was sent."
        : chatKindOf(s) === "onboarding"
          ? "The chat has ended. Welcome to the team!"
          : "The chat has ended. Thank you for your time.",
    ),
  );
  s.lastMessageAt = s.endedAt;
  s.recruiterRead = s.messages.length;
}

export async function endSession(sessionId: string, by?: string): Promise<ChatSession | null> {
  const out = await mutate(sessionId, (s) => {
    if (s.endedAt) return { result: null, changed: false };
    endInPlace(s, "ended", by);
    return { result: null, changed: true };
  });
  if (out.found) state().presence.delete(sessionId);
  return out.found ? out.session : null;
}

export async function markRead(sessionId: string, count: number): Promise<boolean> {
  const out = await mutate(sessionId, (s) => {
    const next = Math.max(s.recruiterRead, Math.min(Math.floor(count), s.messages.length));
    if (next === s.recruiterRead) return { result: true, changed: false };
    s.recruiterRead = next;
    return { result: true, changed: true };
  });
  return out.found;
}

/**
 * A new link was sent: whatever conversation an older link of the same kind
 * opened is closed, because a newer invitation is now the one in their inbox.
 * The other kind is left alone — an onboarding invitation never closes an
 * interview, nor the reverse.
 */
export async function closeOlderSessions(
  candidateId: string,
  keepLinkSentAt: string,
  kind: ChatKind = "interview",
): Promise<number> {
  let closed = 0;
  for (const s of await listSessions()) {
    if (s.candidateId !== candidateId || s.linkSentAt === keepLinkSentAt || s.endedAt || s.kind !== kind) continue;
    const out = await mutate(s.id, (live) => {
      if (live.endedAt) return { result: false, changed: false };
      endInPlace(live, "replaced");
      return { result: true, changed: true };
    });
    if (out.found && out.result) {
      closed++;
      state().presence.delete(s.id);
    }
  }
  return closed;
}

/** The candidate was deleted: their conversations go with them. */
export async function deleteSessionsForCandidate(candidateId: string): Promise<number> {
  const ids = (await listSessions()).filter((s) => s.candidateId === candidateId).map((s) => s.id);
  await serial(async () => {
    for (const id of ids) await removeSessionFile(id);
  });
  return ids.length;
}

/* ------------------------------------------------------------------------ */
/* Settings                                                                  */
/* ------------------------------------------------------------------------ */

export async function getChatSettings(): Promise<ChatSettings & { isDefault: boolean }> {
  await ready();
  let raw: string;
  try {
    raw = await fs.readFile(settingsFile(), "utf8");
  } catch {
    return { questions: DEFAULT_QUESTIONS, onboarding: DEFAULT_ONBOARDING, followupQuestions: DEFAULT_FOLLOWUP_QUESTIONS, hours: DEFAULT_HOURS, isDefault: true };
  }
  try {
    const s = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      questions: Array.isArray(s.questions) ? s.questions.filter((q): q is string => typeof q === "string") : DEFAULT_QUESTIONS,
      followupQuestions: Array.isArray(s.followupQuestions)
        ? s.followupQuestions.filter((q): q is string => typeof q === "string")
        : DEFAULT_FOLLOWUP_QUESTIONS,
      // Settings saved before onboarding chats existed have none: the defaults.
      onboarding: Array.isArray(s.onboarding)
        ? s.onboarding.filter((m): m is { title: string; text: string } => !!m && typeof m.title === "string" && typeof m.text === "string")
        : DEFAULT_ONBOARDING,
      hours: typeof s.hours === "string" && !OLD_DEFAULT_HOURS.includes(s.hours) ? s.hours : DEFAULT_HOURS,
      updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : undefined,
      isDefault: false,
    };
  } catch {
    // eslint-disable-next-line no-console
    console.error("[chat] chat-settings.json could not be parsed; showing the defaults");
    return { questions: DEFAULT_QUESTIONS, onboarding: DEFAULT_ONBOARDING, followupQuestions: DEFAULT_FOLLOWUP_QUESTIONS, hours: DEFAULT_HOURS, isDefault: true };
  }
}

/** Replaces the settings whole — there is nothing in the old file to keep. */
export function saveChatSettings(next: Pick<ChatSettings, "questions" | "onboarding" | "followupQuestions" | "hours">): Promise<ChatSettings> {
  return ready().then(() =>
    serial(async () => {
      const saved: ChatSettings = { ...next, updatedAt: new Date().toISOString() };
      await writeFileAtomic(settingsFile(), JSON.stringify(saved, null, 2));
      return saved;
    }),
  );
}

export { chatStatus };
