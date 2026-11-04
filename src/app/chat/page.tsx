import type { Metadata } from "next";
import { resolveChatLink } from "@/lib/chatAccess";
import { getChatSettings } from "@/lib/chatStore";
import { chatKindOf, chatStatus, isReminderId, type CandidateChatState } from "@/lib/chat";
import { CHAT_LINK_TTL_DAYS } from "@/lib/token";
import { siteConfig } from "@/config/site";
import { Icon } from "@/components/Icon";
import { ChatRoom } from "@/components/chat/ChatRoom";

/**
 * Where a candidate holds their final interview as a live text chat — and,
 * after the signed agreement, their onboarding chat (lib/chat ChatKind).
 *
 * Reaching this page records nothing and pages nobody — mail scanners open
 * every link in an email. The conversation begins when they press Start.
 */

export const metadata: Metadata = {
  title: "Live chat — WorkRoute",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const token = one(sp.t) ?? "";
  // Set on the link in a "we're live" email; the page reports it once it is
  // actually open in a browser.
  const reminder = one(sp.r);
  const access = await resolveChatLink(token, { fresh: true });

  if (!access.ok) {
    const copy = {
      expired: {
        title: "This chat link has expired",
        body: `Chat links stay valid for ${CHAT_LINK_TTL_DAYS} days. Reply to our email and we will send you a new one.`,
      },
      replaced: {
        title: "A newer chat link was sent",
        body: "This link belongs to an earlier email. Please open the link in the most recent email we sent you.",
      },
      not_found: {
        title: "We could not find your chat",
        body: "This link does not match anything on our records. Please reply to our email and we will sort it out.",
      },
      invalid: {
        title: "This chat link is not valid",
        body: "Please open the link exactly as it appears in the email we sent you — some mail apps cut long links in half.",
      },
    }[access.reason];
    return (
      <main className="min-h-dvh-safe flex items-center justify-center bg-cream-100 px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-navy-100 bg-white p-8 text-center shadow-card">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-navy-600">
            <Icon name="chat" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-navy-900">{copy.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-navy-600">{copy.body}</p>
          <p className="mt-5 text-xs text-navy-400">
            Recruitment team:{" "}
            <a href={`mailto:${siteConfig.contact.recruitmentEmail}`} className="font-semibold text-brand-700 underline">
              {siteConfig.contact.recruitmentEmail}
            </a>
          </p>
        </div>
      </main>
    );
  }

  const { candidate, session } = access;
  // A conversation keeps the kind it started with; before that, the link's.
  const kind = session ? chatKindOf(session) : access.kind;
  const settings = await getChatSettings();

  // An ended chat is shown as ended, with none of the conversation — that
  // stays with the recruiter (see the API route).
  const initial: CandidateChatState = session?.endedAt
    ? {
        status: "ended",
        messages: [],
        total: 0,
        startedAt: session.startedAt,
        endedReason: session.endedReason,
        recruiterTyping: false,
      }
    : session
    ? {
        status: chatStatus(session),
        messages: session.messages.map(({ id, from, text, at, clientId }) => ({
          id, from, text, at, ...(clientId ? { clientId } : {}),
        })),
        total: session.messages.length,
        startedAt: session.startedAt,
        endedReason: session.endedReason,
        recruiterTyping: false,
      }
    : { status: "not_started", messages: [], total: 0, recruiterTyping: false };

  return (
    <ChatRoom
      token={token}
      firstName={candidate.confirmedDetails?.firstName || candidate.firstName || (candidate.fullName ?? "").split(" ")[0] || "there"}
      position={candidate.offer?.position || candidate.position || undefined}
      hours={settings.hours}
      kind={kind}
      reason={
        kind === "followup" ? session?.reason ?? candidate.followupReasons?.[access.link.sentAt] : undefined
      }
      initial={initial}
      reminder={isReminderId(reminder) && !session?.endedAt ? reminder : undefined}
    />
  );
}
