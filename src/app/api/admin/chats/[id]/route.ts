import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, verifyAdminRequest } from "@/lib/adminAuth";
import {
  addSystemMessage,
  appendMessage,
  endSession,
  getSession,
  joinSession,
  markRead,
  presenceOf,
  setTyping,
} from "@/lib/chatStore";
import {
  MAX_MESSAGE,
  chatKindOf,
  chatStatus,
  cleanMessage,
  isSessionId,
  isValidClientId,
  type AdminSessionView,
  type ChatSession,
  type LiveReminder,
  type PortalState,
} from "@/lib/chat";
import { readJsonBody, badBodyResponse } from "@/lib/http";
import { candidateStatuses, forgetCandidateStatuses, liveRemindersFor } from "@/lib/chatAccess";
import { setStatus } from "@/lib/store";
import { FULL_VERIFIED } from "@/lib/candidateStatus";
import { getMemberByCandidate, recordInvite } from "@/lib/teamStore";
import { sendLoginDetails } from "@/lib/teamNotify";
import { teamPortalUrl } from "@/lib/teamHost";
import { formatLongDay } from "@/lib/teamShared";

/**
 * One conversation, from the recruiter's side.
 *
 *   GET  ?from=N        the conversation (messages from N on) and presence
 *   POST join           join a waiting chat
 *   POST send           a message — joins first if nobody has
 *   POST end            close it for good
 *   POST read           everything up to `count` has been seen
 *   POST typing         "is typing…" for the candidate, for a few seconds
 *   POST verify         mark the candidate Full verified — ended chats only
 *   POST portalLogin    onboarding chats: email their team-portal login (a
 *                       new temporary password) and say so in the chat
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function fromOf(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Facts = { candidateStatus?: string; reminders?: LiveReminder[]; portal?: PortalState };

function view(s: ChatSession, from: number, { candidateStatus, reminders, portal }: Facts = {}): AdminSessionView {
  const total = s.messages.length;
  // More than exists: the page holds a conversation the server does not.
  const reset = from > total;
  const start = reset ? 0 : Math.floor(from);
  const presence = presenceOf(s.id);
  const status = chatStatus(s);
  return {
    ...(reset ? { reset: true } : {}),
    id: s.id,
    candidateId: s.candidateId,
    kind: chatKindOf(s),
    candidateName: s.candidateName,
    candidateEmail: s.candidateEmail,
    candidateCountry: s.candidateCountry,
    candidatePosition: s.candidatePosition,
    status,
    startedAt: s.startedAt,
    joinedAt: s.joinedAt,
    endedAt: s.endedAt,
    endedReason: s.endedReason,
    messages: s.messages.slice(start),
    total,
    recruiterRead: s.recruiterRead,
    candidateOnline: status !== "ended" && presence.candidateOnline,
    candidateSeenAt: presence.candidateSeenAt,
    candidateTyping: status !== "ended" && presence.candidateTyping,
    candidateStatus,
    reminders,
    ...(portal ? { portal } : {}),
    ...(s.reason ? { reason: s.reason } : {}),
  };
}

/** Where an onboarding chat's candidate is with the team portal. */
async function portalOf(s: ChatSession): Promise<PortalState> {
  const base = teamPortalUrl();
  const m = await getMemberByCandidate(s.candidateId);
  return {
    portalUrl: base,
    addUrl: `${base}/admin/team/new?candidate=${encodeURIComponent(s.candidateId)}&from=chat`,
    ...(m
      ? {
          member: {
            id: m.id,
            url: `${base}/admin/team/${m.id}`,
            workEmail: m.workEmail,
            firstName: m.fullName.split(/\s+/)[0] || m.fullName,
            invitedAt: m.invitedAt,
            passwordSet: !!m.passwordSetAt && !m.mustChangePassword,
            startDate: formatLongDay(m.firstWorkDay),
            bank: m.bankPending ? "pending" : m.bank ? "approved" : m.bankRejected ? "refused" : "none",
            activated: !!m.activatedAt,
            lastSignInAt: m.lastSignInAt,
            active: m.status === "active",
          },
        }
      : {}),
  };
}

async function factsOf(s: ChatSession): Promise<Facts> {
  const [statuses, reminders, portal] = await Promise.all([
    candidateStatuses(),
    liveRemindersFor(s.candidateId, s.linkSentAt),
    chatKindOf(s) === "onboarding" ? portalOf(s) : Promise.resolve(undefined),
  ]);
  return { candidateStatus: statuses.get(s.candidateId), reminders, portal };
}

/** Below this, a second login email is refused as a double click. */
const LOGIN_MIN_GAP_MS = 60_000;

const notFound = () => NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  // Checked before it goes anywhere near a file path.
  if (!isSessionId(id)) return notFound();
  const s = await getSession(id);
  if (!s) return notFound();
  return NextResponse.json(
    { ok: true, session: view(s, fromOf(req.nextUrl.searchParams.get("from")), await factsOf(s)) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await verifyAdminRequest(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const by = (await getAdminSession())?.u ?? "admin";
  const { id } = await ctx.params;
  if (!isSessionId(id)) return notFound();

  const parsed = await readJsonBody<{
    action?: string;
    text?: unknown;
    clientId?: unknown;
    count?: unknown;
    typing?: unknown;
    from?: unknown;
  }>(req, 16 * 1024);
  if (!parsed.ok) return badBodyResponse(parsed.reason);
  const body = parsed.data;
  const from = fromOf(body.from);

  switch (body.action) {
    case "join": {
      const s = await joinSession(id, by);
      if (!s) return notFound();
      if (s.endedAt) return NextResponse.json({ ok: false, error: "ended" }, { status: 409 });
      return NextResponse.json({ ok: true, session: view(s, from, await factsOf(s)) });
    }
    case "send": {
      const text = cleanMessage(body.text);
      if (!text) return NextResponse.json({ ok: false, error: "empty" }, { status: 400 });
      if (text.length > MAX_MESSAGE) {
        return NextResponse.json({ ok: false, error: "too_long" }, { status: 400 });
      }
      const clientId = isValidClientId(body.clientId) ? body.clientId : undefined;
      const result = await appendMessage(id, "recruiter", text, clientId, by);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.reason },
          { status: result.reason === "not_found" ? 404 : 409 },
        );
      }
      setTyping(id, "recruiter", false);
      return NextResponse.json({ ok: true, session: view(result.session, from, await factsOf(result.session)) });
    }
    case "end": {
      const s = await endSession(id, by);
      if (!s) return notFound();
      // eslint-disable-next-line no-console
      console.log(`[chat] ${id} ended by ${by}`);
      return NextResponse.json({ ok: true, session: view(s, from, await factsOf(s)) });
    }
    case "verify": {
      // After the interview, not during it: the label only appears once the
      // chat has ended, and the server holds the same line.
      const s = await getSession(id);
      if (!s) return notFound();
      if (!s.endedAt) return NextResponse.json({ ok: false, error: "not_ended" }, { status: 409 });
      const updated = await setStatus(s.candidateId, FULL_VERIFIED, by);
      if (!updated) return NextResponse.json({ ok: false, error: "candidate_not_found" }, { status: 404 });
      forgetCandidateStatuses();
      // eslint-disable-next-line no-console
      console.log(`[chat] ${s.candidateId} marked Full verified by ${by} from chat ${id}`);
      return NextResponse.json({ ok: true, session: view(s, from, { ...(await factsOf(s)), candidateStatus: updated.status }) });
    }
    case "portalLogin": {
      const s = await getSession(id);
      if (!s) return notFound();
      if (chatKindOf(s) !== "onboarding") return NextResponse.json({ ok: false, error: "not_onboarding" }, { status: 409 });
      if (s.endedAt) return NextResponse.json({ ok: false, error: "ended" }, { status: 409 });
      const member = await getMemberByCandidate(s.candidateId);
      if (!member) return NextResponse.json({ ok: false, error: "not_member" }, { status: 409 });
      if (!member.workEmail) return NextResponse.json({ ok: false, error: "no_work_email" }, { status: 409 });
      if (member.invitedAt && Date.now() - Date.parse(member.invitedAt) < LOGIN_MIN_GAP_MS) {
        return NextResponse.json({ ok: false, error: "too_soon" }, { status: 409 });
      }
      const sent = await sendLoginDetails(member);
      if (!sent.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[chat] portal login for ${member.id} not sent: ${sent.reason}`);
        return NextResponse.json({ ok: false, error: sent.reason ?? "send_failed" }, { status: 502 });
      }
      await recordInvite(member.id);
      // Never the password itself: that is in the email, and only there.
      const updated =
        (await addSystemMessage(
          id,
          "Your team portal login details have been emailed to you. Please check your inbox (and your spam folder).",
          by,
        )) ?? s;
      // eslint-disable-next-line no-console
      console.log(`[chat] portal login sent to ${member.id} by ${by} from chat ${id}`);
      return NextResponse.json({ ok: true, session: view(updated, from, await factsOf(updated)) });
    }
    case "read": {
      const s = await getSession(id);
      if (!s) return notFound();
      const count = typeof body.count === "number" && Number.isFinite(body.count) ? body.count : s.messages.length;
      await markRead(id, count);
      return NextResponse.json({ ok: true });
    }
    case "typing": {
      const s = await getSession(id);
      if (!s) return notFound();
      if (!s.endedAt) setTyping(id, "recruiter", body.typing === true);
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
}
