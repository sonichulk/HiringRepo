import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, verifyAdminRequest } from "@/lib/adminAuth";
import { getCandidate, recordChatLink, revertChatLink } from "@/lib/store";
import { closeOlderSessions, getChatSettings, sessionsForCandidate } from "@/lib/chatStore";
import { CHAT_LINK_TTL_DAYS, chatKindOf, chatStatus, followupReasonMessage, type ChatKind } from "@/lib/chat";
import { sendEmail } from "@/lib/email";
import {
  finalChatHtml,
  finalChatSubject,
  finalChatText,
  onboardingChatHtml,
  onboardingChatSubject,
  onboardingChatText,
  followupChatHtml,
  followupChatSubject,
  followupChatText,
} from "@/lib/emailTemplates";
import { agreementStatus } from "@/lib/agreement";
import { readJsonBody, badBodyResponse } from "@/lib/http";
import { campaignBlocked } from "@/lib/warmupStore";
import { siteConfig } from "@/config/site";
import {
  REFUSAL_STATUS,
  chatLinkLive,
  chatLinkUrl,
  sendChatReminder,
  type ChatReminderRefusal,
} from "@/lib/chatReminderSend";

/**
 * A candidate's final-interview chat, from View info.
 *
 *   GET   their conversations (transcripts) and the current link
 *   POST  email a new chat link — which retires any earlier one
 *   POST  {action:"onboarding"}  email an onboarding-chat link — after the
 *         signed agreement is accepted; retires the earlier onboarding link
 *         only (the two kinds are separate)
 *   POST  {action:"followup", reason, custom?}  email a follow-up chat link,
 *         for somebody whose interview chat has ended, with why we ask
 *   POST  {action:"remind", kind?:"live"|"nudge", chat?:"onboarding"|"followup"}  "our team is live now", or
 *         "you have not started yet" — see lib/chatReminderSend
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function baseUrl(req: NextRequest): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

const linkFor = (req: NextRequest, id: string, sentAt: string) => chatLinkUrl(baseUrl(req), id, sentAt);
const linkLive = chatLinkLive;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const candidate = await getCandidate(id);
  if (!candidate) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  // The final interview and the follow-ups, apart; onboarding chats are in
  // Live chat → Onboarding chat.
  const all = (await sessionsForCandidate(id)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const shape = (s: (typeof all)[number]) => ({
      id: s.id,
      status: chatStatus(s),
      linkSentAt: s.linkSentAt,
      startedAt: s.startedAt,
      joinedAt: s.joinedAt,
      endedAt: s.endedAt,
      endedReason: s.endedReason,
      reason: s.reason,
      messages: s.messages,
    });
  const sessions = all.filter((s) => chatKindOf(s) === "interview").map(shape);
  const followupSessions = all.filter((s) => chatKindOf(s) === "followup").map(shape);
  const sentAt = candidate.chatLinkSentAt;
  const followupAt = candidate.followupChatLinks?.at(-1);
  return NextResponse.json(
    {
      ok: true,
      sessions,
      link: sentAt && linkLive(sentAt) ? linkFor(req, id, sentAt) : undefined,
      linkSentAt: sentAt,
      onboardingChatLinks: candidate.onboardingChatLinks ?? [],
      followupSessions,
      followupChatLinks: candidate.followupChatLinks ?? [],
      followupReason: followupAt ? candidate.followupReasons?.[followupAt] : undefined,
      followupLink: followupAt && linkLive(followupAt) ? linkFor(req, id, followupAt) : undefined,
      followupReminders: followupAt ? (candidate.liveReminders ?? []).filter((r) => r.linkSentAt === followupAt) : [],
      // A follow-up is for after the interview chat has ended.
      canFollowup: all.some((s) => chatKindOf(s) === "interview" && !!s.endedAt),
      linkExpired: !!sentAt && !linkLive(sentAt),
      reminders: sentAt ? (candidate.liveReminders ?? []).filter((r) => r.linkSentAt === sentAt) : [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminRequest(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const by = (await getAdminSession())?.u ?? "admin";
  const { id } = await ctx.params;
  // No body at all still means "send a link", as it always has.
  const parsed = req.headers.get("content-length") === "0" ? null : await readJsonBody<{ action?: string; kind?: string; chat?: string; reason?: string; custom?: string } | null>(req, 4 * 1024);
  if (parsed && !parsed.ok) return badBodyResponse(parsed.reason);
  const candidate = await getCandidate(id);
  if (!candidate) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const email = (candidate.email || "").trim();
  if (!email.includes("@")) return NextResponse.json({ ok: false, error: "no_email" }, { status: 400 });
  if (parsed?.data?.action === "remind") {
    const chat: ChatKind = parsed.data.chat === "onboarding" || parsed.data.chat === "followup" ? parsed.data.chat : "interview";
    return remind(req, id, parsed.data.kind === "nudge" ? "nudge" : "live", by, chat);
  }
  const action = parsed?.data?.action;
  const kind: ChatKind = action === "onboarding" || action === "followup" ? action : "interview";
  let reason: string | undefined;
  if (kind === "followup") {
    reason = followupReasonMessage(String(parsed?.data?.reason ?? ""), String(parsed?.data?.custom ?? ""));
    if (!reason) return NextResponse.json({ ok: false, error: "no_reason" }, { status: 400 });
    const ended = (await sessionsForCandidate(id)).some((s) => chatKindOf(s) === "interview" && !!s.endedAt);
    if (!ended) return NextResponse.json({ ok: false, error: "no_interview" }, { status: 409 });
    const last = candidate.followupChatLinks?.at(-1);
    if (last && Date.now() - Date.parse(last) < 60_000) return NextResponse.json({ ok: false, error: "too_soon" }, { status: 409 });
  }
  // Onboarding is for somebody whose signed agreement has been accepted.
  if (kind === "onboarding" && agreementStatus(candidate) !== "approved") {
    return NextResponse.json({ ok: false, error: "agreement_not_accepted" }, { status: 409 });
  }
  if (kind === "onboarding" && candidate.onboardingChatLinks?.length) {
    const last = Date.parse(candidate.onboardingChatLinks[candidate.onboardingChatLinks.length - 1]);
    if (Date.now() - last < 60_000) return NextResponse.json({ ok: false, error: "too_soon" }, { status: 409 });
  }
  // Asked before the write, so a held email never retires a working link.
  if (await campaignBlocked()) {
    return NextResponse.json({ ok: false, error: "warmup_limit" }, { status: 429 });
  }

  // Recorded first: the page reads the link back from the record, and a
  // candidate who opens the email at once must not beat the write.
  const sentAt = new Date().toISOString();
  const updated = await recordChatLink(id, sentAt, kind, reason);
  if (!updated) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const settings = await getChatSettings();
  const chatUrl = linkFor(req, id, sentAt);
  const payload = {
    fullName: updated.fullName || "Candidate",
    chatUrl,
    position: updated.offer?.position || updated.position || undefined,
    hours: settings.hours || undefined,
    validDays: CHAT_LINK_TTL_DAYS,
  };
  const message =
    kind === "onboarding"
      ? { subject: onboardingChatSubject(), html: onboardingChatHtml(payload), text: onboardingChatText(payload) }
      : kind === "followup"
        ? (() => {
            const e = { ...payload, reason: reason! };
            return { subject: followupChatSubject(), html: followupChatHtml(e), text: followupChatText(e) };
          })()
        : { subject: finalChatSubject(), html: finalChatHtml(payload), text: finalChatText(payload) };
  const result = await sendEmail({
    to: email,
    toName: updated.fullName || undefined,
    ...message,
    replyTo: siteConfig.contact.recruitmentEmail,
    kind: "campaign",
  });

  if (!result.ok) {
    // Nobody was told, so the earlier link stays the working one.
    await revertChatLink(id, sentAt, kind);
    const why = "skipped" in result ? result.skipped : result.error;
    // eslint-disable-next-line no-console
    console.warn(`[chat] link for ${id} not sent: ${why}`);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }

  // Only now is the old link really replaced — close what it had open. Only
  // the same kind: an onboarding invitation never closes an interview.
  const closed = await closeOlderSessions(id, sentAt, kind);
  // eslint-disable-next-line no-console
  console.log(`[chat] ${kind} link sent to ${id} by ${by}${closed ? ` (closed ${closed} older chat)` : ""}`);
  return NextResponse.json({
    ok: true,
    kind,
    ...(kind === "onboarding"
      ? { onboardingChatLinks: updated.onboardingChatLinks ?? [] }
      : kind === "followup"
        ? { followupChatLinks: updated.followupChatLinks ?? [], followupReason: reason }
        : { chatLinkSentAt: sentAt, chatLinks: updated.chatLinks }),
    link: chatUrl,
  });
}

async function remind(req: NextRequest, id: string, kind: "live" | "nudge", by: string, chat: ChatKind) {
  const out = await sendChatReminder(id, baseUrl(req), { kind, by, chat });
  if (!out.ok) {
    const status = out.refused ? REFUSAL_STATUS[out.reason as ChatReminderRefusal] ?? 409 : 502;
    return NextResponse.json({ ok: false, error: out.reason }, { status });
  }
  return NextResponse.json(out);
}
