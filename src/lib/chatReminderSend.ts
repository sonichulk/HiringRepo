/**
 * SERVER-ONLY. The two chat reminders, sent the same way from everywhere.
 *
 *   "live"   our recruitment team is live now — the recruiter is there and the
 *            candidate is not (Live chat header, View info)
 *   "nudge"  you have not started your final interview chat yet (View info,
 *            and a paced batch from the Accepted tab)
 *
 * Both use the candidate's same chat link, so nothing about their chat changes.
 * Only a link that has run out without ever opening a chat is replaced — the
 * email carries a fresh one, which retires it exactly as "Send a new chat link"
 * would. The link carries the reminder's id, and the chat page reports it once
 * it is on screen in a real browser; that is when Telegram is told.
 */
import {
  getCandidate,
  recordChatLink,
  recordLiveReminder,
  revertChatLink,
  revertLiveReminder,
} from "@/lib/store";
import { closeOlderSessions, getChatSettings, sessionForLink } from "@/lib/chatStore";
import {
  CHAT_LINK_TTL_DAYS,
  REMINDER_MIN_GAP_MS,
  reminderKind,
  type ChatKind,
  type LiveReminder,
  type ReminderKind,
} from "@/lib/chat";
import { createChatToken } from "@/lib/token";
import { sendEmail } from "@/lib/email";
import {
  chatLiveNowHtml,
  chatLiveNowSubject,
  chatLiveNowText,
  chatReminderHtml,
  chatReminderSubject,
  chatReminderText,
} from "@/lib/emailTemplates";
import { campaignBlocked } from "@/lib/warmupStore";
import { chatLinkKind, currentChatLink, forgetCandidateStatuses } from "@/lib/chatAccess";
import { newId } from "@/lib/id";
import { siteConfig } from "@/config/site";

const DAY_MS = 24 * 60 * 60 * 1000;

export function chatLinkUrl(base: string, id: string, sentAt: string): string {
  return `${base}/chat?t=${encodeURIComponent(createChatToken({ id, sentAt }))}`;
}

export function chatLinkLive(sentAt?: string): boolean {
  if (!sentAt) return false;
  const t = Date.parse(sentAt);
  return !Number.isNaN(t) && Date.now() - t <= CHAT_LINK_TTL_DAYS * DAY_MS;
}

/** "7 October" — the last day a link sent at `sentAt` opens a chat, UK time. */
function validUntil(sentAt: string): string {
  return new Date(Date.parse(sentAt) + CHAT_LINK_TTL_DAYS * DAY_MS).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });
}

export type ChatReminderRefusal =
  | "not_found"
  | "no_email"
  | "no_link"
  | "ended"
  | "started"
  | "too_soon"
  | "warmup_limit";

export const REFUSAL_STATUS: Record<ChatReminderRefusal, number> = {
  not_found: 404,
  no_email: 400,
  no_link: 409,
  ended: 409,
  started: 409,
  too_soon: 409,
  warmup_limit: 429,
};

export type ChatReminderOutcome =
  | {
      ok: true;
      newLink: boolean;
      reminder: LiveReminder;
      /** Every reminder (both kinds) for the link now current, oldest first. */
      reminders: LiveReminder[];
      chatLinkSentAt?: string;
      chatLinks?: string[];
      onboardingChatLinks?: string[];
      followupChatLinks?: string[];
      link: string;
    }
  | { ok: false; reason: ChatReminderRefusal | string; refused?: boolean };

export async function sendChatReminder(
  id: string,
  base: string,
  opts: {
    kind: ReminderKind;
    by?: string;
    override?: boolean;
    /** Which chat: the interview (default), the onboarding or the follow-up chat. */
    chat?: ChatKind;
  },
): Promise<ChatReminderOutcome> {
  const { kind } = opts;
  const linkKind: ChatKind = opts.chat === "onboarding" || opts.chat === "followup" ? opts.chat : "interview";
  const onboarding = linkKind === "onboarding";
  const followup = linkKind === "followup";
  const refuse = (reason: ChatReminderRefusal): ChatReminderOutcome => ({ ok: false, reason, refused: true });

  const candidate = await getCandidate(id);
  if (!candidate) return refuse("not_found");
  const email = (candidate.email || "").trim();
  if (!email.includes("@")) return refuse("no_email");
  const current = currentChatLink(candidate, linkKind);
  if (!current) return refuse("no_link");

  const session = await sessionForLink(id, current);
  if (session?.endedAt) return refuse("ended");
  // A reminder to start is wrong for somebody who has: they are in the chat,
  // or waiting in it, and "you haven't started yet" would be false.
  if (kind === "nudge" && session) return refuse("started");

  const last = (candidate.liveReminders ?? [])
    .filter((r) => reminderKind(r) === kind && chatLinkKind(candidate, r.linkSentAt) === linkKind)
    .at(-1);
  if (last && Date.now() - Date.parse(last.sentAt) < REMINDER_MIN_GAP_MS) return refuse("too_soon");
  // Asked before anything is written, so a held email never retires a link.
  if (!opts.override && (await campaignBlocked())) return refuse("warmup_limit");

  const now = new Date().toISOString();
  // A started chat keeps its link working past the seven days; only a link
  // that never opened anything needs replacing.
  const newLink = !session && !chatLinkLive(current);
  const linkSentAt = newLink ? now : current;
  let updated = candidate;
  if (newLink) {
    const u = await recordChatLink(id, linkSentAt, linkKind, followup ? candidate.followupReasons?.[current] : undefined);
    if (!u) return refuse("not_found");
    updated = u;
  }

  // Recorded before the send, so a candidate who clicks at once is recognised.
  const reminder: LiveReminder = { id: newId(12), kind, sentAt: now, by: opts.by, linkSentAt };
  updated = (await recordLiveReminder(id, reminder)) ?? updated;

  const chatUrl = `${chatLinkUrl(base, id, linkSentAt)}&r=${reminder.id}`;
  const fullName = candidate.fullName || "Candidate";
  let subject: string, html: string, text: string;
  if (kind === "nudge") {
    const settings = await getChatSettings();
    const payload = { fullName, chatUrl, hours: settings.hours || undefined, validUntil: validUntil(linkSentAt), newLink, onboarding, followup };
    subject = chatReminderSubject(linkKind);
    html = chatReminderHtml(payload);
    text = chatReminderText(payload);
  } else {
    const payload = { fullName, chatUrl, newLink, validDays: CHAT_LINK_TTL_DAYS, onboarding, followup };
    subject = chatLiveNowSubject(linkKind);
    html = chatLiveNowHtml(payload);
    text = chatLiveNowText(payload);
  }

  const result = await sendEmail({
    to: email,
    toName: candidate.fullName || undefined,
    subject,
    html,
    text,
    replyTo: siteConfig.contact.recruitmentEmail,
    kind: "campaign",
    override: opts.override,
  });

  if (!result.ok) {
    await revertLiveReminder(id, reminder.id);
    if (newLink) await revertChatLink(id, linkSentAt, linkKind);
    forgetCandidateStatuses();
    const reason = "skipped" in result ? result.skipped : result.error;
    // eslint-disable-next-line no-console
    console.warn(`[chat] ${kind} reminder for ${id} not sent: ${reason}`);
    return { ok: false, reason };
  }

  if (newLink) await closeOlderSessions(id, linkSentAt, linkKind);
  forgetCandidateStatuses(); // the Live chat header shows it on its next poll
  // eslint-disable-next-line no-console
  console.log(`[chat] ${kind} reminder to ${id}${opts.by ? ` by ${opts.by}` : ""}${newLink ? " (with a fresh link)" : ""}`);
  return {
    ok: true,
    newLink,
    reminder,
    reminders: (updated.liveReminders ?? []).filter((r) => r.linkSentAt === linkSentAt),
    ...(onboarding
      ? { onboardingChatLinks: updated.onboardingChatLinks ?? [] }
      : followup
      ? { followupChatLinks: updated.followupChatLinks ?? [] }
      : { chatLinkSentAt: updated.chatLinkSentAt, chatLinks: updated.chatLinks }),
    link: chatLinkUrl(base, id, linkSentAt),
  };
}
