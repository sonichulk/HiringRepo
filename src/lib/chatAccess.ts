/**
 * SERVER-ONLY. Who a chat link belongs to, and what it may still do.
 *
 * Shared by the chat page and its API, so the two agree. The rules:
 *
 *   - A link that is not a genuine chat link, or was never on the record
 *     (a send whose email failed is undone), is invalid.
 *   - The newest link starts a chat, for seven days.
 *   - A link that has started a chat keeps working for that chat — past the
 *     seven days, and after a newer link is sent, until that newer email has
 *     actually gone out and closed it. Cutting somebody off mid-interview
 *     because a week ran out, or because an email that then failed was being
 *     sent, would be the worst moment to do it.
 *   - An older link that never started anything says a newer one was sent.
 */
import { getCandidate, listCandidates, type Candidate } from "@/lib/store";
import { sessionForLink } from "@/lib/chatStore";
import { readChatToken, type ChatLink } from "@/lib/token";
import type { ChatKind, ChatSession, LiveReminder } from "@/lib/chat";

export type ChatAccess =
  | {
      ok: true;
      candidate: Candidate;
      link: ChatLink;
      /** The conversation this link opened, if it has opened one. */
      session: ChatSession | null;
      /** Is this the newest link — the one that may start a chat? */
      current: boolean;
      /** What the link was sent for. */
      kind: ChatKind;
    }
  | { ok: false; reason: "invalid" | "expired" | "not_found" | "replaced" };

/**
 * The candidate record, cached for a few seconds for the chat's polls.
 *
 * The page asks every couple of seconds, and the candidate file holds every
 * application. What a poll needs from it — the link on record, and that the
 * person still exists — changes rarely, and a few seconds late is harmless.
 * Anything that writes reads fresh.
 */
const CANDIDATE_TTL_MS = 5000;
const G = globalThis as unknown as { __wrChatCandidates?: Map<string, { at: number; c: Candidate | null }> };

async function candidateFor(id: string, fresh: boolean): Promise<Candidate | null> {
  const cache = (G.__wrChatCandidates ??= new Map());
  const now = Date.now();
  const hit = cache.get(id);
  if (!fresh && hit && now - hit.at < CANDIDATE_TTL_MS) return hit.c;
  const c = await getCandidate(id);
  if (cache.size > 500) cache.clear();
  cache.set(id, { at: now, c });
  return c;
}

export async function resolveChatLink(
  token: string | undefined | null,
  opts: { fresh?: boolean } = {},
): Promise<ChatAccess> {
  const read = readChatToken(token);
  if (!read.ok) return { ok: false, reason: "invalid" };

  const candidate = await candidateFor(read.link.id, !!opts.fresh);
  if (!candidate) return { ok: false, reason: "not_found" };

  // Interview and onboarding links are two separate chains: each kind's
  // newest link is current, whatever was sent of the other kind.
  const sentAt = read.link.sentAt;
  const kind = chatLinkKind(candidate, sentAt);
  const current = currentChatLink(candidate, kind) === sentAt;
  if (!current && kind === "interview" && !(candidate.chatLinks ?? []).includes(sentAt)) {
    return { ok: false, reason: "invalid" };
  }

  const session = await sessionForLink(candidate.id, sentAt);
  if (!session) {
    if (!current) return { ok: false, reason: "replaced" };
    if (read.expired) return { ok: false, reason: "expired" };
  }
  return { ok: true, candidate, link: read.link, session, current, kind };
}

/** The newest link of one kind — the one that may start a chat. */
export function currentChatLink(
  c: Pick<Candidate, "chatLinkSentAt" | "onboardingChatLinks" | "followupChatLinks">,
  kind: ChatKind,
): string | undefined {
  if (kind === "onboarding") return c.onboardingChatLinks?.at(-1);
  if (kind === "followup") return c.followupChatLinks?.at(-1);
  return c.chatLinkSentAt;
}

/** What a chat link was sent for — a conversation already open keeps its own. */
export function chatLinkKind(
  c: Pick<Candidate, "onboardingChatLinks" | "followupChatLinks">,
  sentAt: string | undefined,
): ChatKind {
  if (!sentAt) return "interview";
  if (c.onboardingChatLinks?.includes(sentAt)) return "onboarding";
  if (c.followupChatLinks?.includes(sentAt)) return "followup";
  return "interview";
}

export const ACCESS_STATUS: Record<Exclude<ChatAccess, { ok: true }>["reason"], number> = {
  invalid: 403,
  expired: 403,
  not_found: 404,
  replaced: 409,
};

/**
 * Every candidate's status, for the Live chat tab's "Full verified" label, and
 * the "we're live" emails sent, for the conversation header.
 *
 * Cached for a few seconds: the inbox polls every three, and the candidate
 * file holds every application. A change made here clears it at once, so the
 * label never lags behind a click.
 */
const STATUS_TTL_MS = 3000;
type Facts = { at: number; map: Map<string, string>; reminders: Map<string, LiveReminder[]> };
const S = globalThis as unknown as { __wrChatStatuses?: Facts };

async function facts(): Promise<Facts> {
  const hit = S.__wrChatStatuses;
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit;
  const all = await listCandidates();
  const next: Facts = {
    at: Date.now(),
    map: new Map(all.map((c) => [c.id, c.status as string])),
    reminders: new Map(all.filter((c) => c.liveReminders?.length).map((c) => [c.id, c.liveReminders!])),
  };
  S.__wrChatStatuses = next;
  return next;
}

export async function candidateStatuses(): Promise<Map<string, string>> {
  return (await facts()).map;
}

/** The "we're live" emails sent for one chat link — from the same short cache. */
export async function liveRemindersFor(candidateId: string, linkSentAt: string): Promise<LiveReminder[]> {
  return ((await facts()).reminders.get(candidateId) ?? []).filter((r) => r.linkSentAt === linkSentAt);
}

export function forgetCandidateStatuses(): void {
  S.__wrChatStatuses = undefined;
}
